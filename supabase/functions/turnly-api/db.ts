// Postgres access for the ported hubs. Mirrors the small slice of the Durable
// Object SQL API they used (`exec(sql, ...params)` with `?` placeholders,
// `.toArray()`, `.one()`), but async. Tables live in the turnly_backend schema.
import postgres from "npm:postgres@3.4.5";

export type Result<T> = { toArray(): T[]; one(): T };
export type Db = {
  exec<T = Record<string, unknown>>(query: string, ...params: unknown[]): Promise<Result<T>>;
  /** Runs `work` in one transaction; `tx.exec` has the same shape. */
  transaction<R>(work: (tx: Db) => Promise<R>): Promise<R>;
};

let client: ReturnType<typeof postgres> | null = null;

function connection() {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new Error("SUPABASE_DB_URL is not available.");
  client = postgres(url, {
    max: 4,
    prepare: false,
    idle_timeout: 20,
    connection: { search_path: "turnly_backend" },
    // Millisecond timestamps are BIGINT; keep them plain numbers like SQLite did.
    types: {
      bigint: { to: 20, from: [20], serialize: (value: number) => String(value), parse: (value: string) => Number(value) },
    },
  });
  return client;
}

/** `?` placeholders (outside quotes) become `$1, $2, ...`. */
export function numbered(query: string): string {
  let n = 0;
  let out = "";
  let quote: string | null = null;
  for (const ch of query) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === "?") {
      n += 1;
      out += `$${n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

// deno-lint-ignore no-explicit-any
function wrap(sql: any): Db {
  return {
    async exec<T>(query: string, ...params: unknown[]): Promise<Result<T>> {
      const rows = (await sql.unsafe(numbered(query), params.map(normalize))) as T[];
      const list = Array.from(rows).map((row) => {
        // bytea arrives as a Node Buffer; hand back a plain ArrayBuffer like SQLite BLOBs.
        const out = row as Record<string, unknown>;
        for (const [key, value] of Object.entries(out)) {
          if (value instanceof Uint8Array) out[key] = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        }
        return out as T;
      });
      return {
        toArray: () => list,
        one: () => {
          if (list.length !== 1) throw new Error(`Expected exactly one row, got ${list.length}`);
          return list[0];
        },
      };
    },
    transaction<R>(work: (tx: Db) => Promise<R>): Promise<R> {
      if (sql.begin) return sql.begin((tx: unknown) => work(wrap(tx))) as Promise<R>;
      return work(wrap(sql)); // already inside a transaction
    },
  };
}

export function db(): Db {
  return wrap(connection());
}

