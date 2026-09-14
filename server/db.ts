import { DatabaseSync } from "node:sqlite";
import type { Entry, NewEntry } from "./types.ts";

/**
 * The entries store. Uses Node's built-in SQLite, so there is no native
 * module to build. Columns are named exactly like the JSON fields, so a row
 * reads back as an Entry with no mapping.
 */
export function openDb(path: string) {
  const db = new DatabaseSync(path);

  // WAL lets you browse the file with another tool while the server writes.
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS entries (
      id          INTEGER PRIMARY KEY,
      date        TEXT NOT NULL,
      text        TEXT NOT NULL,
      note        TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL,
      category    TEXT,
      appId       TEXT,
      appName     TEXT,
      appExe      TEXT,
      windowTitle TEXT
    );
  `);

  const insert = db.prepare(`
    INSERT INTO entries (date, text, note, source, category, appId, appName, appExe, windowTitle)
    VALUES (:date, :text, :note, :source, :category, :appId, :appName, :appExe, :windowTitle)
  `);
  const latest = db.prepare("SELECT * FROM entries ORDER BY date DESC, id DESC LIMIT ?");

  return {
    add(entry: NewEntry): Entry {
      const { lastInsertRowid } = insert.run({ ...entry });
      return { id: Number(lastInsertRowid), ...entry };
    },

    /** Most recent first. */
    latest(limit: number): Entry[] {
      return latest.all(limit) as unknown as Entry[];
    },

    close() {
      db.close();
    },
  };
}
