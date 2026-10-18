import "server-only";
import type { Pool, PoolClient } from "pg";
import type { Query, Repository, Table, Tables, Transaction } from "./repository";

const tables = new Set<string>(["profiles", "generations", "projects", "uploads", "credit_ledger", "stripe_events", "hf_webhook_events", "presets", "model_pricing", "reports", "rate_limits", "preview_sessions"]);
function tableSql(table: Table) {
  if (!tables.has(table)) throw new Error("Unknown Matrix table.");
  return `fusion_matrix.${table}`;
}
function fieldPath(field: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/.test(field)) throw new Error("Unsupported Matrix field.");
  return field.split(".");
}
function hydrate<K extends Table>(table: K, document: Tables[K]): Tables[K] {
  if (table === "rate_limits") {
    const record = document as Tables["rate_limits"];
    if (record.expiresAtDate) record.expiresAtDate = new Date(record.expiresAtDate);
  }
  return document;
}
class ConcurrentInsert extends Error {}
function code(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
}

class PostgresTransaction implements Transaction {
  private missing = new Set<string>();
  constructor(private client: PoolClient) {}
  async get<K extends Table>(table: K, id: string): Promise<Tables[K] | null> {
    const result = await this.client.query<{ document: Tables[K] }>(`SELECT document FROM ${tableSql(table)} WHERE id = $1`, [id]);
    if (!result.rows[0]) { this.missing.add(`${table}:${id}`); return null; }
    return hydrate(table, result.rows[0].document);
  }
  async find<K extends Table>(table: K, query: Query = {}, limit = 1000, sort: Record<string, 1 | -1> = { createdAt: -1, id: -1 }): Promise<Tables[K][]> {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid Matrix query limit.");
    const values: unknown[] = [];
    const param = (value: unknown) => { values.push(value); return `$${values.length}`; };
    const expression = (field: string) => `(document #> ${param(fieldPath(field))}::text[])`;
    const json = (value: unknown) => {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error("Unsupported Matrix query value.");
      return `${param(serialized)}::jsonb`;
    };
    const equal = (field: string, expected: unknown) => expected === null
      ? `(${field} IS NULL OR ${field} = 'null'::jsonb)` : `${field} = ${json(expected)}`;
    const predicates = Object.entries(query).map(([key, expected]) => {
      const field = expression(key);
      if (expected && typeof expected === "object" && !Array.isArray(expected) && Object.keys(expected).some(key => key.startsWith("$"))) {
        return "(" + Object.entries(expected).map(([operator, value]) => {
          if (operator === "$exists" && typeof value === "boolean") return `${field} IS ${value ? "NOT " : ""}NULL`;
          if (operator === "$in" && Array.isArray(value)) return value.length ? "(" + value.map(item => equal(field, item)).join(" OR ") + ")" : `(${field} IS NULL AND FALSE)`;
          if (operator === "$lt" || operator === "$gt") return `jsonb_typeof(${field}) = jsonb_typeof(${json(value)}) AND ${field} ${operator === "$lt" ? "<" : ">"} ${json(value)}`;
          throw new Error("Unsupported Matrix query operator.");
        }).join(" AND ") + ")";
      }
      return equal(field, expected);
    });
    const ordering = Object.entries(sort).map(([key, direction]) => {
      if (direction !== 1 && direction !== -1) throw new Error("Invalid Matrix sort direction.");
      return `${expression(key)} ${direction === 1 ? "ASC NULLS FIRST" : "DESC NULLS LAST"}`;
    });
    const result = await this.client.query<{ document: Tables[K] }>(
      `SELECT document FROM ${tableSql(table)}${predicates.length ? " WHERE " + predicates.join(" AND ") : ""}${ordering.length ? " ORDER BY " + ordering.join(", ") : ""} LIMIT ${param(Math.min(limit, 5000))}`,
      values,
    );
    return result.rows.map(row => hydrate(table, row.document));
  }
  async put<K extends Table>(table: K, value: Tables[K]) {
    await this.client.query(`INSERT INTO ${tableSql(table)} (id, document) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document`, [value.id, JSON.stringify(value)]);
  }
  async insert<K extends Table>(table: K, value: Tables[K]) {
    try {
      await this.client.query(`INSERT INTO ${tableSql(table)} (id, document) VALUES ($1, $2::jsonb)`, [value.id, JSON.stringify(value)]);
    } catch (error) {
      // Concurrent inserts after an absent read may be reported as 23505, not 40001.
      // Retry only this known race; never hide an ordinary duplicate or another unique constraint.
      if (code(error) === "23505" && (error as { constraint?: string }).constraint === `${table}_pkey` && this.missing.has(`${table}:${value.id}`)) throw new ConcurrentInsert();
      throw error;
    }
  }
  async remove(table: Table, id: string) {
    await this.client.query(`DELETE FROM ${tableSql(table)} WHERE id = $1`, [id]);
  }
}

export class PostgresRepository implements Repository {
  constructor(readonly pool: Pool) {}
  async read<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.run(fn, true);
  }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.run(fn, false);
  }
  private async run<T>(fn: (tx: Transaction) => Promise<T>, readOnly: boolean): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      let discard = false, retry = false;
      try {
        await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN ISOLATION LEVEL SERIALIZABLE");
        await client.query("SET LOCAL statement_timeout = '8s'");
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
        const result = await fn(new PostgresTransaction(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { discard = true; }
        retry = !readOnly && !discard && attempt < 9 && (code(error) === "40001" || code(error) === "40P01" || error instanceof ConcurrentInsert);
        // Transport/unknown COMMIT failures are deliberately never replayed.
        if (!retry) throw error;
      } finally { client.release(discard); }
      if (retry) await new Promise(resolve => setTimeout(resolve, Math.min(5 * 2 ** attempt, 80) + Math.floor(Math.random() * 10)));
    }
  }
}
