import {dispatchReminders} from './reminder-delivery.ts';
import { db, type Db } from "./db.ts";
import { apnsConfigFrom, sendApns, type ApnsEnvironment } from "./_lib/apns.ts";
import { fcmConfigFrom, sendFcm } from "./_lib/fcm.ts";
import { currency, lookup, text, truncate, unitLabel, windowLabel, type Row } from "./_lib/format.ts";
import { parseStart, reminderDue, reminderWhen } from "./_lib/reminders.ts";

type Env = {
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_PRIVATE_KEY?: string;
  APNS_BUNDLE_ID?: string;
  FCM_SERVICE_ACCOUNT?: string;
};

type Platform = "ios" | "android";

type Access = { regions: string[]; propertyIds: string[]; propertyNames: string[] };

type Role = "contractor" | "admin";

type RegisterBody = {
  userId: string;
  /** Set by the worker from the verified Supabase session, never by the app. */
  role?: Role;
  /** Admins: new assignment requests (property manager turn requests, residential bookings). */
  notifyRequests?: boolean;
  token: string;
  platform?: string;
  environment?: string;
  notifyJobs?: boolean;
  notifyMessages?: boolean;
  notifyReminders?: boolean;
  threadIds?: string[];
  access?: Partial<Access>;
  /** The contractor's upcoming scheduled jobs, or null/absent when the app couldn't load them. */
  upcoming?: UpcomingJob[] | null;
};

/** A scheduled job as sent by the app (raw `start_window`, like the database row). */
type UpcomingJob = { id?: unknown; start?: unknown; claimedAt?: unknown; title?: unknown; unit?: unknown; address?: unknown };

export type ReminderRow = {
  assignment_id: string;
  user_id: string;
  start_raw: string;
  start_at: number;
  has_time: number;
  due_at: number;
  title: string;
  detail: string | null;
  sent: number;
  first_seen: number;
};

export type DeviceRow = {
  token: string;
  user_id: string;
  platform: string;
  environment: string;
  notify_jobs: number;
  notify_messages: number;
  notify_requests: number;
  role: string;
  access_json: string;
};

type WebhookEvent = {
  type?: string;
  table?: string;
  record?: Row | null;
  old_record?: Row | null;
};

type Alert = {
  title: string;
  subtitle?: string;
  body: string;
  kind: "job" | "message" | "test" | "assignment" | "schedule" | "request";
  id: string;
  threadId: string;
  collapseId?: string;
};

const BOARD_STATUSES = new Set(["open", "preferred_pending"]);
const CLOSED_STATUSES = new Set(["completed", "complete", "closed", "done", "cancelled", "canceled", "declined", "qa_pending", "in_progress"]);
/** Don't send a reminder for a job that starts sooner than this. */
const REMINDER_MIN_LEAD_MS = 60 * 60_000;
/** Work that belongs to other Turnly portals; never pushed to contractors. */
const RESTRICTED_WORK = ["walkthrough", "walk through", "quality assurance", "inspection", "sales"];

/**
 * Singleton that stores contractor devices + thread membership and fans out
 * pushes for new Job Board jobs, new messages, and "job tomorrow" reminders
 * (24 hours before each scheduled job, sent by a platform alarm).
 */
export class PushHub {
  private sql: Db = db();

  constructor(private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/health") return Response.json((await this.health()));
      if (path === "/tick") return Response.json(await this.onAlarm());
      if (path === "/public-jobs") return Response.json({ ok: true, jobs: (await this.publicJobs()) });
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      switch (path) {
        case "/register": {
          const result = (await this.register(body as unknown as RegisterBody));
          await this.armAlarm();
          return Response.json(result);
        }
        case "/unregister":
          (await this.sql.exec(
            "DELETE FROM devices WHERE (token = ? OR token = ?) AND (user_id = ? OR ? = 1)",
            String(body.token ?? ""),
            String(body.token ?? "").toLowerCase(),
            String(body.userId ?? ''), body.legacy===true?1:0,
          ));
          return Response.json({ ok: true });
        case "/test":
          return Response.json(await this.sendTest(String(body.userId ?? "")));
        case "/public-sync": {
          const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : [];
          return Response.json((await this.syncPublic(rows, body.full === true)));
        }
        case "/event": {
          const result = await this.handleEvent(body as WebhookEvent);
          await this.armAlarm();
          return Response.json(result);
        }
        default:
          return new Response("not found", { status: 404 });
      }
    } catch (error) {
      console.error("PushHub error", path, error instanceof Error ? error.message : error);
      return Response.json({ ok: false, error: "Push service error" }, { status: 500 });
    }
  }

  // MARK: Devices

  private async health() {
    const sql = this.sql;
    const devices = (await sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM devices")).one().n;
    const members = (await sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM thread_members")).one().n;
    const android = (await sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE platform = 'android'")).one().n;
    const admins = (await sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM devices WHERE role = 'admin'")).one().n;
    const pending = (await sql.exec<{ n: number; next: number | null }>(
      "SELECT COUNT(*) AS n, MIN(due_at) AS next FROM reminders WHERE sent = 0 AND abandoned_at IS NULL AND start_at > ?",
      Date.now(),
    )).one();
    return {
      remindersPending: pending.n,
      nextReminderAt: pending.next ? new Date(Math.max(pending.next, Date.now())).toISOString() : null,
      ok: true,
      apnsConfigured: apnsConfigFrom(this.env) !== null,
      fcmConfigured: fcmConfigFrom(this.env) !== null,
      devices,
      iosDevices: devices - android,
      androidDevices: android,
      adminDevices: admins,
      threadMembers: members,
    };
  }

  private configured(platform: Platform): boolean {
    return platform === "android" ? fcmConfigFrom(this.env) !== null : apnsConfigFrom(this.env) !== null;
  }

  private async register(body: RegisterBody) {
    const platform: Platform = body.platform === "android" ? "android" : "ios";
    const raw = (body.token ?? "").trim();
    const token = platform === "ios" ? raw.toLowerCase() : raw;
    const valid = platform === "ios" ? /^[0-9a-f]{32,200}$/.test(token) : /^[A-Za-z0-9:_-]{32,4096}$/.test(token);
    if (!body.userId || !valid) return { ok: false, error: "Invalid device token" };
    const environment: ApnsEnvironment = body.environment === "sandbox" ? "sandbox" : "production";
    const access: Access = {
      regions: clean(body.access?.regions),
      propertyIds: clean(body.access?.propertyIds),
      propertyNames: clean(body.access?.propertyNames),
    };
    const role: Role = body.role === "admin" ? "admin" : "contractor";
    const sql = this.sql;
    (await sql.exec(
      `INSERT INTO devices (token, user_id, platform, environment, notify_jobs, notify_messages, notify_reminders, notify_requests, role, access_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET
         user_id = excluded.user_id,
         platform = excluded.platform,
         environment = excluded.environment,
         notify_jobs = excluded.notify_jobs,
         notify_messages = excluded.notify_messages,
         notify_reminders = excluded.notify_reminders,
         notify_requests = excluded.notify_requests,
         role = excluded.role,
         access_json = excluded.access_json,
         updated_at = excluded.updated_at`,
      token,
      body.userId,
      platform,
      environment,
      body.notifyJobs === false ? 0 : 1,
      body.notifyMessages === false ? 0 : 1,
      body.notifyReminders === false ? 0 : 1,
      body.notifyRequests === false ? 0 : 1,
      role,
      JSON.stringify(access),
      Date.now(),
    ));
    if (role === "contractor" && Array.isArray(body.upcoming)) (await this.syncSchedule(body.userId, body.upcoming));
    await sql.exec('DELETE FROM thread_members WHERE user_id = ?',body.userId);
    for (const threadId of clean(body.threadIds)) {
      await sql.exec("INSERT INTO thread_members (thread_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", threadId, body.userId);
    }
    return { ok: true, apnsConfigured: this.configured(platform), pushConfigured: this.configured(platform) };
  }

  // MARK: Events (Supabase database webhooks)

  private async handleEvent(event: WebhookEvent) {
    const type = (event.type ?? "").toUpperCase();
    if(event.table==='message_thread_participants'&&(type==='DELETE'||type==='UPDATE')){
      const old=event.old_record;
      if(old?.thread_id&&old?.user_id)await this.sql.exec('DELETE FROM thread_members WHERE thread_id = ? AND user_id = ?',String(old.thread_id),String(old.user_id));
    }
    if (event.table === "assignment_blocks") {
      if (type === "DELETE") {
        const id = asText(event.old_record?.id);
        if (id) {
          await this.sql.exec("DELETE FROM reminders WHERE assignment_id = ?", id);
          await this.sql.exec("DELETE FROM public_jobs WHERE id = ?", id);
        }
        return { ok: true };
      }
      if (event.record) {
        await this.reminderFromRow(event.record);
        await this.upsertPublic(event.record);
      }
    }
    const record = event.record ?? null;
    if (!record) return { ok: true, ignored: "no record" };

    switch (event.table) {
      case "assignment_blocks":
        return this.onAssignment(type, record, event.old_record ?? null);
      case "message_thread_participants": {
        const threadId = asText(record.thread_id);
        const userId = asText(record.user_id);
        if ((type === "INSERT" || type === "UPDATE") && threadId && userId) {
          const name = asText(record.display_name) ?? asText(record.full_name) ?? asText(record.name);
          (await this.sql.exec(
            `INSERT INTO thread_members (thread_id, user_id, display_name) VALUES (?, ?, ?)
             ON CONFLICT(thread_id, user_id) DO UPDATE SET display_name = COALESCE(excluded.display_name, thread_members.display_name)`,
            threadId,
            userId,
            name ? truncate(name, 80) : null,
          ));
        }
        return { ok: true };
      }
      case "message_thread_messages":
        return type === "INSERT" ? this.onMessage(record) : { ok: true, ignored: "not an insert" };
      default:
        return { ok: true, ignored: `table ${event.table ?? "unknown"}` };
    }
  }

  private async onAssignment(type: string, record: Row, old: Row | null) {
    // Admin alert first; the contractor Job Board rule below is unchanged.
    const request = isPendingRequest(record) ? await this.onAssignmentRequest(type, record, old) : null;
    if (!isOnBoard(record)) return { ok: true, request, ignored: "not on the job board" };
    if (!isContractorWork(record)) return { ok: true, ignored: "not contractor work" };
    if (type === "UPDATE" && old && isOnBoard(old)) return { ok: true, ignored: "already on the board" };
    const id = asText(record.id);
    if (!id || !(await this.claimOnce(`job-${id}`))) return { ok: true, ignored: "duplicate" };

    const title = text(record, ["title", "property_name", "company_name", "client_name"]) ?? "New assignment";
    const parts = [[title, unitLabel(record)].filter(Boolean).join(" · ")];
    const when = windowLabel(record.start_window);
    if (when) parts.push(when);
    const pay = currency(record.pay_amount);
    if (pay) parts.push(pay);

    const devices = (await this.devices("notify_jobs = 1 AND role = 'contractor'")).filter((device) => canSee(parseAccess(device.access_json), record));
    const sent = await this.deliver(devices, {
      title: "New job available",
      body: truncate(parts.join(" — "), 220),
      kind: "job",
      id,
      threadId: "turnly-jobs",
      collapseId: `job-${id}`,
    });
    return { ok: true, sent };
  }

  /** Admins: a property manager turn request or residential booking is waiting for review. */
  private async onAssignmentRequest(type: string, record: Row, old: Row | null) {
    if (type === "UPDATE" && old && isPendingRequest(old)) return { ok: true, ignored: "request already pending" };
    const id = asText(record.id);
    if (!id || !(await this.claimOnce(`request-${id}`))) return { ok: true, ignored: "duplicate" };

    const meta = (record.metadata && typeof record.metadata === "object" ? record.metadata : {}) as Row;
    const residential = (asText(meta.source) ?? "").toLowerCase().replace(/[\s_]+/g, "-") === "residential-booking";
    const title = text(record, ["title", "property_name", "company_name", "client_name"]) ?? (residential ? "Residential booking" : "Turn request");
    const parts = [[title, unitLabel(record)].filter(Boolean).join(" · ")];
    const when = windowLabel(record.start_window);
    if (when) parts.push(when);
    const requester = asText(meta.requested_by_name) ?? asText(meta.property_manager_name) ?? asText(meta.customer_name);
    if (requester) parts.push(`from ${requester}`);

    const devices = (await this.devices("notify_requests = 1 AND role = 'admin'"));
    const sent = await this.deliver(devices, {
      title: residential ? "New residential booking to review" : "New assignment request",
      body: truncate(parts.join(" — "), 220),
      kind: "request",
      id,
      threadId: "turnly-requests",
      collapseId: `request-${id}`,
    });
    return { ok: true, sent };
  }

  private async onMessage(record: Row) {
    const threadId = asText(record.thread_id);
    if (!threadId) return { ok: true, ignored: "no thread" };
    const key = `msg-${asText(record.id) ?? `${threadId}-${asText(record.created_at) ?? Date.now()}`}`;
    if (!(await this.claimOnce(key))) return { ok: true, ignored: "duplicate" };

    const senderId = asText(record.sender_id) ?? "";
    const members = (await this.sql
      .exec<{ user_id: string }>("SELECT user_id::text AS user_id FROM public.message_thread_participants WHERE thread_id::text = ? AND user_id::text != ?", threadId, senderId))
      .toArray()
      .map((row) => row.user_id);
    if (members.length === 0) return { ok: true, sent: 0, note: "no registered participants" };

    const placeholders = members.map(() => "?").join(",");
    const devices = (await this.devices(`notify_messages = 1 AND user_id IN (${placeholders})`, members));
    const body = asText(record.body) ?? asText(record.message) ?? "New message from Turnly.";
    const storedName = senderId
      ? (await this.sql
          .exec<{ display_name: string | null }>("SELECT display_name FROM thread_members WHERE thread_id = ? AND user_id = ?", threadId, senderId))
          .toArray()[0]?.display_name ?? null
      : null;
    const sent = await this.deliver(devices, {
      title: asText(record.sender_name) ?? storedName ?? "New message",
      subtitle: asText(record.subject) ?? undefined,
      body: truncate(body, 240),
      kind: "message",
      id: threadId,
      threadId: `turnly-thread-${threadId}`,
    });
    return { ok: true, sent };
  }

  private async sendTest(userId: string) {
    if (!userId) return { ok: false, error: "Missing user" };
    const devices = (await this.devices("user_id = ?", [userId]));
    if (devices.length === 0) return { ok: false, error: "This phone isn't registered for push yet." };
    const isAdmin = devices.some((device) => device.role === "admin");
    const sent = await this.deliver(devices, {
      title: "Turnly Pro notifications are on",
      body: isAdmin
        ? "You'll get alerts for new assignment requests and messages, even when the app is closed."
        : "You'll get alerts for new jobs and messages, even when the app is closed.",
      kind: "test",
      id: "test",
      threadId: "turnly-test",
    });
    if (sent > 0) return { ok: true, sent };
    const platforms = new Set(devices.map((device) => (device.platform === "android" ? "android" : "ios")));
    const missing = [...platforms].filter((platform) => !this.configured(platform));
    if (missing.includes("android")) return { ok: false, error: "Android push isn't set up on the server yet." };
    if (missing.includes("ios")) return { ok: false, error: "Apple push isn't set up on the server yet." };
    return { ok: false, error: "The push wasn't accepted. Check the push key settings." };
  }

  // MARK: Public Job Board

  /** Adds an open job to the public board, or removes it once claimed/closed. */
  private async upsertPublic(row: Row): Promise<boolean> {
    const id = asText(row.id);
    if (!id) return false;
    if (!isOnBoard(row) || !isContractorWork(row)) {
      await this.sql.exec("DELETE FROM public_jobs WHERE id = ?", id);
      return false;
    }
    const job = publicJob(row);
    const start = parseStart(asText(row.start_window));
    (await this.sql.exec(
      `INSERT INTO public_jobs (id, json, start_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, start_at = excluded.start_at, updated_at = excluded.updated_at`,
      id,
      JSON.stringify(job),
      start ? start.at : 0,
      Date.now(),
    ));
    return true;
  }

  /** Merges a fresh read of open jobs. `full` means the caller saw every job, so missing ones are gone. */
  private async syncPublic(rows: Row[], full: boolean) {
    const kept = new Set<string>();
    for (const row of rows.slice(0, 1000)) {
      if ((await this.upsertPublic(row))) kept.add(asText(row.id) as string);
    }
    if (full) {
      const existing = (await this.sql.exec<{ id: string }>("SELECT id FROM public_jobs")).toArray();
      for (const { id } of existing) if (!kept.has(id)) (await this.sql.exec("DELETE FROM public_jobs WHERE id = ?", id));
    }
    return { ok: true, open: kept.size };
  }

  private async publicJobs(): Promise<Row[]> {
    const now = Date.now();
    const sql = this.sql;
    // Past jobs and entries nobody has confirmed in three weeks drop off.
    await sql.exec("DELETE FROM public_jobs WHERE (start_at > 0 AND start_at < ?) OR updated_at < ?", now - 12 * 3_600_000, now - 21 * 86_400_000);
    return (await sql
      .exec<{ json: string }>("SELECT json FROM public_jobs ORDER BY CASE WHEN start_at = 0 THEN 1 ELSE 0 END, start_at LIMIT 300"))
      .toArray()
      .map((row) => {
        try {
          return JSON.parse(row.json) as Row;
        } catch {
          return null;
        }
      })
      .filter((row): row is Row => row !== null);
  }

  // MARK: Job reminders

  /**
   * Replaces this contractor's reminder list with the app's view of their
   * schedule. Jobs no longer on it (unassigned, cancelled, done) are dropped.
   */
  private async syncSchedule(userId: string, upcoming: UpcomingJob[]) {
    const now = Date.now();
    const kept = new Set<string>();
    for (const job of upcoming.slice(0, 100)) {
      const id = asText(job.id);
      const start = asText(job.start);
      if (!id || !start || id.length > 80) continue;
      kept.add(id);
      (await this.upsertReminder(userId, id, start, asText(job.claimedAt), {
        title: truncate(asText(job.title) ?? "your job", 120),
        detail: [asText(job.unit), asText(job.address)].filter(Boolean).join(" · ") || null,
      }));
    }
    const existing = (await this.sql
      .exec<{ assignment_id: string }>("SELECT assignment_id FROM reminders WHERE user_id = ? AND start_at > ?", userId, now))
      .toArray();
    for (const row of existing) {
      if (!kept.has(row.assignment_id)) {
        await this.sql.exec("DELETE FROM reminders WHERE assignment_id = ? AND user_id = ?", row.assignment_id, userId);
      }
    }
  }

  /** Keeps reminders in step with database changes (claimed, rescheduled, unassigned, cancelled). */
  private async reminderFromRow(row: Row) {
    const id = asText(row.id);
    if (!id) return;
    const status = (asText(row.status) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
    const owners = [asText(row.claimed_by), asText(row.assigned_to)].filter((v): v is string => v !== null);
    const closed = CLOSED_STATUSES.has(status) || Boolean(asText(row.completed_at)) || Boolean(asText(row.checklist_completed_at));
    const start = asText(row.start_window);
    const sql = this.sql;
    if (closed || owners.length === 0 || !start || !isContractorWork(row)) {
      await sql.exec("DELETE FROM reminders WHERE assignment_id = ?", id);
      return;
    }
    const placeholders = owners.map(() => "?").join(",");
    await sql.exec(`DELETE FROM reminders WHERE assignment_id = ? AND user_id NOT IN (${placeholders})`, id, ...owners);
    const title = text(row, ["title", "property_name", "company_name", "client_name"]) ?? "your job";
    const address = text(row, ["address", "property_address", "site_address", "street_address", "service_address"]);
    for (const owner of new Set(owners)) {
      (await this.upsertReminder(owner, id, start, asText(row.claimed_at), {
        title: truncate(title, 120),
        detail: [unitLabel(row), address].filter(Boolean).join(" · ") || null,
      }));
    }
  }

  private async upsertReminder(userId: string, assignmentId: string, startRaw: string, claimedAt: string | null, info: { title: string; detail: string | null }) {
    const parsed = parseStart(startRaw);
    if (!parsed) return;
    const sql = this.sql;
    const now = Date.now();
    const existing = (await sql
      .exec<ReminderRow>("SELECT * FROM reminders WHERE assignment_id = ? AND user_id = ?", assignmentId, userId))
      .toArray()[0];
    // A rescheduled job gets a fresh reminder.
    if (existing && existing.start_at === parsed.at) {
      await sql.exec("UPDATE reminders SET title = ?, detail = ? WHERE assignment_id = ? AND user_id = ?", info.title, info.detail, assignmentId, userId);
      return;
    }
    const claimed = claimedAt ? Date.parse(claimedAt) : NaN;
    const firstSeen = existing?.first_seen ?? now;
    const due = reminderDue(parsed.at, Number.isFinite(claimed) ? claimed : firstSeen);
    (await sql.exec(
      `INSERT INTO reminders (assignment_id, user_id, start_raw, start_at, has_time, due_at, title, detail, sent, first_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(assignment_id, user_id) DO UPDATE SET
         start_raw = excluded.start_raw, start_at = excluded.start_at, has_time = excluded.has_time,
         due_at = excluded.due_at, title = excluded.title, detail = excluded.detail, sent = excluded.sent, delivery_attempts=0, next_attempt_at=0, lease_id=NULL, lease_until=NULL, abandoned_at=NULL`,
      assignmentId,
      userId,
      startRaw,
      parsed.at,
      parsed.hasTime ? 1 : 0,
      due ?? parsed.at,
      info.title,
      info.detail,
      due === null ? 1 : 0,
      firstSeen,
    ));
  }

  /** Drops reminders for jobs that are long past. (Sending is driven by the minute tick from pg_cron.) */
  private async armAlarm() {
    await this.sql.exec("DELETE FROM reminders WHERE start_at < ?", Date.now() - 2 * 86_400_000);
  }

  /** Minute tick (pg_cron): send every reminder that's due. Safe to run twice or concurrently. */
  async onAlarm(): Promise<{ok:true;due:number;sent:number}> {
    return dispatchReminders(this.sql,async(device,row)=>(await this.deliver([device],reminderAlert([row],Date.now())))>0);
  }

  // MARK: Delivery

  private async devices(where: string, params: unknown[] = []): Promise<DeviceRow[]> {
    return (await this.sql.exec<DeviceRow>(`SELECT * FROM devices WHERE ${where}`, ...params)).toArray();
  }

  /** Records a dedupe key; false if it was already sent (webhooks may retry). */
  private async claimOnce(key: string): Promise<boolean> {
    const sql = this.sql;
    await sql.exec("DELETE FROM sent WHERE sent_at < ?", Date.now() - 14 * 86_400_000);
    // Atomic: concurrent webhook retries can't both win.
    const inserted = (await sql.exec("INSERT INTO sent (key, sent_at) VALUES (?, ?) ON CONFLICT (key) DO NOTHING RETURNING key", key, Date.now())).toArray();
    return inserted.length > 0;
  }

  private async deliver(devices: DeviceRow[], alert: Alert): Promise<number> {
    const android = devices.filter((device) => device.platform === "android");
    const ios = devices.filter((device) => device.platform !== "android");
    const [a, b] = await Promise.all([this.deliverFcm(android, alert), this.deliverApns(ios, alert)]);
    return a + b;
  }

  private async deliverFcm(devices: DeviceRow[], alert: Alert): Promise<number> {
    if (devices.length === 0) return 0;
    const config = fcmConfigFrom(this.env);
    if (!config) {
      console.warn("FCM is not configured; skipped", alert.kind, "push to", devices.length, "Android devices");
      return 0;
    }
    const data: Record<string, string> = {
      title: alert.title,
      body: alert.body,
      kind: alert.kind,
      id: alert.id,
      group: alert.threadId,
      ...(alert.subtitle ? { subtitle: alert.subtitle } : {}),
    };
    let sent = 0;
    await Promise.all(
      devices.map(async (device) => {
        const result = await sendFcm(config, device.token, data, alert.collapseId);
        if (result.ok) {
          sent += 1;
          return;
        }
        console.warn("FCM rejected push", result.status, result.reason);
        if (result.unregistered) (await this.sql.exec("DELETE FROM devices WHERE token = ?", device.token));
      }),
    );
    return sent;
  }

  private async deliverApns(devices: DeviceRow[], alert: Alert): Promise<number> {
    if (devices.length === 0) return 0;
    const config = apnsConfigFrom(this.env);
    if (!config) {
      console.warn("APNs is not configured; skipped", alert.kind, "push to", devices.length, "devices");
      return 0;
    }
    const payload = {
      aps: {
        alert: { title: alert.title, ...(alert.subtitle ? { subtitle: alert.subtitle } : {}), body: alert.body },
        sound: "default",
        "thread-id": alert.threadId,
      },
      kind: alert.kind,
      id: alert.id,
    };

    let sent = 0;
    await Promise.all(
      devices.map(async (device) => {
        const primary = device.environment === "sandbox" ? "sandbox" : "production";
        let result = await sendApns(config, device.token, primary, payload, alert.collapseId);
        if (!result.ok && (result.reason === "BadDeviceToken" || result.reason === "BadEnvironmentKeyInToken")) {
          // Debug builds use the sandbox gateway, store builds production.
          const other: ApnsEnvironment = primary === "sandbox" ? "production" : "sandbox";
          result = await sendApns(config, device.token, other, payload, alert.collapseId);
          if (result.ok) (await this.sql.exec("UPDATE devices SET environment = ? WHERE token = ?", other, device.token));
        }
        if (result.ok) {
          sent += 1;
          return;
        }
        console.warn("APNs rejected push", result.status, result.reason);
        if (result.status === 410 || result.reason === "BadDeviceToken" || result.reason === "Unregistered") {
          await this.sql.exec("DELETE FROM devices WHERE token = ?", device.token);
        }
      }),
    );
    return sent;
  }
}

// MARK: Helpers

/** One job: "Job tomorrow at 9:00 AM". Several in the same run: a single summary. */
function reminderAlert(rows: ReminderRow[], now: number): Alert {
  if (rows.length === 1) {
    const row = rows[0];
    const when = reminderWhen(row.start_at, row.has_time === 1, now);
    return {
      title: `Job ${when}`,
      body: truncate([row.title, row.detail].filter(Boolean).join(" · ") + ". Tap to see details and directions.", 230),
      kind: "assignment",
      id: row.assignment_id,
      threadId: "turnly-reminders",
      collapseId: `reminder-${row.assignment_id}`,
    };
  }
  const list = rows.map((row) => `${row.title} (${reminderWhen(row.start_at, row.has_time === 1, now)})`);
  return {
    title: `${rows.length} jobs in the next 24 hours`,
    body: truncate(list.join(", "), 230),
    kind: "schedule",
    id: "schedule",
    threadId: "turnly-reminders",
    collapseId: `reminders-${Math.floor(now / 3_600_000)}`,
  };
}

/**
 * The public view of an open job: what the work is, the area, when, and the pay.
 * Street address, unit number, access notes, gate codes, and instructions stay private.
 */
const KNOWN_CITIES = [
  "Chapel Hill", "Wake Forest", "Holly Springs", "Fuquay-Varina", "Morrisville", "Hillsborough", "Carrboro",
  "Durham", "Raleigh", "Cary", "Apex", "Garner", "Knightdale", "Wendell", "Clayton", "Mebane", "Burlington",
  "Greensboro", "Pittsboro", "Wilmington", "Charlotte",
];

function tidyCity(value: string): string {
  const trimmed = value.trim();
  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function publicJob(row: Row): Row {
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Row;
  const pick = (keys: string[]) => {
    for (const key of keys) {
      const value = asText(row[key]) ?? asText(meta[key]);
      if (value) return value;
    }
    return null;
  };
  const address = pick(["address", "property_address", "site_address", "street_address", "service_address"]);
  let city = pick(["region", "market", "city", "service_area"]);
  let state = pick(["state"]);
  if (address && (!city || !state)) {
    const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
    let stateIndex = -1;
    parts.forEach((part, index) => {
      if (index > 0 && /^[A-Za-z]{2}( \d{5}(-\d{4})?)?$/.test(part)) stateIndex = index;
    });
    if (stateIndex > 0) {
      city = city ?? parts[stateIndex - 1];
      state = state ?? parts[stateIndex].slice(0, 2).toUpperCase();
    } else {
      // "Durham NC 27701" in one segment
      for (const part of parts.slice(1)) {
        const match = part.match(/^(.+?)\s+([A-Za-z]{2})(\s+\d{5}(-\d{4})?)?$/);
        if (match && !/\d/.test(match[1])) {
          city = city ?? match[1];
          state = state ?? match[2].toUpperCase();
          break;
        }
      }
      if (!city && parts.length >= 2 && !/^\d/.test(parts[parts.length - 1])) city = parts[parts.length - 1];
    }
  }
  if (!city) {
    // Last resort: a known service-area city mentioned anywhere on the job.
    const haystack = JSON.stringify([row.title, row.property_name, row.community_name, address, meta]).toLowerCase();
    const known = KNOWN_CITIES.find((name) => haystack.includes(name.toLowerCase()));
    if (known) city = known;
  }
  if (city) city = tidyCity(city);
  if (city && !state) state = "NC";
  const pay = Number(row.pay_amount);
  const service = (pick(["service_type", "assignment_type", "clean_type", "job_type"]) ?? "").toLowerCase();
  const kind = (pick(["property_type", "client_type", "category", "segment"]) ?? "").toLowerCase();
  const commercial = /commercial|office|retail|church|daycare|business|warehouse/.test(`${service} ${kind}`);
  let cleanType = "Standard Clean";
  if (/deep/.test(service)) cleanType = "Deep Clean";
  else if (/move|turn/.test(service)) cleanType = "Move-Out Clean";
  // Public listing: unit, service type, city, and pay only. Property names, addresses,
  // dates, scope, and access details never leave Supabase for guests.
  const rawUnit = pick(["unit_number", "unit_name"]);
  const unit = rawUnit
    ? (/^(unit\b|#)/i.test(rawUnit) || /[a-z]{3,}/i.test(rawUnit) ? tidyCity(rawUnit) : `Unit ${rawUnit}`)
    : null;
  const rawService = pick(["service_type", "assignment_type", "job_type"]);
  const serviceLabel = rawService ? tidyCity(rawService.replace(/[_-]+/g, " ")) : null;
  const job: Row = {
    id: asText(row.id),
    unit,
    service: serviceLabel,
    city,
    state,
    category: commercial ? "Commercial" : "Residential",
    clean_type: cleanType,
    pay_amount: Number.isFinite(pay) && pay > 0 ? pay : null,
  };
  for (const key of Object.keys(job)) if (job[key] === null) delete job[key];
  return job;
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function clean(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => asText(value)).filter((value): value is string => value !== null))];
}

function isOnBoard(row: Row): boolean {
  const status = (asText(row.status) ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  return BOARD_STATUSES.has(status) && !asText(row.claimed_by) && !asText(row.assigned_to) && !asText(row.completed_at);
}

/** Same rule as the admin app's pending turn request: a manager request or booking waiting for approval. */
function isPendingRequest(row: Row): boolean {
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Row;
  const norm = (value: unknown) => (asText(value) ?? "").toLowerCase().replace(/[\s_]+/g, "-");
  const source = norm(meta.source);
  const approval = norm(meta.admin_approval_status);
  const status = norm(row.status);
  return ["property-manager-turn-request", "residential-booking"].includes(source)
    && !["approved", "complete", "completed", "cancelled", "canceled", "declined"].includes(approval)
    && ["pending", "pending-approval", "preferred-pending"].includes(status);
}

function isContractorWork(row: Row): boolean {
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Row;
  const values = ["service_type", "assignment_type", "job_type", "category"]
    .flatMap((key) => [asText(row[key]), asText(meta[key])])
    .filter((v): v is string => v !== null)
    .map((v) => v.toLowerCase().replace(/[_-]+/g, " "));
  return !values.some((v) => RESTRICTED_WORK.some((word) => v.includes(word)) || v.split(" ").includes("qa"));
}

function parseAccess(json: string): Access {
  try {
    const value = JSON.parse(json) as Partial<Access>;
    return { regions: clean(value.regions), propertyIds: clean(value.propertyIds), propertyNames: clean(value.propertyNames) };
  } catch {
    return { regions: [], propertyIds: [], propertyNames: [] };
  }
}

/** Same rule as the app/portal: limit to allowed regions/properties when any are set. */
function canSee(access: Access, row: Row): boolean {
  if (access.regions.length === 0 && access.propertyIds.length === 0 && access.propertyNames.length === 0) return true;
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Row;
  const pick = (keys: string[]) => keys.flatMap((key) => [asText(row[key]), asText(meta[key])]).filter((v): v is string => v !== null);
  const ids = pick(["property_id", "portal_property_id", "recurring_property_id", "recurring_portal_property_id", "client_id", "contract_id"]);
  const names = pick(["property_name", "title", "name", "company_name", "client_name", "address", "property_address", "service_address"]);
  const regions = pick(["region", "market", "location", "city", "state", "address", "property_address", "service_address"]);
  // Portal job zones are stored as "ST:City" (e.g. "NC:Durham"); match those on the city name.
  const regionValues = access.regions.map((value) => value.replace(/^[A-Za-z]{2}:/, ""));
  return matches(access.propertyIds, ids) || matches(access.propertyNames, names) || matches(regionValues, regions);
}

function matches(allowed: string[], candidates: string[]): boolean {
  const allowedValues = allowed.map(lookup).filter(Boolean);
  const candidateValues = candidates.map(lookup).filter(Boolean);
  return allowedValues.some((a) => candidateValues.some((c) => c === a || c.includes(a) || a.includes(c)));
}

