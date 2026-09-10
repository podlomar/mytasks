/** Payload sent by the GNOME shell extension on each hotkey capture. */
export interface CapturePayload {
  /** ISO-8601 time the hotkey was pressed, from the shell's clock. */
  capturedAt: string;
  /** The selected text, as edited in the dialog. May be empty. */
  text: string;
  /** Free-form note typed in the dialog. May be empty. */
  note: string;
  /** Category chosen in the dialog, e.g. "todo" or "shop/ikea". */
  category: string | null;
  /** Which selection buffer the text came from. */
  source: "primary" | "clipboard" | "none";
  /** The application that owned the focused window. */
  app: {
    /** Desktop file id, e.g. "firefox_firefox.desktop". */
    id: string | null;
    /** Human readable name, e.g. "Firefox". */
    name: string | null;
    wmClass: string | null;
    gtkApplicationId: string | null;
    /** Snap/Flatpak id when the app is sandboxed. */
    sandboxedAppId: string | null;
    pid: number | null;
    /** Resolved from /proc/<pid>/exe. */
    exe: string | null;
    /** Resolved from /proc/<pid>/cwd - the project dir, for terminals and editors. */
    cwd: string | null;
  };
  /** The focused window at the moment of capture. */
  window: {
    /** Usually the page title, file name, or document name. */
    title: string | null;
    id: number | null;
    workspace: number | null;
    monitor: number | null;
  };
}

/** A stored capture: the payload plus what the server assigned. */
export interface StoredCapture extends CapturePayload {
  id: string;
  receivedAt: string;
}
