import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ProjectDatabaseOverview {
  engine: string;
  schemaSql: string | null;
  tables: Array<{
    name: string;
    rowCount: number;
    columns: string[];
    rows: Array<Record<string, unknown>>;
  }>;
}

export const inspectProjectDatabase = (workspacePath: string): ProjectDatabaseOverview => {
  const schemaPath = join(workspacePath, "schema.sql");
  const jsonDbPath = join(workspacePath, "data", "database.json");
  const schemaSql = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : null;

  if (existsSync(jsonDbPath)) {
    try {
      const store = JSON.parse(readFileSync(jsonDbPath, "utf8")) as {
        table?: string;
        records?: Array<Record<string, unknown>>;
      };
      const records = Array.isArray(store.records) ? store.records : [];
      const columns = records[0] ? Object.keys(records[0]) : [];
      return {
        engine: "Persistent Store + SQL Schema Parity",
        schemaSql,
        tables: [
          {
            name: store.table ?? "records",
            rowCount: records.length,
            columns,
            rows: records.slice(0, 100),
          },
        ],
      };
    } catch {
      return { engine: "Corrupt/Unreadable JSON store", schemaSql, tables: [] };
    }
  }

  return { engine: "No database initialized yet", schemaSql, tables: [] };
};
