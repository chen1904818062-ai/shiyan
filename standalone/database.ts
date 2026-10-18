import { createClient } from "@libsql/client/web";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { d1Adapter, type SqlClient, type SqlInput, type SqlResult } from "./sql-adapter.ts";

function localClient(url: string): SqlClient {
  const filename = fileURLToPath(url);
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const execute = (input: SqlInput | string): SqlResult => {
    const { sql, args = [] } = typeof input === "string" ? { sql: input } : input;
    const statement = db.prepare(sql);
    const columns = statement.columns().map(column => column.name);
    if (columns.length) return { columns, rows: statement.all(...args), rowsAffected: 0 };
    return { columns, rows: [], rowsAffected: Number(statement.run(...args).changes) };
  };
  return {
    execute: async input => execute(input),
    batch: async inputs => {
      // No await inside the native transaction: another request cannot interleave.
      db.exec("BEGIN IMMEDIATE");
      try { const results = inputs.map(execute); db.exec("COMMIT"); return results; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    close: () => db.close(),
  };
}

export function openDatabase(env: NodeJS.ProcessEnv = process.env) {
  const url = env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is required");
  let client: SqlClient;
  if (url.startsWith("file:") && env.ALLOW_LOCAL_DB === "true") client = localClient(url);
  else {
    if (!/^libsql:\/\/[a-zA-Z0-9.-]+\/?$/.test(url) || !env.TURSO_AUTH_TOKEN) throw new Error("A Turso libsql:// URL and TURSO_AUTH_TOKEN are required");
    client = createClient({ url, authToken: env.TURSO_AUTH_TOKEN, intMode: "number" }) as unknown as SqlClient;
  }
  return { client, db: d1Adapter(client) };
}

export async function migrate(client: SqlClient, directories: string[]) {
  await client.execute("CREATE TABLE IF NOT EXISTS shiyan_migrations (name TEXT PRIMARY KEY, digest TEXT NOT NULL, applied_at TEXT NOT NULL)");
  for (const [index, directory] of directories.entries()) {
    for (const filename of readdirSync(directory).filter(name => name.endsWith(".sql")).sort()) {
      const name = `${index}/${filename}`;
      const sql = readFileSync(join(directory, filename), "utf8");
      const digest = createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex");
      const found = await client.execute({ sql: "SELECT digest FROM shiyan_migrations WHERE name = ?", args: [name] });
      if (found.rows.length) { if (found.rows[0].digest !== digest) throw new Error("An applied migration changed"); continue; }
      const statements = sql.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean).map(sql => ({ sql, args: [] }));
      try {
        await client.batch([...statements, { sql: "INSERT INTO shiyan_migrations (name, digest, applied_at) VALUES (?, ?, ?)", args: [name, digest, new Date().toISOString()] }], "write");
      } catch (error) {
        const raced = await client.execute({ sql: "SELECT digest FROM shiyan_migrations WHERE name = ?", args: [name] });
        if (raced.rows[0]?.digest !== digest) throw error;
      }
    }
  }
}
