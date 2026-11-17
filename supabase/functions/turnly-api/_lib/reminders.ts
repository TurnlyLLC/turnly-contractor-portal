// Time helpers for "job tomorrow" reminders. Job windows without a time zone
// are wall-clock times in Turnly's market (same rule as windowLabel in format.ts).

const ZONE = "America/New_York";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long" });

/** The market's wall-clock time for an instant, expressed as if it were UTC. */
function wall(ms: number): number {
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
}

function wallToInstant(y: number, mo: number, d: number, h: number, mi: number): number {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 3; i += 1) guess = target - (wall(guess) - guess);
  return guess;
}

export type ParsedStart = { at: number; hasTime: boolean };

/** Parses `start_window` (timestamptz, zoneless timestamp, or date). Date-only jobs count as 8:00 AM. */
export function parseStart(value: unknown): ParsedStart | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim().replace(" ", "T");
  if (/(Z|[+-]\d{2}(:?\d{2})?)$/.test(raw) && raw.includes("T")) {
    const at = Date.parse(raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(/([+-]\d{2})$/, "$1:00"));
    return Number.isFinite(at) ? { at, hasTime: true } : null;
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const hasTime = h !== undefined;
  return { at: wallToInstant(Number(y), Number(mo), Number(d), hasTime ? Number(h) : 8, hasTime ? Number(mi) : 0), hasTime };
}

/**
 * When to remind: 24 hours before the job. If the contractor claimed it
 * inside that window, remind 2 hours before instead (when there's still at
 * least 3 hours to go at claim time); otherwise no reminder (they just took it).
 */
export function reminderDue(startAt: number, claimedAt: number | null): number | null {
  const due = startAt - DAY;
  if (claimedAt === null || claimedAt <= due) return due;
  return startAt - claimedAt >= 3 * HOUR ? startAt - 2 * HOUR : null;
}

/** Last moment a reminder is still worth sending. */
export const REMINDER_CUTOFF_MS = 15 * 60_000;

/** "today at 3:00 PM", "tomorrow at 9:00 AM", "Saturday at 9:00 AM" (or without the time for date-only jobs). */
export function reminderWhen(startAt: number, hasTime: boolean, now: number): string {
  const days = Math.round((Math.floor(wall(startAt) / DAY) * DAY - Math.floor(wall(now) / DAY) * DAY) / DAY);
  const day = days <= 0 ? "today" : days === 1 ? "tomorrow" : weekdayFormatter.format(new Date(startAt));
  return hasTime ? `${day} at ${timeFormatter.format(new Date(startAt))}` : day;
}

