import { db, type Db } from "./db.ts";
import { buildSignedPdf, sha256Hex, validateTemplate } from "./_lib/signing.ts";
import { supabaseBase, userHeaders, type SupabaseEnv } from "./_lib/supabase.ts";
import { CHECKLIST_V2, SEED_ITEMS, SEED_VERSION, V2_UPDATES } from "./_lib/onboarding-seed.ts";
import { fillW9, w9Problem, type W9Values } from "./_lib/w9.ts";
import { importKey, openBytes, openText, sealBytes, sealText, sealedKeyId, type KeyId } from "./_lib/vault.ts";

/**
 * Contractor onboarding: an admin-editable checklist (documents to sign,
 * files to upload, videos to watch), each contractor's signed copies and
 * uploads, and the rule that decides when a contractor may claim jobs.
 *
 * One singleton instance ("global"). Files are kept in SQLite in 1 MB chunks
 * (rows are limited to 2 MB) and served through short-lived signed links.
 */

type Env = SupabaseEnv & {
  /** Encrypts SSN/EIN, bank numbers, and stored files. Never change it once set. */
  ONBOARDING_DATA_KEY?: string;
};

/**
 * `background` = the one Verified First background screening step. Turnly sends the
 * invitation by email; the applicant consents and pays on Verified First; only an
 * admin "mark" (after reviewing the report) completes it.
 */
export type ItemKind = "sign" | "upload" | "video" | "form" | "background";
const KINDS: readonly ItemKind[] = ["sign", "upload", "video", "form", "background"];
const CHECKLIST_V4_VERIFIED_FIRST = "checklist_v4_verified_first";
/** Stable id of the single required background screening item. */
export const BACKGROUND_ITEM_ID = "background-check-verified-first";
const BACKGROUND_TITLE = "Background Check (Verified First)";
const BACKGROUND_DESCRIPTION =
  "Turnly orders your background screening through Verified First. Watch for an email invitation from Verified First, " +
  "then follow it to give your consent and pay the screening fee directly on Verified First's secure site. " +
  "Turnly reviews the results and must approve this step before you can claim jobs. There is nothing to upload here; " +
  "this step updates on its own once Turnly approves it.";
/** Manual progress an admin can show the applicant (never report details). */
const BACKGROUND_PROGRESS: Record<string, string> = {
  needs_invitation: "Turnly is preparing your Verified First invitation.",
  invited: "Invitation sent. Check your email from Verified First to give consent and pay.",
  in_progress: "Verified First is running your screening.",
  awaiting_review: "Screening finished. Turnly is reviewing it.",
  on_hold: "On hold. Turnly will contact you.",
  approved: "Approved by Turnly.",
  grandfathered: "Existing contractor exception: you were approved before Verified First screening began.",
};

/**
 * Grandfathered exception (not a screening approval). Contractors Turnly had already
 * approved, with their paperwork on file (or waived) before this fixed rollout cutoff,
 * keep working without a Verified First check. New applicants never qualify, and any
 * tracking (manual progress, a mark, or a reset after the cutoff) ends the exception.
 */
export const BACKGROUND_GRANDFATHER_CUTOFF_ISO = "2026-10-28T00:00:00Z";
const BACKGROUND_GRANDFATHER_CUTOFF = Date.parse(BACKGROUND_GRANDFATHER_CUTOFF_ISO);

/** Server-read facts used to decide the exception: Supabase profile approval, account age, portal waivers. */
type GrandfatherEvidence = { approved: boolean | null; createdAt: string | null; waived: Set<string> };

/** A Checkr webhook the worker already verified (signature) and enriched with the candidate's email. */
type CheckrEvent = {
  type: string;
  email: string | null;
  candidateId: string | null;
  reportId: string | null;
  invitationId: string | null;
  status: string | null;
  result: string | null;
  adjudication: string | null;
};

type ItemRow = {
  id: string;
  kind: ItemKind;
  title: string;
  description: string | null;
  required: number;
  active: number;
  sort: number;
  fields_json: string;
  video_url: string | null;
  requires_expiration: number;
  requires_review: number;
  version: number;
  min_version: number;
  file_id: string | null;
  file_name: string | null;
  file_sha: string | null;
  page_count: number | null;
  created_at: number;
  updated_at: number;
  deleted: number;
};

type SubmissionRow = {
  id: string;
  user_id: string;
  item_id: string;
  item_title: string;
  kind: string;
  version: number;
  status: "complete" | "pending" | "approved" | "rejected";
  signer_name: string | null;
  fields_json: string;
  file_id: string | null;
  file_name: string | null;
  expiration_date: string | null;
  ip: string | null;
  user_agent: string | null;
  reviewer_note: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  mirror_status: string | null;
  /** Path of the portal copy in the contractor-documents bucket (matches contractor_documents.storage_path). */
  portal_path: string | null;
  source: string;
  created_at: number;
};

type FileRow = { id: string; name: string; mime: string; size: number; sha: string; chunks: number; created_at: number; sealed: KeyId | null };

type QuestionType =
  | "text" | "long" | "number" | "date" | "phone" | "email"
  | "choice" | "multi" | "yesno" | "check" | "routing" | "account" | "tin";
const QUESTION_TYPES: readonly QuestionType[] = [
  "text", "long", "number", "date", "phone", "email", "choice", "multi", "yesno", "check", "routing", "account", "tin",
];

/** Only show a question when another question (by id or w9 tag) has this answer. */
type Condition = { ref: string; value: string };

/**
 * One question asked in the app (forms) or while signing (sign items).
 * `sensitive` answers are masked on PDFs and in the portal copy; `confirm`
 * makes the app ask twice; `prefill` = name | email | phone from the profile.
 */
type Question = {
  id: string;
  label: string;
  type: QuestionType;
  required: boolean;
  section: string | null;
  options: string[];
  help: string | null;
  sensitive: boolean;
  confirm: boolean;
  prefill: string | null;
  /** Saves the answer to the contractor's onboarding profile (the intake form). */
  save: string | null;
  /** Filled from the contractor's onboarding profile and shown locked; asked only if the profile doesn't have it yet. */
  profile: string | null;
  /** IRS Form W-9 line this answers (used to fill the official form). */
  w9: string | null;
  when: Condition | null;
};

/** Sensitive answers are stored sealed (see vault.ts) with a masked copy for display. */
type Answer = { id: string; label: string; section: string | null; value: string; sensitive: boolean; masked?: string };

const PROFILE_KEY = /^[a-z][a-z0-9_]{0,39}$/;

type Identity = { userId: string; email: string | null; name: string | null; role: "contractor" | "admin" };

const CHUNK = 1_000_000;
const MAX_FILE = 15 * 1024 * 1024;
const LINK_TTL_SECONDS = 15 * 60;
const CONSENT =
  "By typing my name and tapping Sign, I agree that this is my electronic signature, that I have read the document above, " +
  "and that I intend to be bound by it to the same extent as a handwritten signature. I consent to doing business " +
  "electronically with Turnly Professional Cleaners and can ask Turnly for a paper copy at any time.";
const UPLOAD_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic"]);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (value: unknown, status = 200) => Response.json(value, { status });
const now = () => Date.now();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanLongText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}

const MAX_QUESTIONS = 150;
const PREFILL_KEY = /^[a-z][a-z0-9_]{0,39}$/;

function uniqueIds(questions: Omit<Question, "id">[], ids: (string | null)[]): Question[] {
  const seen = new Set<string>();
  return questions.map((question, index) => {
    const base = (ids[index] && /^[\w.-]{1,90}$/.test(ids[index] ?? "") ? ids[index] : null) ??
      `${question.section ? `${slug(question.section).slice(0, 30)}.` : ""}${slug(question.label).slice(0, 50)}`;
    let id = base as string;
    for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
    seen.add(id);
    return { id, ...question };
  });
}

function normalizeQuestion(raw: Record<string, unknown>): Omit<Question, "id"> | null {
  const label = cleanText(raw.label, 400);
  if (!label) return null;
  const type = QUESTION_TYPES.find((t) => t === raw.type) ?? "text";
  let options = Array.isArray(raw.options) ? raw.options.map((o) => cleanText(o, 80)).filter(Boolean).slice(0, 30) : [];
  if (type === "yesno") options = ["Yes", "No"];
  if (type !== "choice" && type !== "multi" && type !== "yesno") options = [];
  const prefill = typeof raw.prefill === "string" && PREFILL_KEY.test(raw.prefill) ? raw.prefill : null;
  const key = (value: unknown) => (typeof value === "string" && PROFILE_KEY.test(value) ? value : null);
  const rawWhen = raw.when as Partial<Condition> | null | undefined;
  const when = rawWhen && typeof rawWhen.ref === "string" && typeof rawWhen.value === "string" && rawWhen.ref && rawWhen.value
    ? { ref: cleanText(rawWhen.ref, 90), value: cleanText(rawWhen.value, 80) }
    : null;
  return {
    save: key(raw.save),
    profile: key(raw.profile),
    w9: typeof raw.w9 === "string" && /^[\w-]{1,20}$/.test(raw.w9) ? raw.w9.toLowerCase() : null,
    when,
    label,
    type: (type === "choice" || type === "multi") && options.length === 0 ? "text" : type,
    required: raw.required !== false,
    section: cleanText(raw.section, 80) || null,
    options,
    help: cleanText(raw.help, 300) || null,
    sensitive: raw.sensitive === true,
    confirm: raw.confirm === true,
    prefill,
  };
}

/** Questions stored as JSON. Older items stored only { label, required }. */
function parseFields(jsonText: string | null | undefined): Question[] {
  try {
    const value = JSON.parse(jsonText ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    const rows = value.slice(0, MAX_QUESTIONS) as Record<string, unknown>[];
    const pairs = rows.map((row) => [normalizeQuestion(row ?? {}), typeof row?.id === "string" ? row.id : null] as const);
    const kept = pairs.filter((pair) => pair[0] !== null) as [Omit<Question, "id">, string | null][];
    return uniqueIds(kept.map((pair) => pair[0]), kept.map((pair) => pair[1]));
  } catch {
    return [];
  }
}

/**
 * The admin page edits questions as text, one per line:
 *   ## Section title
 *   Label *  [type: Option A | Option B, sensitive, confirm, prefill=name] -- help text
 * `*` marks required. Types: text long number date phone email choice multi
 * yesno check routing account.
 */
function parseQuestionText(text: string): Question[] {
  const questions: Omit<Question, "id">[] = [];
  let section: string | null = null;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) {
      section = cleanText(line.replace(/^#+/, ""), 80) || null;
      continue;
    }
    let help: string | null = null;
    const helpAt = line.indexOf(" -- ");
    if (helpAt >= 0) {
      help = line.slice(helpAt + 4).trim() || null;
      line = line.slice(0, helpAt).trim();
    }
    const props: Record<string, unknown> = { section, help, type: "text" };
    const bracket = line.match(/\[([^\]]*)\]\s*\*?\s*$/);
    let required = false;
    if (bracket && bracket.index !== undefined) {
      required = /\*\s*$/.test(line);
      line = line.slice(0, bracket.index).trim();
      for (const token of bracket[1].split(",").map((t) => t.trim()).filter(Boolean)) {
        const lower = token.toLowerCase();
        if (lower === "sensitive") props.sensitive = true;
        else if (lower === "confirm") props.confirm = true;
        else if (lower === "optional") props.optional = true;
        else if (lower.startsWith("prefill=")) props.prefill = lower.slice(8).trim();
        else if (lower.startsWith("save=")) props.save = lower.slice(5).trim();
        else if (lower.startsWith("profile=")) props.profile = lower.slice(8).trim();
        else if (lower.startsWith("w9=")) props.w9 = lower.slice(3).trim();
        else if (lower.startsWith("when=")) {
          const [ref, ...rest] = token.slice(5).split(":");
          props.when = { ref: ref.trim().toLowerCase(), value: rest.join(":").trim() };
        } else {
          const colon = token.indexOf(":");
          const typeName = (colon >= 0 ? token.slice(0, colon) : token).trim().toLowerCase();
          if (QUESTION_TYPES.includes(typeName as QuestionType)) props.type = typeName;
          if (colon >= 0) props.options = token.slice(colon + 1).split("|").map((o) => o.trim()).filter(Boolean);
        }
      }
    }
    if (line.endsWith("*")) {
      required = true;
      line = line.slice(0, -1).trim();
    }
    const question = normalizeQuestion({ ...props, label: line, required });
    if (question) questions.push(question);
    if (questions.length >= MAX_QUESTIONS) break;
  }
  return resolveConditions(uniqueIds(questions, questions.map(() => null)));
}

/** Points each `when` at the referenced question's id (written as an id or a w9 tag); drops broken ones. */
function resolveConditions(questions: Question[]): Question[] {
  return questions.map((q) => {
    if (!q.when) return q;
    const ref = q.when.ref.toLowerCase();
    const target = questions.find((other) => other !== q && (other.id === q.when?.ref || other.w9 === ref));
    return { ...q, when: target ? { ref: target.id, value: q.when.value } : null };
  });
}

/** Inverse of parseQuestionText, for the admin page's editor. */
function questionsToText(questions: Question[]): string {
  let section: string | null = null;
  const lines: string[] = [];
  for (const q of questions) {
    if (q.section !== section) {
      section = q.section;
      if (lines.length) lines.push("");
      lines.push(`## ${section ?? ""}`.trim());
    }
    const props = [q.type + (q.options.length && q.type !== "yesno" ? `: ${q.options.join(" | ")}` : "")];
    if (q.sensitive) props.push("sensitive");
    if (q.confirm) props.push("confirm");
    if (q.prefill) props.push(`prefill=${q.prefill}`);
    if (q.save) props.push(`save=${q.save}`);
    if (q.profile) props.push(`profile=${q.profile}`);
    if (q.w9) props.push(`w9=${q.w9}`);
    if (q.when) {
      const target = questions.find((other) => other.id === q.when?.ref);
      props.push(`when=${target?.w9 ?? q.when.ref}:${q.when.value}`);
    }
    lines.push(`${q.label}${q.required ? " *" : ""} [${props.join(", ")}]${q.help ? ` -- ${q.help}` : ""}`);
  }
  return lines.join("\n");
}

function abaValid(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

function mask(value: string): string {
  const compact = value.replace(/\s+/g, "");
  return compact.length > 4 ? `****${compact.slice(-4)}` : "****";
}

/** True when a `when` condition matches the raw answer it points at. */
function conditionMet(q: Question, raw: Record<string, unknown>): boolean {
  if (!q.when) return true;
  const answer = raw[q.when.ref];
  const want = q.when.value.toLowerCase();
  if (Array.isArray(answer)) return answer.some((v) => String(v).toLowerCase() === want);
  if (answer === true) return want === "yes" || want === "agreed" || want === "true";
  return typeof answer === "string" && answer.trim().toLowerCase() === want;
}

/**
 * Validates and normalizes the app's answers into display strings. Questions
 * hidden by a condition are left out; profile-linked questions the app didn't
 * send are filled from the contractor's saved onboarding profile.
 */
function readAnswers(questions: Question[], raw: Record<string, unknown>, profile: Record<string, string> = {}): Answer[] {
  const short = (label: string) => (label.length > 70 ? `${label.slice(0, 67)}...` : label);
  return questions.filter((q) => conditionMet(q, raw)).map((q) => {
    const sent = raw[q.id] ?? raw[q.label];
    const fromProfile = q.profile && profile[q.profile] !== undefined ? profile[q.profile] : undefined;
    const input = (sent === undefined || sent === "") && fromProfile !== undefined ? fromProfile : sent;
    let value = "";
    switch (q.type) {
      case "multi": {
        const picked = (Array.isArray(input) ? input : typeof input === "string" && input ? input.split("|") : []).map((v) => cleanText(v, 80));
        const valid = q.options.filter((option) => picked.some((p) => p.toLowerCase() === option.toLowerCase()));
        value = valid.join(", ");
        if (q.required && !value) throw new HttpError(400, `Choose at least one: "${short(q.label)}".`);
        return { id: q.id, label: q.label, section: q.section, value, sensitive: q.sensitive };
      }
      case "check": {
        const agreed = input === true || input === "true" || input === "Agreed" || input === "Yes";
        if (q.required && !agreed) throw new HttpError(400, `Check "${short(q.label)}".`);
        return { id: q.id, label: q.label, section: q.section, value: agreed ? "Agreed" : "Not checked", sensitive: false };
      }
      case "yesno":
        value = input === true ? "Yes" : input === false ? "No" : cleanText(input, 10);
        break;
      case "long":
        value = cleanLongText(input, 2000);
        break;
      default:
        value = cleanText(typeof input === "number" ? String(input) : input, 300);
    }
    if (!value) {
      if (q.required) throw new HttpError(400, `Answer "${short(q.label)}".`);
      return { id: q.id, label: q.label, section: q.section, value: "", sensitive: q.sensitive };
    }
    const bad = (message: string) => new HttpError(400, `${short(q.label)}: ${message}`);
    switch (q.type) {
      case "number":
        if (!/^-?\d+(\.\d+)?$/.test(value.replace(/,/g, ""))) throw bad("enter a number.");
        break;
      case "date":
        if (!validDate(value)) throw bad("choose a date.");
        break;
      case "phone":
        if (value.replace(/\D/g, "").length < 10) throw bad("enter a 10-digit phone number.");
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw bad("enter a valid email.");
        break;
      case "routing":
        value = value.replace(/\D/g, "");
        if (!abaValid(value)) throw bad("enter the 9-digit routing number from your check.");
        break;
      case "account":
        value = value.replace(/[\s-]/g, "");
        if (!/^\d{4,17}$/.test(value)) throw bad("enter 4 to 17 digits.");
        break;
      case "tin":
        value = value.replace(/\D/g, "");
        if (value.length !== 9) throw bad("enter all 9 digits.");
        break;
      case "choice":
      case "yesno": {
        const match = q.options.find((option) => option.toLowerCase() === value.toLowerCase());
        if (!match) throw bad("choose one of the options.");
        value = match;
        break;
      }
    }
    return { id: q.id, label: q.label, section: q.section, value, sensitive: q.sensitive };
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null;
}

function safeFileName(value: string | null, fallback: string): string {
  const cleaned = (value ?? "")
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document";
}

const PORTAL_APPROVED = new Set(["approved", "verified", "valid", "active", "accepted", "complete", "completed"]);
const PORTAL_REJECTED = new Set(["rejected", "declined", "denied", "sent_back", "needs_changes"]);

/** approved | rejected for a contractor_documents.status, else null (pending, submitted, ...). */
function portalDecision(status: unknown): "approved" | "rejected" | null {
  const token = String(status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return PORTAL_APPROVED.has(token) ? "approved" : PORTAL_REJECTED.has(token) ? "rejected" : null;
}

/** A reviewer's note on a portal row, skipping the notes this service writes itself. */
function portalNote(record: Record<string, unknown>): string | null {
  for (const key of ["rejection_reason", "review_notes", "reviewer_notes", "review_note", "admin_notes", "notes"]) {
    const text = cleanText(record[key], 300);
    if (text && !/^(Signed in Turnly Pro|Uploaded in Turnly Pro|Marked on file by Turnly|Approved in the Turnly portal)/.test(text)) return text;
  }
  return null;
}

/** Admin view of stored answers: sensitive values replaced by their masked copy. */
function adminFields(text: string): unknown {
  const parsed = safeJson(text);
  if (!Array.isArray(parsed)) return parsed;
  return (parsed as Answer[]).map((answer) =>
    answer && answer.sensitive && answer.value
      ? { ...answer, value: null, sealed: true, masked: answer.masked ?? (sealedKeyId(answer.value) ? "****" : mask(answer.value)) }
      : answer,
  );
}

export class OnboardingHub {
  private seeding: Promise<void> | null = null;
  private sealing: Promise<void> | null = null;
  private sealedWith: KeyId | null = null;
  private sealRetryAt = 0;
  private keys = new Map<KeyId, CryptoKey>();

  private sql: Db = db();

  constructor(private env: Env) {}

  // MARK: Encryption

  /** The ONBOARDING_DATA_KEY secret once it's set; until then a key kept in this hub's storage. */
  private currentKeyId(): KeyId {
    return (this.env.ONBOARDING_DATA_KEY ?? "").trim().length >= 16 ? "env" : "local";
  }

  private async keyFor(id: KeyId): Promise<CryptoKey> {
    const cached = this.keys.get(id);
    if (cached) return cached;
    let secret: string | undefined;
    if (id === "env") {
      secret = (this.env.ONBOARDING_DATA_KEY ?? "").trim() || undefined;
    } else {
      const sql = this.sql;
      secret = (await sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'data_key_local'")).toArray()[0]?.value;
      if (!secret && this.currentKeyId() === "local") {
        secret = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
        await sql.exec("INSERT INTO meta (key, value) VALUES ('data_key_local', ?) ON CONFLICT (key) DO NOTHING", secret);
        secret = (await sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'data_key_local'")).one().value;
      }
    }
    if (!secret) throw new Error(`Encryption key "${id}" is not available.`);
    if (id === "env") {
      // Guard against a changed secret: data sealed with the old one would become unreadable.
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`turnly-fp:${secret}`)));
      const fingerprint = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const sql = this.sql;
      const saved = (await sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'data_key_fp'")).toArray()[0]?.value;
      if (!saved) (await sql.exec("INSERT INTO meta (key, value) VALUES ('data_key_fp', ?) ON CONFLICT (key) DO NOTHING", fingerprint));
      else if (saved !== fingerprint) {
        throw new HttpError(500, "ONBOARDING_DATA_KEY was changed. Put the original value back; stored documents can't be opened without it.");
      }
    }
    const key = await importKey(secret);
    this.keys.set(id, key);
    return key;
  }

  /** Seals sensitive answers before they're stored. */
  private async sealAnswers(answers: Answer[]): Promise<Answer[]> {
    const id = this.currentKeyId();
    const key = await this.keyFor(id);
    return Promise.all(
      answers.map(async (answer) =>
        answer.sensitive && answer.value ? { ...answer, value: await sealText(key, id, answer.value), masked: mask(answer.value) } : answer,
      ),
    );
  }

  private async openAnswer(value: string): Promise<string> {
    const id = sealedKeyId(value);
    return id ? openText(await this.keyFor(id), value) : value;
  }

  private ensureSealed(): Promise<void> {
    const current = this.currentKeyId();
    if (this.sealedWith === current || Date.now() < this.sealRetryAt) return Promise.resolve();
    this.sealing ??= (async () => {
        try {
          await this.sealEverything(current);
          this.sealedWith = current;
        } catch (error) {
          this.sealRetryAt = Date.now() + 5 * 60_000;
          console.error("Sealing onboarding data failed", error instanceof Error ? error.message : error);
        }
      })()
      .finally(() => {
        this.sealing = null;
      });
    return this.sealing;
  }

  /**
   * Encrypts everything stored before encryption existed (or under the
   * temporary local key) with the current key. Runs once per key change.
   */
  private sealEverything(current: KeyId): Promise<void> {
    // One sealer at a time across all edge instances (advisory lock held for the transaction).
    return this.sql.transaction(async (sql) => {
    await sql.exec("SELECT pg_advisory_xact_lock(4242001)");
    if ((await sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'vault_key'")).toArray()[0]?.value === current) return;
    const key = await this.keyFor(current);

    const files = (await sql.exec<FileRow>("SELECT * FROM files WHERE sealed IS NULL OR sealed != ?", current)).toArray();
    for (const file of files) {
      const from = file.sealed ? await this.keyFor(file.sealed) : null;
      const chunks = (await sql
        .exec<{ idx: number; data: ArrayBuffer }>("SELECT idx, data FROM file_chunks WHERE file_id = ? ORDER BY idx", file.id))
        .toArray();
      const resealed: { idx: number; data: ArrayBuffer }[] = [];
      for (const chunk of chunks) {
        const plain = from ? await openBytes(from, new Uint8Array(chunk.data)) : new Uint8Array(chunk.data);
        resealed.push({ idx: chunk.idx, data: (await sealBytes(key, plain)).buffer });
      }
      for (const chunk of resealed) await sql.exec("UPDATE file_chunks SET data = ? WHERE file_id = ? AND idx = ?", chunk.data, file.id, chunk.idx);
      await sql.exec("UPDATE files SET sealed = ? WHERE id = ?", current, file.id);
    }

    const rows = (await sql
      .exec<{ id: string; fields_json: string }>("SELECT id, fields_json FROM submissions WHERE fields_json LIKE '%\"sensitive\":true%'"))
      .toArray();
    for (const row of rows) {
      const parsed = safeJson(row.fields_json);
      if (!Array.isArray(parsed)) continue;
      let changed = false;
      const out: Answer[] = [];
      for (const answer of parsed as Answer[]) {
        if (answer?.sensitive && answer.value && sealedKeyId(answer.value) !== current) {
          const plain = await this.openAnswer(answer.value);
          out.push({ ...answer, value: await sealText(key, current, plain), masked: answer.masked ?? mask(plain) });
          changed = true;
        } else {
          out.push(answer);
        }
      }
      if (changed) (await sql.exec("UPDATE submissions SET fields_json = ? WHERE id = ?", JSON.stringify(out), row.id));
    }

    await sql.exec("INSERT INTO meta (key, value) VALUES ('vault_key', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", current);
    if (current === "env") {
      // Everything is under the secret now; the stored key would only weaken it.
      await sql.exec("DELETE FROM meta WHERE key = 'data_key_local'");
      this.keys.delete("local");
    }
    console.log("Onboarding data sealed", { key: current, files: files.length, submissions: rows.length });
    });
  }

  private async profileOf(userId: string): Promise<Record<string, string>> {
    const row = (await this.sql
      .exec<{ data_json: string }>("SELECT data_json FROM onboarding_profiles WHERE user_id = ?", userId))
      .toArray()[0];
    if (!row) return this.backfillProfile(userId);
    const parsed = safeJson(row.data_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  }

  /** Contractors who submitted forms before the profile existed: rebuild it from their latest answers. */
  private async backfillProfile(userId: string): Promise<Record<string, string>> {
    let saved = false;
    for (const item of (await this.items(true))) {
      const questions = parseFields(item.fields_json);
      if (!questions.some((q) => q.save)) continue;
      const submission = (await this.latestSubmission(userId, item.id));
      const answers = submission ? safeJson(submission.fields_json) : null;
      if (!Array.isArray(answers) || answers.length === 0) continue;
      await this.saveProfile(userId, questions, answers as Answer[]);
      saved = true;
    }
    if (!saved) return {};
    const row = (await this.sql
      .exec<{ data_json: string }>("SELECT data_json FROM onboarding_profiles WHERE user_id = ?", userId))
      .toArray()[0];
    const parsed = row ? safeJson(row.data_json) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  }

  /** Saves answers to questions linked to the profile (save= / profile=) so other forms don't ask again. */
  private async saveProfile(userId: string, questions: Question[], answers: Answer[]) {
    const existing = (await this.sql
      .exec<{ data_json: string }>("SELECT data_json FROM onboarding_profiles WHERE user_id = ?", userId))
      .toArray()[0];
    const parsed = existing ? safeJson(existing.data_json) : null;
    const data = (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as Record<string, string>;
    let changed = false;
    for (const answer of answers) {
      const question = questions.find((q) => q.id === answer.id);
      const key = question?.save ?? question?.profile;
      if (!key || !answer.value || answer.sensitive) continue;
      data[key] = answer.value;
      changed = true;
    }
    const touched = answers.some((a) => ["city", "state", "zip"].includes(questions.find((q) => q.id === a.id)?.save ?? ""));
    if (touched && data.city && data.state && data.zip) data.city_state_zip = `${data.city}, ${data.state} ${data.zip}`;
    if (!changed) return;
    (await this.sql.exec(
      `INSERT INTO onboarding_profiles (user_id, data_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
      userId,
      JSON.stringify(data),
      now(),
    ));
  }

  /**
   * One-time update of the live checklist (Oct 2026): intake first and trimmed,
   * contact details asked once and reused, W-9 filled in the app. Items whose
   * title an admin changed are left alone.
   */
  private async migrateChecklist() {
    const sql = this.sql;
    if ((await sql.exec("SELECT value FROM meta WHERE key = ?", CHECKLIST_V2)).toArray().length > 0) return;
    if ((await sql.exec("SELECT value FROM meta WHERE key = ?", SEED_VERSION)).toArray().length === 0) return;
    for (const update of V2_UPDATES) {
      const item = (await sql.exec<ItemRow>("SELECT * FROM items WHERE title = ? AND deleted = 0", update.title)).toArray()[0];
      if (!item) continue;
      (await this.saveItem(item.id, {
        ...(update.kind ? { kind: update.kind } : {}),
        ...(update.description ? { description: update.description } : {}),
        ...(update.questions !== undefined ? { fieldsText: update.questions } : {}),
      }));
      await sql.exec("UPDATE items SET sort = ? WHERE id = ?", update.sort, item.id);
    }
    await sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", CHECKLIST_V2, new Date().toISOString());
  }

  /**
   * Keeps exactly one active, required Verified First background item with a
   * stable id. The first run converts the old (hidden) Checkr step, moving its
   * history to the new id, or creates the step; later runs only re-assert the
   * invariants (one item, required, visible, no link) and leave admin text edits alone.
   */
  private async ensureBackgroundCheck() {
    const sql = this.sql;
    if ((await sql.exec("SELECT value FROM meta WHERE key = ?", SEED_VERSION)).toArray().length === 0) return;
    const rows = (await sql
      .exec<ItemRow>("SELECT * FROM items WHERE (kind = 'background' AND deleted = 0) OR id = ? ORDER BY active DESC, created_at ASC", BACKGROUND_ITEM_ID))
      .toArray();
    const current = rows.find((row) => row.id === BACKGROUND_ITEM_ID);
    const migrated = (await sql.exec("SELECT value FROM meta WHERE key = ?", CHECKLIST_V4_VERIFIED_FIRST)).toArray().length > 0;
    const healthy = current && rows.length === 1 && current.kind === "background" && current.deleted === 0 &&
      current.active === 1 && current.required === 1 && !current.video_url && current.requires_review === 1;
    if (healthy && migrated) return;
    const stamp = now();
    await this.sql.transaction(async (sql) => {
      if (!current) {
        const legacy = rows[0];
        if (legacy) {
          await sql.exec("UPDATE items SET id = ? WHERE id = ?", BACKGROUND_ITEM_ID, legacy.id);
          await sql.exec("UPDATE submissions SET item_id = ? WHERE item_id = ?", BACKGROUND_ITEM_ID, legacy.id);
          await sql.exec("UPDATE item_versions SET item_id = ? WHERE item_id = ?", BACKGROUND_ITEM_ID, legacy.id);
        } else {
          const sort = (await sql.exec<{ n: number }>("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM items")).one().n;
          (await sql.exec(
            `INSERT INTO items (id, kind, title, description, required, active, sort, fields_json, video_url, requires_expiration, requires_review, created_at, updated_at)
             VALUES (?, 'background', ?, ?, 1, 1, ?, '[]', NULL, 0, 1, ?, ?)`,
            BACKGROUND_ITEM_ID, BACKGROUND_TITLE, BACKGROUND_DESCRIPTION, sort, stamp, stamp,
          ));
        }
      }
      if (!migrated) {
        await sql.exec("UPDATE items SET title = ?, description = ? WHERE id = ?", BACKGROUND_TITLE, BACKGROUND_DESCRIPTION, BACKGROUND_ITEM_ID);
      }
      (await sql.exec(
        `UPDATE items SET kind = 'background', deleted = 0, active = 1, required = 1, video_url = NULL, requires_review = 1,
           requires_expiration = 0, fields_json = '[]', updated_at = ? WHERE id = ?`,
        stamp, BACKGROUND_ITEM_ID,
      ));
      // Never more than one background step.
      await sql.exec("UPDATE items SET deleted = 1, active = 0, updated_at = ? WHERE kind = 'background' AND id != ? AND deleted = 0", stamp, BACKGROUND_ITEM_ID);
      await sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", CHECKLIST_V4_VERIFIED_FIRST, new Date().toISOString());
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      await this.ensureSeeded();
      await this.migrateChecklist();
      await this.ensureBackgroundCheck();
      await this.ensureSealed();
      if (path.startsWith("/file/")) return await this.serveFile(path.slice(6), url);
      // Set only by the worker after it checked the webhook secret.
      if (path === "/internal/portal-event" && request.headers.get("X-Portal-Verified") === "1") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") throw new HttpError(400, "Invalid payload.");
        return json((await this.portalEvent(body as Record<string, unknown>)));
      }
      // Set only by the worker after it checked the Checkr signature.
      if (path === "/internal/checkr-event" && request.headers.get("X-Checkr-Verified") === "1") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") throw new HttpError(400, "Invalid payload.");
        return json(this.checkrEvent(body as CheckrEvent));
      }
      if (path === "/health") {
        const items = (await this.items(false));
        const sql = this.sql;
        const seeded = (await sql.exec("SELECT value FROM meta WHERE key = ?", SEED_VERSION)).toArray().length > 0;
        const unsealed = (await sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM files WHERE sealed IS NULL OR sealed != ?", this.currentKeyId())).one().n;
        return json({
          ok: true,
          seeded,
          encryption: { key: this.currentKeyId() === "env" ? "secret" : "temporary", filesNotYetSealed: unsealed },
          items: items.map((item) => ({ kind: item.kind, title: item.title, questions: parseFields(item.fields_json).length, hasDocument: Boolean(item.file_id), pages: item.page_count })),
        });
      }
      const identity = this.identity(request);
      if (!identity) throw new HttpError(401, "Sign in to continue.");
      const origin = request.headers.get("X-Origin") ?? url.origin;
      return identity.role === "admin"
        ? await this.adminRoute(request, path, identity, origin)
        : await this.contractorRoute(request, path, identity, origin);
    } catch (error) {
      if (error instanceof HttpError) return json({ ok: false, error: error.message }, error.status);
      console.error("OnboardingHub error", path, error instanceof Error ? error.stack ?? error.message : error);
      return json({ ok: false, error: "The onboarding service hit an error. Try again." }, 500);
    }
  }

  /**
   * Loads Turnly's starting checklist (with its PDFs) the first time the hub is
   * used. Runs once: never again after any item exists, so admin edits stick.
   */
  private async ensureSeeded(): Promise<void> {
    // Production data was migrated. Never fetch external templates or seed over
    // a missing restore; restore the owned backup instead.
    if ((await this.sql.exec("SELECT value FROM meta WHERE key = ?", SEED_VERSION)).toArray().length === 0)
      throw new HttpError(503, "Onboarding data needs restoration. Contact Turnly.");
  }

  private identity(request: Request): Identity | null {
    const userId = request.headers.get("X-User-Id");
    const role = request.headers.get("X-User-Role");
    if (!userId || (role !== "contractor" && role !== "admin")) return null;
    return {
      userId,
      email: request.headers.get("X-User-Email") || null,
      name: request.headers.get("X-User-Name") || null,
      role,
    };
  }

  // MARK: Contractor routes

  private async contractorRoute(request: Request, path: string, who: Identity, origin: string): Promise<Response> {
    await this.touchContractor(who.userId, who.email, who.name);
    if (path === "/status" && request.method === "GET") {
      const approvedHeader = request.headers.get("X-Profile-Approved");
      const evidence: GrandfatherEvidence = {
        approved: approvedHeader === "1" ? true : approvedHeader === "0" ? false : null,
        createdAt: request.headers.get("X-Profile-Created") || null,
        waived: new Set((request.headers.get("X-Portal-Waived") ?? "").split(",").map((id) => id.trim()).filter(Boolean)),
      };
      await this.refreshGrandfather(who.userId, evidence);
      return json((await this.status(who.userId, origin)));
    }
    if (path === "/account-deletion" && request.method === "POST") {
      // Works for applicants too (no portal access yet); Turnly deletes the account from the admin page list.
      await this.sql.exec("UPDATE contractors SET deletion_requested_at = ? WHERE user_id = ?", now(), who.userId);
      return json({ ok: true });
    }

    const itemMatch = path.match(/^\/items\/([\w-]+)\/(document|sign|submit|upload|watched|checkr)$/);
    if (itemMatch) {
      const item = (await this.activeItem(itemMatch[1]));
      switch (itemMatch[2]) {
        case "document":
          if (!item.file_id) throw new HttpError(404, "This item has no document.");
          return json({ ok: true, url: await this.link(origin, item.file_id), fileName: item.file_name });
        case "sign":
        case "submit":
          return json(await this.sign(request, item, who, origin));
        case "upload":
          return json(await this.upload(request, item, who, origin));
        case "watched":
          return json((await this.watched(item, who, origin)));
        case "checkr":
          throw new HttpError(410, "Turnly emails your Verified First invitation. This step updates when Turnly approves it.");
      }
    }

    const linkMatch = path.match(/^\/submissions\/([\w-]+)\/link$/);
    if (linkMatch) {
      const submission = (await this.submission(linkMatch[1]));
      if (submission.user_id !== who.userId || !submission.file_id) throw new HttpError(404, "File not found.");
      return json({ ok: true, url: await this.link(origin, submission.file_id), fileName: submission.file_name });
    }
    throw new HttpError(404, "Not found.");
  }

  private async touchContractor(userId: string, email: string | null, name: string | null) {
    (await this.sql.exec(
      `INSERT INTO contractors (user_id, email, name, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET email = COALESCE(excluded.email, contractors.email), name = COALESCE(excluded.name, contractors.name), last_seen = excluded.last_seen`,
      userId,
      email,
      name,
      now(),
    ));
  }

  private async items(includeInactive: boolean): Promise<ItemRow[]> {
    const where = includeInactive ? "deleted = 0" : "deleted = 0 AND active = 1";
    return (await this.sql.exec<ItemRow>(`SELECT * FROM items WHERE ${where} ORDER BY sort ASC, created_at ASC`)).toArray();
  }

  private async activeItem(id: string): Promise<ItemRow> {
    const row = (await this.sql.exec<ItemRow>("SELECT * FROM items WHERE id = ? AND deleted = 0 AND active = 1", id)).toArray()[0];
    if (!row) throw new HttpError(404, "This checklist item was removed. Pull to refresh.");
    return row;
  }

  private async submission(id: string): Promise<SubmissionRow> {
    const row = (await this.sql.exec<SubmissionRow>("SELECT * FROM submissions WHERE id = ?", id)).toArray()[0];
    if (!row) throw new HttpError(404, "Submission not found.");
    return row;
  }

  private async latestSubmission(userId: string, itemId: string): Promise<SubmissionRow | null> {
    return (
      (await this.sql
        .exec<SubmissionRow>(
          "SELECT * FROM submissions WHERE user_id = ? AND item_id = ? ORDER BY created_at DESC LIMIT 1",
          userId,
          itemId,
        ))
        .toArray()[0] ?? null
    );
  }

  /** todo · done · in_review · rejected · expired · resign (document changed since signing). */
  private state(item: ItemRow, submission: SubmissionRow | null): string {
    if (!submission) return "todo";
    // Only a Turnly admin's mark completes the background check; uploads, payment,
    // self-attestation, or an old Checkr result never do.
    if (item.kind === "background") {
      if (submission.status === "rejected") return "rejected";
      return submission.source === "admin" && submission.status === "approved" ? "done" : "todo";
    }
    if (submission.status === "rejected") return "rejected";
    if (item.kind === "sign" && submission.source !== "admin" && submission.version < item.min_version) return "resign";
    if (submission.expiration_date && submission.expiration_date < todayISO()) return "expired";
    if (submission.status === "pending") return "in_review";
    return "done";
  }

  private publicItem(item: ItemRow) {
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      description: item.description,
      required: item.required === 1,
      active: item.active === 1,
      version: item.version,
      fields: parseFields(item.fields_json),
      videoUrl: item.kind === "background" ? null : item.video_url,
      requiresExpiration: item.requires_expiration === 1,
      requiresReview: item.requires_review === 1,
      questionCount: parseFields(item.fields_json).length,
      hasDocument: Boolean(item.file_id),
      documentName: item.file_name,
      pageCount: item.page_count,
    };
  }

  private publicSubmission(row: SubmissionRow | null, includeFields: boolean) {
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      signerName: row.signer_name,
      fileName: row.file_name,
      hasFile: Boolean(row.file_id),
      expirationDate: row.expiration_date,
      reviewerNote: row.reviewer_note,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
      mirrorStatus: row.mirror_status,
      portalPath: row.portal_path,
      ...(includeFields
        ? { fields: adminFields(row.fields_json), ip: row.ip, userAgent: row.user_agent }
        : { answers: ownAnswers(row.fields_json) }),
    };
  }

  // MARK: Grandfathered background exception

  /** Tracking that ends (or rules out) the exception: manual progress, or any background decision after the cutoff, or a reset. */
  private async backgroundTracked(userId: string, item: ItemRow): Promise<boolean> {
    const sql = this.sql;
    if ((await sql.exec("SELECT 1 FROM background_progress WHERE user_id = ? AND item_id = ? LIMIT 1", userId, item.id)).toArray().length > 0) return true;
    const latest = (await this.latestSubmission(userId, item.id));
    if (!latest) return false;
    return latest.status === "rejected" || latest.created_at > BACKGROUND_GRANDFATHER_CUTOFF;
  }

  /**
   * Returns the basis text when this contractor qualifies, else null. Requires: Turnly's
   * persisted approval (profiles.contractor_approved = true), an account not created after
   * the cutoff, no background tracking, and every required non-background step that existed
   * before the cutoff either on file (accepted, not rejected or pending) before the cutoff or waived by Turnly.
   */
  private async grandfatherBasis(userId: string, evidence: GrandfatherEvidence): Promise<string | null> {
    if (evidence.approved !== true) return null;
    const created = evidence.createdAt ? Date.parse(evidence.createdAt) : Number.NaN;
    if (!Number.isNaN(created) && created > BACKGROUND_GRANDFATHER_CUTOFF) return null;
    const items = (await this.items(false));
    const background = items.find((item) => item.kind === "background");
    if (!background || (await this.backgroundTracked(userId, background))) return null;
    let onFile = 0;
    let waived = 0;
    for (const item of items) {
      if (item.required !== 1 || item.kind === "background" || item.created_at > BACKGROUND_GRANDFATHER_CUTOFF) continue;
      if (evidence.waived.has(item.id)) {
        waived += 1;
        continue;
      }
      const accepted = (await this.sql
        .exec(
          "SELECT 1 FROM submissions WHERE user_id = ? AND item_id = ? AND created_at <= ? AND status IN ('complete', 'approved') LIMIT 1",
          userId, item.id, BACKGROUND_GRANDFATHER_CUTOFF,
        ))
        .toArray().length > 0;
      if (!accepted) return null;
      onFile += 1;
    }
    // Without a known account date, require real pre-cutoff paperwork in this hub.
    if (Number.isNaN(created) && onFile === 0) return null;
    return `contractor_approved=true; account created ${evidence.createdAt ?? "unknown"}; ${onFile} required step(s) on file and ${waived} waived before ${BACKGROUND_GRANDFATHER_CUTOFF_ISO}`;
  }

  /** Records or withdraws the exception from server-read evidence. Unknown approval leaves it unchanged. */
  private async refreshGrandfather(userId: string, evidence: GrandfatherEvidence) {
    const sql = this.sql;
    if (evidence.approved === null) return;
    const basis = (await this.grandfatherBasis(userId, evidence));
    if (basis) {
      (await sql.exec(
        "INSERT INTO background_grandfather (user_id, granted_at, basis) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING",
        userId, now(), basis,
      ));
    } else {
      await sql.exec("DELETE FROM background_grandfather WHERE user_id = ?", userId);
    }
  }

  /** The active exception for this contractor, if recorded and not ended by tracking. */
  private async grandfathered(userId: string, item: ItemRow): Promise<{ grantedAt: number; basis: string } | null> {
    if (item.kind !== "background") return null;
    const row = (await this.sql
      .exec<{ granted_at: number; basis: string }>("SELECT granted_at, basis FROM background_grandfather WHERE user_id = ?", userId))
      .toArray()[0];
    if (!row || (await this.backgroundTracked(userId, item))) return null;
    return { grantedAt: row.granted_at, basis: row.basis };
  }

  /** Checklist state including the exception (background only; real decisions always win). */
  private async effectiveState(userId: string, item: ItemRow, submission: SubmissionRow | null): Promise<{ state: string; grandfather: { grantedAt: number; basis: string } | null }> {
    const state = this.state(item, submission);
    if (item.kind !== "background" || state === "done") return { state, grandfather: null };
    const grandfather = (await this.grandfathered(userId, item));
    return grandfather ? { state: "done", grandfather } : { state, grandfather: null };
  }

  /** Admin-set manual progress for the background step (display only). */
  private async backgroundProgress(userId: string, item: ItemRow, state: string, grandfathered = false) {
    if (item.kind !== "background") return undefined;
    if (grandfathered) return { status: "grandfathered", label: BACKGROUND_PROGRESS.grandfathered };
    if (state === "done") return { status: "approved", label: BACKGROUND_PROGRESS.approved };
    const row = (await this.sql
      .exec<{ status: string; updated_at: number }>("SELECT status, updated_at FROM background_progress WHERE user_id = ? AND item_id = ?", userId, item.id))
      .toArray()[0];
    const status = row && row.status !== "approved" ? row.status : "needs_invitation";
    return { status, label: BACKGROUND_PROGRESS[status] ?? BACKGROUND_PROGRESS.needs_invitation, updatedAt: row ? new Date(row.updated_at).toISOString() : null };
  }

  /** What a contractor may see of their background submission: state only, never notes, files, or report references. */
  private contractorSubmission(item: ItemRow, row: SubmissionRow | null) {
    if (item.kind !== "background") return this.publicSubmission(row, false);
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      version: row.version,
      signerName: null,
      fileName: null,
      hasFile: false,
      expirationDate: null,
      reviewerNote: null,
      reviewedAt: null,
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
      mirrorStatus: null,
      portalPath: null,
      answers: {},
    };
  }

  private async status(userId: string, _origin: string) {
    const items = await Promise.all((await this.items(false)).map(async (item) => {
      const submission = (await this.latestSubmission(userId, item.id));
      const { state, grandfather } = (await this.effectiveState(userId, item, submission));
      const progress = (await this.backgroundProgress(userId, item, state, Boolean(grandfather)));
      return {
        ...this.publicItem(item),
        state,
        submission: this.contractorSubmission(item, submission),
        ...(progress ? { progress } : {}),
        ...(grandfather ? { grandfathered: true } : {}),
      };
    }));
    const required = items.filter((item) => item.required);
    const done = required.filter((item) => item.state === "done").length;
    return {
      ok: true,
      complete: done === required.length,
      requiredCount: required.length,
      doneCount: done,
      consent: CONSENT,
      profile: (await this.profileOf(userId)),
      items,
    };
  }

  /** Signs a document (sign items) or submits and signs an in-app form (form items). */
  private async sign(request: Request, item: ItemRow, who: Identity, origin: string) {
    if (item.kind !== "sign" && item.kind !== "form") throw new HttpError(400, "This item isn't a document to sign.");
    const body = (await request.json().catch(() => ({}))) as { signerName?: unknown; fields?: unknown; consent?: unknown };
    const signerName = cleanText(body.signerName, 120);
    if (signerName.length < 3 || !/\s/.test(signerName)) throw new HttpError(400, "Type your full legal name to sign.");
    if (body.consent !== true) throw new HttpError(400, "Agree to sign electronically to continue.");

    const raw = (body.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, unknown>;
    const questions = parseFields(item.fields_json);
    const answers = readAnswers(questions, raw, (await this.profileOf(who.userId)));
    let printed = answers
      .filter((answer) => answer.value || item.kind === "form")
      .map((answer) => ({ label: answer.label, section: answer.section, value: answer.sensitive && answer.value ? mask(answer.value) : answer.value || "-" }));
    const signedAt = new Date();

    // Forms print their answers; an attached PDF on a form is only a reference copy,
    // except the IRS W-9, which is filled in with the answers.
    let template = item.kind === "sign" && item.file_id ? await this.readFile(item.file_id) : null;
    if (item.kind === "form" && item.file_id && questions.some((q) => q.w9)) {
      const values: W9Values = {};
      for (const answer of answers) {
        const tag = questions.find((q) => q.id === answer.id)?.w9;
        if (tag) values[tag] = answer.value;
      }
      const problem = w9Problem(values);
      if (problem) throw new HttpError(400, problem);
      try {
        template = await fillW9(await this.readFile(item.file_id), values, signerName, signedAt);
        printed = [];
      } catch (error) {
        console.error("W-9 fill failed; saving answers PDF instead", error instanceof Error ? error.message : error);
      }
    }
    const pdf = await buildSignedPdf(template, {
      documentTitle: item.title,
      description: item.description,
      version: Math.max(item.version, 1),
      templateSha256: template ? item.file_sha : null,
      signerName,
      email: who.email,
      userId: who.userId,
      signedAt,
      ip: request.headers.get("X-Client-IP"),
      userAgent: cleanText(request.headers.get("X-Client-UA"), 200) || null,
      fields: printed,
      consent: CONSENT,
    });
    const fileName = `${slug(item.title)}-${item.kind === "form" ? "submitted" : "signed"}-${signedAt.toISOString().slice(0, 10)}.pdf`;
    const file = await this.storeFile(pdf, fileName, "application/pdf");
    const submission = (await this.insertSubmission({
      user_id: who.userId,
      item,
      status: item.requires_review === 1 ? "pending" : "complete",
      signer_name: signerName,
      fields_json: JSON.stringify(await this.sealAnswers(answers)),
      file_id: file.id,
      file_name: fileName,
      expiration_date: null,
      ip: request.headers.get("X-Client-IP"),
      user_agent: cleanText(request.headers.get("X-Client-UA"), 200) || null,
      source: "app",
    }));
    await this.saveProfile(who.userId, questions, answers);
    await this.mirror(request, submission, pdf, "application/pdf", who);
    return { ok: true, submission: this.publicSubmission((await this.submission(submission.id)), false), status: (await this.status(who.userId, origin)) };
  }

  private async upload(request: Request, item: ItemRow, who: Identity, origin: string) {
    if (item.kind === "background") {
      throw new HttpError(400, "Nothing to upload for the background check. Turnly emails your Verified First invitation and approves this step after reviewing it.");
    }
    if (item.kind !== "upload") throw new HttpError(400, "This item doesn't take an upload.");
    const mime = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!UPLOAD_MIME.has(mime)) throw new HttpError(400, "Upload a PDF or a photo (JPEG or PNG).");
    const expiration = validDate(request.headers.get("X-Expiration-Date"));
    if (item.requires_expiration === 1) {
      if (!expiration) throw new HttpError(400, "Enter the expiration date.");
      if (expiration < todayISO()) throw new HttpError(400, "That date has already passed. Upload a current document.");
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0) throw new HttpError(400, "The file was empty.");
    if (bytes.length > MAX_FILE) throw new HttpError(413, "Files must be 15 MB or smaller.");
    const extension = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/heic" ? "heic" : "jpg";
    const fileName = safeFileName(decodeHeader(request.headers.get("X-File-Name")), `${slug(item.title)}.${extension}`);
    const file = await this.storeFile(bytes, fileName, mime);
    const submission = (await this.insertSubmission({
      user_id: who.userId,
      item,
      status: item.requires_review === 1 ? "pending" : "complete",
      signer_name: null,
      fields_json: "{}",
      file_id: file.id,
      file_name: fileName,
      expiration_date: expiration,
      ip: request.headers.get("X-Client-IP"),
      user_agent: cleanText(request.headers.get("X-Client-UA"), 200) || null,
      source: "app",
    }));
    await this.mirror(request, submission, bytes, mime, who);
    return { ok: true, submission: this.publicSubmission((await this.submission(submission.id)), false), status: (await this.status(who.userId, origin)) };
  }

  private async watched(item: ItemRow, who: Identity, origin: string) {
    if (item.kind !== "video") throw new HttpError(400, "This item isn't a video.");
    (await this.insertSubmission({
      user_id: who.userId,
      item,
      status: "complete",
      signer_name: null,
      fields_json: "{}",
      file_id: null,
      file_name: null,
      expiration_date: null,
      ip: null,
      user_agent: null,
      source: "app",
    }));
    return { ok: true, status: (await this.status(who.userId, origin)) };
  }

  /** Checkr webhooks are superseded by the manual Verified First flow: they never change the checklist. */
  private checkrEvent(_event: CheckrEvent) {
    return { ok: true, ignored: "Checkr is no longer used; Turnly reviews Verified First reports manually." };
  }

  private async insertSubmission(input: {
    user_id: string;
    item: ItemRow;
    status: SubmissionRow["status"];
    signer_name: string | null;
    fields_json: string;
    file_id: string | null;
    file_name: string | null;
    expiration_date: string | null;
    ip: string | null;
    user_agent: string | null;
    source: string;
    reviewer?: string | null;
    note?: string | null;
  }): Promise<SubmissionRow> {
    const id = newId("sub");
    const created = now();
    (await this.sql.exec(
      `INSERT INTO submissions (id, user_id, item_id, item_title, kind, version, status, signer_name, fields_json, file_id, file_name,
         expiration_date, ip, user_agent, reviewer_note, reviewed_by, reviewed_at, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.user_id,
      input.item.id,
      input.item.title,
      input.item.kind,
      input.item.version,
      input.status,
      input.signer_name,
      input.fields_json,
      input.file_id,
      input.file_name,
      input.expiration_date,
      input.ip,
      input.user_agent,
      input.note ?? null,
      input.reviewer ?? null,
      input.reviewer ? created : null,
      input.source,
      created,
    ));
    return this.submission(id);
  }

  /**
   * Best effort: also file the document in the portal's `contractor_documents`
   * (private `contractor-documents` bucket) as the contractor. If Turnly's
   * database rules don't allow it, the copy here is still the record, and an
   * admin can retry with "Sync to portal" (runs with the admin's access).
   */
  private async mirror(request: Request, submission: SubmissionRow, bytes: Uint8Array, mime: string, _who: Identity) {
    const token = request.headers.get("X-Supabase-Auth");
    if (!token) return;
    await this.copyToPortal(token, submission, bytes, mime);
  }

  /** Uploads one submission's file to the portal bucket and adds its contractor_documents row. Returns "ok" or why not. */
  private async copyToPortal(token: string, submission: SubmissionRow, bytes: Uint8Array, mime: string): Promise<string> {
    const base = supabaseBase(this.env);
    const headers = userHeaders(this.env, token);
    const path = submission.portal_path ?? `${submission.user_id}/onboarding/${submission.id}-${(submission.file_name ?? "file").replace(/[^\w.-]+/g, "_")}`;
    let status = "ok";
    try {
      const upload = await fetch(`${base}/storage/v1/object/contractor-documents/${path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": mime, "x-upsert": "true" },
        body: bytes as BodyInit,
      });
      if (!upload.ok) throw new Error(`storage ${upload.status} ${(await upload.text()).slice(0, 120)}`);
      const row = {
        profile_id: submission.user_id,
        contractor_id: submission.user_id,
        document_type: slug(submission.item_title).replace(/-/g, "_"),
        title: submission.item_title,
        status: portalStatus(submission.status),
        expiration_date: submission.expiration_date,
        storage_bucket: "contractor-documents",
        storage_path: path,
        file_name: submission.file_name,
        mime_type: mime,
        file_size: bytes.length,
        notes: submission.status === "rejected" && submission.reviewer_note
          ? submission.reviewer_note
          : submission.signer_name ? `Signed in Turnly Pro by ${submission.signer_name}` : "Uploaded in Turnly Pro",
        uploaded_at: new Date(submission.created_at).toISOString(),
      };
      // A copy may already exist (the upload succeeded before but the row failed, or a retry).
      const existing = await fetch(
        `${base}/rest/v1/contractor_documents?storage_path=eq.${encodeURIComponent(path)}&select=id&limit=1`,
        { headers },
      );
      const found = existing.ok ? ((await existing.json().catch(() => [])) as unknown[]) : [];
      if (found.length === 0) {
        const insert = await fetch(`${base}/rest/v1/contractor_documents`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(row),
        });
        if (!insert.ok) throw new Error(`table ${insert.status} ${(await insert.text()).slice(0, 160)}`);
      }
    } catch (error) {
      status = `skipped: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240);
      console.warn("Portal copy skipped", submission.id, status);
    }
    (await this.sql.exec(
      "UPDATE submissions SET mirror_status = ?, portal_path = CASE WHEN ? = 'ok' THEN ? ELSE portal_path END WHERE id = ?",
      status,
      status,
      path,
      submission.id,
    ));
    return status;
  }

  /** Tells the portal about a review decision made here, so contractor_documents.status matches. */
  private async pushStatus(token: string | null, submission: SubmissionRow) {
    if (!token || !submission.portal_path) return;
    const base = supabaseBase(this.env);
    const patch: Record<string, unknown> = { status: portalStatus(submission.status) };
    if (submission.status === "rejected" && submission.reviewer_note) patch.notes = submission.reviewer_note;
    try {
      const response = await fetch(`${base}/rest/v1/contractor_documents?storage_path=eq.${encodeURIComponent(submission.portal_path)}`, {
        method: "PATCH",
        headers: { ...userHeaders(this.env, token), "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) console.warn("Portal status update failed", submission.id, response.status, (await response.text()).slice(0, 160));
    } catch (error) {
      console.warn("Portal status update failed", submission.id, error instanceof Error ? error.message : error);
    }
  }

  /**
   * A contractor_documents row changed in the portal (Supabase database webhook).
   * Approving or rejecting it there approves or sends back the matching item here.
   */
  private async portalEvent(event: Record<string, unknown>) {
    const record = (event.record ?? null) as Record<string, unknown> | null;
    const table = String(event.table ?? "contractor_documents");
    if (table !== "contractor_documents" || !record) return { ok: true, ignored: "not a contractor_documents change" };
    const path = typeof record.storage_path === "string" ? record.storage_path : null;
    if (!path) return { ok: true, ignored: "no storage_path" };
    const submission = (await this.sql
      .exec<SubmissionRow>("SELECT * FROM submissions WHERE portal_path = ? ORDER BY created_at DESC LIMIT 1", path))
      .toArray()[0];
    if (!submission) return { ok: true, ignored: "not an onboarding document" };
    const decision = portalDecision(record.status);
    if (!decision) return { ok: true, ignored: `status ${String(record.status ?? "")}` };
    if (submission.status === decision || (decision === "approved" && submission.status === "complete")) {
      return { ok: true, unchanged: true };
    }
    const note = decision === "rejected" ? portalNote(record) ?? "Sent back in the Turnly portal. Open the item to see what to fix." : null;
    (await this.sql.exec(
      "UPDATE submissions SET status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      decision,
      note,
      "Turnly portal",
      now(),
      submission.id,
    ));
    console.log("Portal review applied", { submission: submission.id, decision });
    return { ok: true, submission: submission.id, applied: decision };
  }

  /** Copies files that aren't in the portal yet (latest per contractor and item), a batch at a time. */
  private async syncToPortal(token: string | null) {
    if (!token) throw new HttpError(401, "Sign in again to sync.");
    const rows = (await this.sql
      .exec<SubmissionRow>(
        `SELECT s.* FROM submissions s
         WHERE s.file_id IS NOT NULL AND (s.mirror_status IS NULL OR s.mirror_status != 'ok')
           AND s.created_at = (SELECT MAX(created_at) FROM submissions t WHERE t.user_id = s.user_id AND t.item_id = s.item_id)
         ORDER BY s.created_at ASC`,
      ))
      .toArray();
    const batch = rows.slice(0, 15);
    let copied = 0;
    const failures: { submissionId: string; title: string; reason: string }[] = [];
    for (const row of batch) {
      const file = (await this.fileRow(row.file_id as string));
      const status = await this.copyToPortal(token, row, await this.readFile(file.id), file.mime);
      if (status === "ok") copied += 1;
      else failures.push({ submissionId: row.id, title: row.item_title, reason: status });
    }
    return { ok: true, copied, failed: failures.length, remaining: rows.length - batch.length, failures: failures.slice(0, 5) };
  }

  /**
   * Everything the portal needs to show onboarding, in one call: each contractor's
   * contact details, checklist state, latest submission per item (private answers
   * masked), and short-lived file links.
   */
  private async exportAll(origin: string, sinceIso: string | null) {
    const sql = this.sql;
    const since = sinceIso && !Number.isNaN(Date.parse(sinceIso)) ? Date.parse(sinceIso) : 0;
    const userIds = (await sql
      .exec<{ user_id: string }>(
        `SELECT user_id FROM contractors UNION SELECT user_id FROM submissions UNION SELECT user_id FROM onboarding_profiles`,
      ))
      .toArray()
      .map((r) => r.user_id);
    const items = (await this.items(false));
    const contractors = [];
    for (const userId of userIds) {
      const changed = (await sql
        .exec<{ n: number }>(
          `SELECT MAX(t) AS n FROM (
             SELECT MAX(COALESCE(reviewed_at, created_at)) AS t FROM submissions WHERE user_id = ?
             UNION ALL SELECT updated_at FROM onboarding_profiles WHERE user_id = ?)`,
          userId,
          userId,
        ))
        .one().n ?? 0;
      if (since && changed < since) continue;
      const person = (await sql.exec<{ email: string | null; name: string | null; last_seen: number }>("SELECT * FROM contractors WHERE user_id = ?", userId)).toArray()[0];
      const checklist = [];
      for (const item of items) {
        const submission = (await this.latestSubmission(userId, item.id));
        const { state, grandfather } = (await this.effectiveState(userId, item, submission));
        checklist.push({
          itemId: item.id,
          title: item.title,
          kind: item.kind,
          required: item.required === 1,
          state,
          grandfathered: grandfather
            ? { label: "Grandfathered exception (not a screening approval)", grantedAt: new Date(grandfather.grantedAt).toISOString(), basis: grandfather.basis }
            : null,
          submission: submission
            ? {
                id: submission.id,
                status: submission.status,
                portalStatus: portalStatus(submission.status),
                signerName: submission.signer_name,
                submittedAt: new Date(submission.created_at).toISOString(),
                reviewedAt: submission.reviewed_at ? new Date(submission.reviewed_at).toISOString() : null,
                reviewedBy: submission.reviewed_by,
                reviewerNote: submission.reviewer_note,
                expirationDate: submission.expiration_date,
                fileName: submission.file_name,
                fileUrl: submission.file_id ? await this.link(origin, submission.file_id) : null,
                portalPath: submission.portal_path,
                answers: adminFields(submission.fields_json),
              }
            : null,
        });
      }
      const required = checklist.filter((c) => c.required);
      contractors.push({
        userId,
        name: person?.name ?? null,
        email: person?.email ?? null,
        lastSeen: person?.last_seen ? new Date(person.last_seen).toISOString() : null,
        canClaimJobs: required.every((c) => c.state === "done"),
        needsReview: checklist.filter((c) => c.state === "in_review").length,
        contact: (await this.profileOf(userId)),
        checklist,
        updatedAt: changed ? new Date(changed).toISOString() : null,
      });
    }
    return { ok: true, generatedAt: new Date().toISOString(), linkExpiresInSeconds: LINK_TTL_SECONDS, contractors };
  }

  // MARK: Admin routes

  private async adminRoute(request: Request, path: string, who: Identity, origin: string): Promise<Response> {
    const body = request.method === "POST" && !request.headers.get("Content-Type")?.startsWith("application/pdf")
      ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
      : {};

    if (path === "/admin/items" && request.method === "GET") {
      return json({
        ok: true,
        items: (await this.items(true)).map((item) => ({ ...this.publicItem(item), fieldsText: questionsToText(parseFields(item.fields_json)) })),
      });
    }
    if (path === "/admin/items" && request.method === "POST") return json({ ok: true, item: (await this.saveItem(null, body)) });
    if (path === "/admin/items/reorder" && request.method === "POST") {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      for (const [index, id] of ids.entries()) await this.sql.exec("UPDATE items SET sort = ?, updated_at = ? WHERE id = ?", index, now(), id);
      return json({ ok: true });
    }

    const itemMatch = path.match(/^\/admin\/items\/([\w-]+)(?:\/(document|delete|document-link|document-remove))?$/);
    if (itemMatch) {
      const [, id, action] = itemMatch;
      if (!action && request.method === "POST") return json({ ok: true, item: (await this.saveItem(id, body)) });
      if (action === "delete") {
        if (id === BACKGROUND_ITEM_ID) throw new HttpError(400, "The background check step is always required and can't be removed.");
        await this.sql.exec("UPDATE items SET deleted = 1, active = 0, updated_at = ? WHERE id = ?", now(), id);
        return json({ ok: true });
      }
      if (action === "document") return json({ ok: true, item: await this.replaceDocument(request, id, who) });
      if (action === "document-remove") {
        const item = (await this.itemById(id));
        if (item.kind === "sign") throw new HttpError(400, "Documents to sign need a PDF. Replace it instead.");
        await this.sql.exec("UPDATE items SET file_id = NULL, file_name = NULL, file_sha = NULL, page_count = NULL, updated_at = ? WHERE id = ?", now(), id);
        return json({ ok: true, item: this.publicItem((await this.itemById(id))) });
      }
      if (action === "document-link") {
        const item = (await this.itemById(id));
        if (!item.file_id) throw new HttpError(404, "No document uploaded yet.");
        return json({ ok: true, url: await this.link(origin, item.file_id) });
      }
    }

    if (path === "/admin/export" && request.method === "GET") {
      return json(await this.exportAll(origin, new URL(request.url).searchParams.get("since")));
    }
    if (path === "/admin/portal-sync" && request.method === "POST") {
      return json(await this.syncToPortal(request.headers.get("X-Supabase-Auth")));
    }

    if (path === "/admin/contractors" && request.method === "POST") {
      return json({ ok: true, contractors: (await this.contractorList(Array.isArray(body.profiles) ? body.profiles : [])) });
    }

    const contractorMatch = path.match(/^\/admin\/contractors\/([\w-]+)(?:\/items\/([\w-]+)\/(mark|reset|progress))?$/);
    if (contractorMatch) {
      const [, userId, itemId, action] = contractorMatch;
      if (!action) return json({ ok: true, ...(await this.contractorFile(userId, origin)) });
      if (request.method !== "POST") throw new HttpError(405, "Use POST.");
      const item = (await this.itemById(itemId));
      // Background notes are kept exactly as the admin typed them (they are never shown to the contractor).
      const exactNote = (fallback: string) => (typeof body.note === "string" && body.note.trim() ? body.note.slice(0, 2000) : fallback);
      if (action === "progress") {
        if (item.kind !== "background") throw new HttpError(400, "Progress applies to the background check only.");
        const status = typeof body.status === "string" ? body.status : "";
        if (!BACKGROUND_PROGRESS[status] || status === "approved") {
          throw new HttpError(400, "Status must be needs_invitation, invited, in_progress, awaiting_review, or on_hold. Use mark to approve.");
        }
        (await this.sql.exec(
          `INSERT INTO background_progress (user_id, item_id, status, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, item_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          userId, item.id, status, now(), who.email ?? who.userId,
        ));
      } else if (action === "mark" && item.kind === "background") {
        (await this.insertSubmission({
          user_id: userId,
          item,
          status: "approved",
          signer_name: null,
          fields_json: "{}",
          file_id: null,
          file_name: null,
          expiration_date: null,
          ip: null,
          user_agent: null,
          source: "admin",
          reviewer: who.email ?? who.userId,
          note: exactNote("Background check approved by Turnly"),
        }));
      } else if (action === "reset" && item.kind === "background") {
        (await this.insertSubmission({
          user_id: userId,
          item,
          status: "rejected",
          signer_name: null,
          fields_json: "{}",
          file_id: null,
          file_name: null,
          expiration_date: null,
          ip: null,
          user_agent: null,
          source: "admin",
          reviewer: who.email ?? who.userId,
          note: exactNote("Background check reset by Turnly"),
        }));
        await this.sql.exec("DELETE FROM background_progress WHERE user_id = ? AND item_id = ? AND status = 'approved'", userId, item.id);
      } else if (action === "mark") {
        (await this.insertSubmission({
          user_id: userId,
          item,
          status: "approved",
          signer_name: null,
          fields_json: "{}",
          file_id: null,
          file_name: null,
          expiration_date: validDate(body.expirationDate),
          ip: null,
          user_agent: null,
          source: "admin",
          reviewer: who.email ?? who.userId,
          note: cleanText(body.note, 300) || "Marked as on file by Turnly",
        }));
      } else {
        const previous = (await this.latestSubmission(userId, item.id));
        if (previous?.portal_path) {
          await this.pushStatus(request.headers.get("X-Supabase-Auth"), {
            ...previous,
            status: "rejected",
            reviewer_note: cleanText(body.note, 300) || "Turnly asked you to complete this again.",
          });
        }
        (await this.insertSubmission({
          user_id: userId,
          item,
          status: "rejected",
          signer_name: null,
          fields_json: "{}",
          file_id: null,
          file_name: null,
          expiration_date: null,
          ip: null,
          user_agent: null,
          source: "admin",
          reviewer: who.email ?? who.userId,
          note: cleanText(body.note, 300) || "Turnly asked you to complete this again.",
        }));
      }
      return json({ ok: true, ...(await this.contractorFile(userId, origin)) });
    }

    const reviewMatch = path.match(/^\/admin\/submissions\/([\w-]+)\/(review|link|reveal)$/);
    if (reviewMatch) {
      const submission = (await this.submission(reviewMatch[1]));
      if (reviewMatch[2] === "link") {
        if (!submission.file_id) throw new HttpError(404, "No file on this submission.");
        return json({ ok: true, url: await this.link(origin, submission.file_id) });
      }
      if (reviewMatch[2] === "reveal") {
        const questionId = cleanText(body.questionId, 120);
        const parsed = safeJson(submission.fields_json);
        const answer = Array.isArray(parsed) ? (parsed as Answer[]).find((a) => a?.id === questionId) : undefined;
        if (!answer || !answer.value) throw new HttpError(404, "That answer wasn't found.");
        const value = await this.openAnswer(answer.value);
        if (answer.sensitive) {
          (await this.sql.exec(
            "INSERT INTO reveals (submission_id, user_id, question, viewed_by, viewed_at) VALUES (?, ?, ?, ?, ?)",
            submission.id,
            submission.user_id,
            answer.label.slice(0, 200),
            who.email ?? who.userId,
            now(),
          ));
          console.log("Private answer viewed", { submission: submission.id, question: questionId, by: who.email ?? who.userId });
        }
        return json({ ok: true, value });
      }
      // Background decisions go through mark/reset only, so their exact notes are never rewritten here.
      if (submission.kind === "background" || submission.item_id === BACKGROUND_ITEM_ID) {
        throw new HttpError(400, "Use mark or reset for the background check.");
      }
      const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
      if (!decision) throw new HttpError(400, "Choose approve or reject.");
      const note = cleanText(body.note, 300) || null;
      if (decision === "rejected" && !note) throw new HttpError(400, "Add a note so the contractor knows what to fix.");
      (await this.sql.exec(
        "UPDATE submissions SET status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
        decision,
        note,
        who.email ?? who.userId,
        now(),
        submission.id,
      ));
      await this.pushStatus(request.headers.get("X-Supabase-Auth"), (await this.submission(submission.id)));
      return json({ ok: true, ...(await this.contractorFile(submission.user_id, origin)) });
    }

    throw new HttpError(404, "Not found.");
  }

  private async itemById(id: string): Promise<ItemRow> {
    const row = (await this.sql.exec<ItemRow>("SELECT * FROM items WHERE id = ? AND deleted = 0", id)).toArray()[0];
    if (!row) throw new HttpError(404, "Checklist item not found.");
    return row;
  }

  private async saveItem(id: string | null, body: Record<string, unknown>) {
    const existing = id ? (await this.itemById(id)) : null;
    if (existing?.id === BACKGROUND_ITEM_ID) {
      // The one background step: only its title and instructions can change.
      body = { ...body, kind: "background", required: true, active: true, videoUrl: "" };
    } else if (body.kind === "background" || (!body.kind && existing?.kind === "background")) {
      throw new HttpError(400, "There is already one background check step. Edit that one instead.");
    }
    const kind = KINDS.find((k) => k === body.kind) ?? existing?.kind;
    if (!kind) throw new HttpError(400, "Choose a type: form, sign, upload, video, or background check.");
    const title = cleanText(body.title ?? existing?.title, 120);
    if (!title) throw new HttpError(400, "Give the item a title.");
    const description = cleanLongText(body.description ?? existing?.description ?? "", 4000) || null;
    const fields = typeof body.fieldsText === "string"
      ? parseQuestionText(body.fieldsText)
      : body.fields !== undefined
        ? parseFields(JSON.stringify(body.fields))
        : parseFields(existing?.fields_json);
    if (kind === "form" && fields.length === 0) throw new HttpError(400, "Add at least one question to the form.");
    const hasFields = kind === "sign" || kind === "form";
    let videoUrl = (body.videoUrl !== undefined ? cleanText(body.videoUrl, 600) : existing?.video_url ?? "") || null;
    const flag = (value: unknown, fallback: number) => (value === undefined ? fallback : value === true || value === 1 ? 1 : 0);
    const required = flag(body.required, existing?.required ?? 1);
    const active = flag(body.active, existing?.active ?? 1);
    if (videoUrl && !/^https:\/\/\S+$/i.test(videoUrl)) throw new HttpError(400, "Links must start with https://");
    if (kind === "video") {
      if (!videoUrl) throw new HttpError(400, "Add the video's https:// link.");
    } else {
      videoUrl = null;
    }
    const requiresExpiration = kind === "upload" ? flag(body.requiresExpiration, existing?.requires_expiration ?? 0) : 0;
    const requiresReview = kind === "video" ? 0 : kind === "background" ? 1 : flag(body.requiresReview, existing?.requires_review ?? 0);
    const sql = this.sql;
    if (existing) {
      (await sql.exec(
        `UPDATE items SET kind = ?, title = ?, description = ?, required = ?, active = ?, fields_json = ?, video_url = ?,
           requires_expiration = ?, requires_review = ?, updated_at = ? WHERE id = ?`,
        kind,
        title,
        description,
        required,
        active,
        JSON.stringify(hasFields ? fields : []),
        videoUrl,
        requiresExpiration,
        requiresReview,
        now(),
        existing.id,
      ));
      return this.publicItem((await this.itemById(existing.id)));
    }
    const newItemId = newId("item");
    const sort = (await sql.exec<{ n: number }>("SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM items")).one().n;
    (await sql.exec(
      `INSERT INTO items (id, kind, title, description, required, active, sort, fields_json, video_url, requires_expiration, requires_review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newItemId,
      kind,
      title,
      description,
      required,
      active,
      sort,
      JSON.stringify(hasFields ? fields : []),
      videoUrl,
      requiresExpiration,
      requiresReview,
      now(),
      now(),
    ));
    return this.publicItem((await this.itemById(newItemId)));
  }

  private async replaceDocument(request: Request, id: string, who: Identity) {
    const item = (await this.itemById(id));
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > MAX_FILE) throw new HttpError(413, "PDFs must be 15 MB or smaller.");
    let pages: number;
    try {
      pages = await validateTemplate(bytes);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Upload a PDF file.");
    }
    const fileName = safeFileName(decodeHeader(request.headers.get("X-File-Name")), `${slug(item.title)}.pdf`);
    return this.attachDocument(item, bytes, fileName, request.headers.get("X-Require-Resign") === "1", who.email ?? who.userId, pages);
  }

  /** Stores a new PDF version on an item. For sign items the first version (or a forced one) must be re-signed. */
  private async attachDocument(item: ItemRow, bytes: Uint8Array, fileName: string, forceResign: boolean, by: string, knownPages?: number) {
    const pages = knownPages ?? (await validateTemplate(bytes));
    const file = await this.storeFile(bytes, fileName, "application/pdf");
    const version = item.version + 1;
    const requireResign = item.kind === "sign" && (forceResign || item.version === 0);
    const sql = this.sql;
    (await sql.exec(
      "INSERT INTO item_versions (item_id, version, file_id, file_name, sha, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      item.id,
      version,
      file.id,
      fileName,
      file.sha,
      now(),
      by,
    ));
    (await sql.exec(
      `UPDATE items SET version = ?, min_version = CASE WHEN ? THEN ? ELSE min_version END, file_id = ?, file_name = ?, file_sha = ?,
         page_count = ?, updated_at = ? WHERE id = ?`,
      version,
      requireResign ? 1 : 0,
      version,
      file.id,
      fileName,
      file.sha,
      pages,
      now(),
      item.id,
    ));
    return this.publicItem((await this.itemById(item.id)));
  }

  private async contractorList(profiles: unknown[]) {
    const seen = (await this.sql
      .exec<{ user_id: string; email: string | null; name: string | null; last_seen: number; deletion_requested_at: number | null }>("SELECT * FROM contractors"))
      .toArray();
    const deletions = new Map(seen.filter((row) => row.deletion_requested_at).map((row) => [row.user_id, new Date(row.deletion_requested_at as number).toISOString()]));
    const people = new Map<string, { userId: string; name: string | null; email: string | null; lastSeen: number | null; status: string | null }>();
    for (const profile of profiles as Record<string, unknown>[]) {
      const userId = typeof profile.id === "string" ? profile.id : null;
      if (!userId) continue;
      // Profiles come from the admin's own Supabase read; use them to record or withdraw the exception.
      if ("contractor_approved" in profile) {
        (await this.refreshGrandfather(userId, {
          approved: profile.contractor_approved === true ? true : profile.contractor_approved === false ? false : null,
          createdAt: typeof profile.created_at === "string" ? profile.created_at : null,
          waived: new Set(),
        }));
      }
      people.set(userId, {
        userId,
        name: (profile.full_name as string) ?? null,
        email: (profile.email as string) ?? null,
        lastSeen: null,
        status: (profile.status as string) ?? null,
      });
    }
    for (const row of seen) {
      const existing = people.get(row.user_id);
      people.set(row.user_id, {
        userId: row.user_id,
        name: existing?.name ?? row.name,
        email: existing?.email ?? row.email,
        status: existing?.status ?? null,
        lastSeen: row.last_seen,
      });
    }
    const items = (await this.items(false));
    const required = items.filter((item) => item.required === 1);
    if (people.size === 0) return [];
    // The directory must not issue one network query per contractor/item. That
    // exhausted the four-connection pool and the portal's 25-second deadline.
    // Fetch state evidence in bulk; never load signed answers or file contents.
    const ids = [...people.keys()];
    const placeholders = ids.map(() => "?").join(",");
    const [submissionRows, grandfatherRows, trackedRows] = await Promise.all([
      this.sql.exec<SubmissionRow>(
        `SELECT DISTINCT ON (user_id, item_id) user_id, item_id, status, source, version, expiration_date, created_at
         FROM submissions WHERE user_id IN (${placeholders})
         ORDER BY user_id, item_id, created_at DESC`, ...ids),
      this.sql.exec<{ user_id: string }>(
        `SELECT user_id FROM background_grandfather WHERE user_id IN (${placeholders})`, ...ids),
      this.sql.exec<{ user_id: string; item_id: string }>(
        `SELECT user_id, item_id FROM background_progress WHERE user_id IN (${placeholders})`, ...ids),
    ]);
    const key = (userId: string, itemId: string) => JSON.stringify([userId, itemId]);
    const latest = new Map(submissionRows.toArray().map((row) => [key(row.user_id, row.item_id), row]));
    const grandfathered = new Set(grandfatherRows.toArray().map((row) => row.user_id));
    const tracked = new Set(trackedRows.toArray().map((row) => key(row.user_id, row.item_id)));
    const rows = [...people.values()]
      .map((person) => {
        const states = items.map((item) => {
          const itemKey = key(person.userId, item.id);
          const submission = latest.get(itemKey) ?? null;
          const state = this.state(item, submission);
          // Same exception rules as effectiveState/backgroundTracked: a real
          // decision, reset, or manual progress always overrides the exception.
          const exception = item.kind === "background" && state !== "done"
            && grandfathered.has(person.userId) && !tracked.has(itemKey)
            && !(submission && (submission.status === "rejected" || submission.created_at > BACKGROUND_GRANDFATHER_CUTOFF));
          return { item, state: exception ? "done" : state, grandfathered: exception };
        });
        const done = states.filter((s) => s.item.required === 1 && s.state === "done").length;
        const needsReview = states.filter((s) => s.state === "in_review").length;
        return {
          ...person,
          grandfathered: states.some((s) => s.grandfathered),
          deletionRequested: deletions.get(person.userId) ?? null,
          lastSeen: person.lastSeen ? new Date(person.lastSeen).toISOString() : null,
          requiredCount: required.length,
          doneCount: done,
          needsReview,
          complete: done === required.length,
        };
      });
    return rows
      .sort((a, b) => Number(Boolean(b.deletionRequested)) - Number(Boolean(a.deletionRequested)) || b.needsReview - a.needsReview || Number(a.complete) - Number(b.complete) || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
  }

  private async contractorFile(userId: string, _origin: string) {
    const contractor = (await this.sql
      .exec<{ user_id: string; email: string | null; name: string | null; last_seen: number }>("SELECT * FROM contractors WHERE user_id = ?", userId))
      .toArray()[0];
    const items = await Promise.all((await this.items(false)).map(async (item) => {
      const submission = (await this.latestSubmission(userId, item.id));
      const { state, grandfather } = (await this.effectiveState(userId, item, submission));
      const progress = (await this.backgroundProgress(userId, item, state, Boolean(grandfather)));
      return {
        ...this.publicItem(item),
        state,
        submission: this.publicSubmission(submission, true),
        ...(progress ? { progress } : {}),
        ...(grandfather ? { grandfathered: { grantedAt: new Date(grandfather.grantedAt).toISOString(), basis: grandfather.basis } } : {}),
      };
    }));
    const history = (await this.sql
      .exec<SubmissionRow>("SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", userId))
      .toArray()
      .map((row) => ({ ...this.publicSubmission(row, true), itemId: row.item_id, itemTitle: row.item_title, kind: row.kind }));
    const required = items.filter((item) => item.required);
    const reveals = (await this.sql
      .exec<{ question: string; viewed_by: string; viewed_at: number }>(
        "SELECT question, viewed_by, viewed_at FROM reveals WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 20",
        userId,
      ))
      .toArray()
      .map((r) => ({ question: r.question, viewedBy: r.viewed_by, viewedAt: new Date(r.viewed_at).toISOString() }));
    return {
      contractor: { userId, name: contractor?.name ?? null, email: contractor?.email ?? null },
      complete: required.every((item) => item.state === "done"),
      contact: (await this.profileOf(userId)),
      items,
      history,
      reveals,
    };
  }

  // MARK: Files

  /** Files are stored encrypted, one sealed blob per 1 MB chunk. */
  private async storeFile(bytes: Uint8Array, name: string, mime: string): Promise<FileRow> {
    const id = newId("file");
    const sha = await sha256Hex(bytes);
    const chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
    const keyId = this.currentKeyId();
    const key = await this.keyFor(keyId);
    const sealed: ArrayBuffer[] = [];
    for (let index = 0; index < chunks; index += 1) {
      sealed.push((await sealBytes(key, bytes.slice(index * CHUNK, (index + 1) * CHUNK))).buffer as ArrayBuffer);
    }
    await this.sql.transaction(async (sql) => {
      for (const [index, data] of sealed.entries()) await sql.exec("INSERT INTO file_chunks (file_id, idx, data) VALUES (?, ?, ?)", id, index, data);
      (await sql.exec(
        "INSERT INTO files (id, name, mime, size, sha, chunks, created_at, sealed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        id, name, mime, bytes.length, sha, chunks, now(), keyId,
      ));
    });
    return { id, name, mime, size: bytes.length, sha, chunks, created_at: now(), sealed: keyId };
  }

  private async fileRow(id: string): Promise<FileRow> {
    const row = (await this.sql.exec<FileRow>("SELECT * FROM files WHERE id = ?", id)).toArray()[0];
    if (!row) throw new HttpError(404, "File not found.");
    return row;
  }

  private async readFile(id: string): Promise<Uint8Array> {
    const file = (await this.fileRow(id));
    const key = file.sealed ? await this.keyFor(file.sealed) : null;
    const out = new Uint8Array(file.size);
    let offset = 0;
    const rows = (await this.sql.exec<{ data: ArrayBuffer }>("SELECT data FROM file_chunks WHERE file_id = ? ORDER BY idx", id)).toArray();
    for (const row of rows) {
      const part = key ? await openBytes(key, new Uint8Array(row.data)) : new Uint8Array(row.data);
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  private async signingKey(): Promise<CryptoKey> {
    const sql = this.sql;
    let secret = (await sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'link_secret'")).toArray()[0]?.value;
    if (!secret) {
      secret = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
      // Another instance may have created it at the same moment: keep whichever was stored first.
      await sql.exec("INSERT INTO meta (key, value) VALUES ('link_secret', ?) ON CONFLICT (key) DO NOTHING", secret);
      secret = (await sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'link_secret'")).one().value;
    }
    return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  }

  private async signature(fileId: string, expires: number): Promise<string> {
    const mac = await crypto.subtle.sign("HMAC", await this.signingKey(), new TextEncoder().encode(`${fileId}.${expires}`));
    return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** Short-lived link anyone holding it can open (like Supabase signed URLs). */
  private async link(origin: string, fileId: string): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
    return `${origin}/onboarding/f/${fileId}?e=${expires}&s=${await this.signature(fileId, expires)}`;
  }

  private async serveFile(fileId: string, url: URL): Promise<Response> {
    const expires = Number(url.searchParams.get("e") ?? "0");
    const provided = url.searchParams.get("s") ?? "";
    if (!Number.isFinite(expires) || expires < Date.now() / 1000) return new Response("This link has expired. Open the file again from the app.", { status: 410 });
    const expected = await this.signature(fileId, expires);
    if (provided.length !== expected.length || provided !== expected) return new Response("Invalid link.", { status: 403 });
    const file = (await this.fileRow(fileId));
    const download = url.searchParams.get("download") === "1";
    return new Response((await this.readFile(fileId)) as BodyInit, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(file.size),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

/**
 * The contractor's own previous answers (so a form sent back can be fixed
 * without retyping). Sensitive answers are never sent back to the device.
 */
function ownAnswers(text: string): Record<string, string> | undefined {
  const parsed = safeJson(text);
  if (!Array.isArray(parsed)) return undefined;
  const out: Record<string, string> = {};
  for (const answer of parsed as Answer[]) {
    if (answer && typeof answer.id === "string" && !answer.sensitive && answer.value) out[answer.id] = answer.value;
  }
  return out;
}

/** contractor_documents.status for a submission status. */
function portalStatus(status: SubmissionRow["status"]): string {
  switch (status) {
    case "pending":
      return "pending_review";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    default:
      return "submitted";
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}



