export type SqlInput = { sql: string; args?: (string | number | null)[] };
export type SqlResult = { columns: string[]; rows: Record<string, unknown>[]; rowsAffected: number };
export type SqlClient = { execute: (input: SqlInput | string) => Promise<SqlResult>; batch: (inputs: SqlInput[], mode: "write") => Promise<SqlResult[]>; close: () => void };

function mapped(result: SqlResult) {
  return { results: result.rows.map(row => Object.fromEntries(result.columns.map(column => [column, row[column]]))), success: true, meta: { changes: Number(result.rowsAffected), duration: 0 } };
}

class Statement {
  client: SqlClient;
  sql: string;
  args: (string | number | null)[];
  constructor(client: SqlClient, sql: string, args: (string | number | null)[] = []) { this.client = client; this.sql = sql; this.args = args; }
  bind(...args: (string | number | null)[]) { return new Statement(this.client, this.sql, args); }
  async all() { return mapped(await this.client.execute({ sql: this.sql, args: this.args })); }
  async first(column?: string) { const row = (await this.all()).results[0]; return row ? column ? row[column] ?? null : row : null; }
  async run() { return this.all(); }
}

export function d1Adapter(client: SqlClient): D1Database {
  return {
    prepare(sql: string) { return new Statement(client, sql); },
    async batch(statements: Statement[]) {
      if (statements.some(statement => statement.client !== client)) throw new Error("Mixed database batch");
      return (await client.batch(statements.map(({ sql, args }) => ({ sql, args })), "write")).map(mapped);
    },
  } as unknown as D1Database;
}
