import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { openDatabase, migrate } from "../standalone/database.ts";

const [operation, filename] = process.argv.slice(2);
if (!["export", "import"].includes(operation) || !filename?.endsWith(".json")) throw new Error("Usage: node scripts/transfer-data.mjs export|import /absolute/path/backup.json");
const tables = {
  shiyan_users: ["id", "display_name", "created_at"],
  shiyan_identities: ["channel", "address", "user_id", "verified_at"],
  topics: ["id", "owner_id", "title", "description", "color", "created_at", "updated_at"],
  conversations: ["id", "topic_id", "title", "source", "content", "content_hash", "conversation_date", "imported_at"],
  reports: ["id", "topic_id", "kind", "week_start", "summary_json", "source_ids_json", "model", "created_at"],
};
const { client } = openDatabase();
try {
  if (operation === "export") {
    const data = { version: 2, exportedAt: new Date().toISOString(), tables: {} };
    for (const [table, columns] of Object.entries(tables)) {
      const result = await client.execute(`SELECT ${columns.join(",")} FROM ${table} ORDER BY ${columns[0]}`);
      data.tables[table] = result.rows.map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
    }
    await writeFile(path.resolve(filename), JSON.stringify(data, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ exported: true, rows: Object.fromEntries(Object.entries(data.tables).map(([name, rows]) => [name, rows.length])) }));
  } else {
    const data = JSON.parse(await readFile(path.resolve(filename), "utf8"));
    if (![1, 2].includes(data.version) || !data.tables) throw new Error("Invalid backup format");
    await migrate(client, [path.resolve("drizzle"), path.resolve("standalone/migrations")]);
    const statements = [];
    for (const [table, columns] of Object.entries(tables)) {
      if (data.version === 1 && table.startsWith("shiyan_")) {
        const existing = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
        if (Number(existing.rows[0].count)) throw new Error("Target database is not empty; import refused");
        continue;
      }
      if (!Array.isArray(data.tables[table])) throw new Error("Missing backup table");
      const existing = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
      if (Number(existing.rows[0].count)) throw new Error("Target database is not empty; import refused");
      for (const row of data.tables[table]) {
        if (!row || columns.some(column => !Object.hasOwn(row, column) || (table.startsWith("shiyan_") && ["created_at", "verified_at"].includes(column) ? !Number.isSafeInteger(row[column]) : row[column] !== null && typeof row[column] !== "string"))) throw new Error("Invalid backup row");
        statements.push({ sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`, args: columns.map(column => row[column]) });
      }
    }
    if (statements.length) await client.batch(statements, "write");
    console.log(JSON.stringify({ imported: true, rows: statements.length }));
  }
} finally { client.close(); }
