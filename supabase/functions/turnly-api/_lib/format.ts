// Formatting helpers so pushes read the same as the app ("$1,360", "Tue, Sep 30, 10:00 AM").

export type Row = Record<string, unknown>;

export function text(row: Row | null | undefined, keys: string[]): string | null {
  if (!row) return null;
  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Row;
  for (const key of keys) {
    for (const source of [row, meta]) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return String(value);
    }
  }
  return null;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function currency(value: unknown): string | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 0) return null;
  return usd.format(number);
}

export function unitLabel(row: Row): string | null {
  const raw = text(row, ["unit_number", "unit_name"]);
  if (!raw) return null;
  if (raw.toLowerCase().startsWith("unit") || raw.startsWith("#")) return raw;
  return `Unit ${raw}`;
}

const MARKET_TIME_ZONE = "America/New_York";

/** Formats a job window start. Zoneless timestamps are treated as local wall time. */
export function windowLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim().replace(" ", "T");
  const hasZone = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(raw);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (hasZone) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: MARKET_TIME_ZONE }).format(date);
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0)));
  if (!h) {
    return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
}

export function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Portal `normalizeLookup`: lowercase alphanumerics separated by single spaces. */
export function lookup(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

