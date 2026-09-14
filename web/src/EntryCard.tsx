import type { Entry } from "../../server/types.ts";
import { Linkified, timeAgo } from "./format.tsx";

export function EntryCard({ entry }: { entry: Entry }) {
  // A note-only capture has no text; show the note in its place.
  const hasText = entry.text.trim() !== "";
  const main = hasText ? entry.text : entry.note;
  const note = hasText ? entry.note : "";

  return (
    <article className="entry">
      <p className="entry-text">
        <Linkified text={main} />
      </p>
      {note && (
        <p className="entry-note">
          <Linkified text={note} />
        </p>
      )}
      <footer className="entry-meta">
        <time dateTime={entry.date} title={new Date(entry.date).toLocaleString()}>
          {timeAgo(entry.date)}
        </time>
        {entry.appName && <span> · {entry.appName}</span>}
        {entry.source === "mock" && <span className="badge">mock</span>}
        {entry.windowTitle && <div className="entry-window">{entry.windowTitle}</div>}
      </footer>
    </article>
  );
}
