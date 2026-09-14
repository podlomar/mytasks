/** An entry as the GNOME extension POSTs it: a stored row minus its id. */
export interface NewEntry {
  /** ISO-8601 time the hotkey was pressed, from the shell's clock. */
  date: string;
  /** The selected text, as edited in the dialog. May be empty. */
  text: string;
  /** Free-form note typed in the dialog. May be empty. */
  note: string;
  /** Where the entry came from: "desktop" for the GNOME extension. */
  source: string;
  /** Category key from tasking.json: "todo" or "buy" on its own, or "buy:ele" with a subcategory. */
  category: string | null;
  /** Desktop file id of the source app, e.g. "code.desktop". */
  appId: string | null;
  /** Human-readable app name, e.g. "Visual Studio Code". */
  appName: string | null;
  /** Executable of the source process, from /proc/<pid>/exe. Null when the read is denied. */
  appExe: string | null;
  /** Title of the focused window: usually the page, file or document name. */
  windowTitle: string | null;
}

/** A row of the `entries` table. Column names match the JSON fields. */
export interface Entry extends NewEntry {
  /** Assigned by SQLite on insert. */
  id: number;
}

/** One subcategory's entries, as returned by GET /categories/:category?group=subcategory. */
export interface EntryGroup {
  /** Subcategory key, or null for entries stored under the category alone. */
  subcategory: string | null;
  /** Name from tasking.json, e.g. "grocery". Null for the category-alone group and for a subcategory no longer in tasking.json. */
  name: string | null;
  entries: Entry[];
}
