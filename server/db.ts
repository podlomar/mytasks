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
  const deleteBySource = db.prepare("DELETE FROM entries WHERE source = ?");

  // Exact matches only, so "buy" matches "buy" and "buy:gro" but never "buyer".
  const inCategory = db.prepare(`
    SELECT * FROM entries
    WHERE category = :category
       OR substr(category, 1, length(:category) + 1) = :category || ':'
    ORDER BY date DESC, id DESC
  `);

  return {
    add(entry: NewEntry): Entry {
      const { lastInsertRowid } = insert.run({ ...entry });
      return { id: Number(lastInsertRowid), ...entry };
    },

    /** Most recent first. */
    latest(limit: number): Entry[] {
      return latest.all(limit) as unknown as Entry[];
    },

    /** Every entry in a category and its subcategories, most recent first. */
    inCategory(category: string): Entry[] {
      return inCategory.all({ category }) as unknown as Entry[];
    },

    /** Delete every entry from one source; returns how many went. */
    removeBySource(source: string): number {
      return Number(deleteBySource.run(source).changes);
    },

    close() {
      db.close();
    },
  };
}
