# Quick Task Capture

Hit `Super+T` anywhere. A dialog opens with the selected text ready to edit,
a box for a note, and a category. Add POSTs it to a local REST API together
with everything GNOME knows about where it came from.

Two pieces:

- `extension/` — a GNOME Shell extension (GJS). Owns the hotkey, reads the
  selection, gathers context, sends the request, and reports the outcome.
  `extension.js` is a thin loader; `impl.js` holds everything real.
- `server/` — a small Express server that stores captures in SQLite. Test target; swap
  the endpoint for your real app when ready.

## Why a shell extension

Wayland only lets the compositor grab global hotkeys, and only code running
inside the compositor can see which window is focused. A standalone script could
read the selection but could never tell you it came from Firefox, from the page
"RFC 9110". That context is the point here,
so the tool lives inside GNOME Shell.

## The capture dialog

```
┌──────────────────────────────────────────────┐
│                  Firefox                     │
│      Designing resilient HTTP clients        │
│ ┌──────────────────────────────────────────┐ │
│ │ the retry budget should be per-endpoint… │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ Add a note…                              │ │
│ └──────────────────────────────────────────┘ │
│      (todo) (buy) (link) (note) (media)      │
│           (place) (event) (person)           │
│                          [Cancel]   [Add]    │
└──────────────────────────────────────────────┘
```

- The first box holds the highlighted text, or the clipboard if nothing is
  highlighted. Edit it freely. If both are empty it starts empty and the
  capture is just a note — the app and window context is still attached.
- The cursor starts in the note box.
- `Ctrl+Enter` adds, `Esc` cancels. Plain Enter is a new line in both boxes.
- Add is disabled until at least one box has text.
- Both boxes grow with their content and then scroll.
- Categories come from `tasking.json` at the repo root. The top-level ones
  are a row of chips, with `todo` preselected. Picking one that has
  subcategories (`buy`) shows a second row — grocery, home, electronics, … —
  starting at `general`. The stored category is then `buy:gro`, `buy:ele`, and
  so on.
- Chips sit in centred rows, split by label length.

## Feedback

| Outcome | What you get |
|---|---|
| Added | `complete` chime and a banner, `Added to todo` + a preview |
| Server error or unreachable | `dialog-error` chime; the dialog **stays open** with the error, so nothing you typed is lost — Add again to retry |
| Dialog closed before a failed request finished | `dialog-error` chime and a critical banner |

Success banners are **transient**: they show and go without leaving an entry in
the notification list, and each one replaces the last.

Failure banners persist until dismissed, are never replaced, and at critical
urgency show through Do Not Disturb.

## Running the server

```bash
cd server
npm start          # http://127.0.0.1:4123
npm run dev        # same, restarts on edit
```

Node runs the TypeScript directly — no build step. Captures are stored in the
`entries` table of `server/tasking.db`, using Node's built-in SQLite, so there
is no native module to build either. `GET /captures?limit=20` reads them back
newest first. Set `DB_PATH` to keep the database somewhere else.

The database runs in WAL mode, so you can browse it with any SQLite tool while
the server is running.

## Installing the extension

```bash
./install.sh
```

First time only, because GNOME scans for new extensions solely at startup and
Wayland cannot restart the shell in place:

1. `./install.sh`
2. Log out and back in
3. `gnome-extensions enable quick-task@podlomar.local`

After that, `./install.sh` syncs and reloads in one step.

### Why the loader exists

GNOME imports `extension.js` **once per shell process**. From the shell's own
`extensionSystem.js`:

```js
// Extensions can only be imported once, so add a property to avoid
// attempting to re-import an extension.
extension.isImported = true;
```

So disabling and re-enabling re-runs `enable()` on the module already in memory
— it never re-reads the file. Taken at face value that means logging out to test
every one-line change.

`extension.js` sidesteps it by staying trivial and importing `impl.js` under a
unique URI each time:

```js
const uri = `${this.dir.get_child('impl.js').get_uri()}?v=${Date.now()}`;
const {default: QuickTask} = await import(uri);
```

A differing query string misses the module cache, so the file is read afresh.
Edits to `impl.js` therefore need only a disable/enable cycle. Edits to
`extension.js` itself still need a logout — which is why it does nothing but
load.

Watch for errors with:

```bash
journalctl --user -f -o cat | grep quick-task
```

## Configuration

```bash
gnome-extensions prefs quick-task@podlomar.local     # GUI
```

or directly. The schema ships inside the extension rather than being installed
system-wide, so `gsettings` needs `--schemadir` to find it:

```bash
S=~/.local/share/gnome-shell/extensions/quick-task@podlomar.local/schemas
gsettings --schemadir $S set org.gnome.shell.extensions.quick-task endpoint 'http://127.0.0.1:4123/captures'
gsettings --schemadir $S set org.gnome.shell.extensions.quick-task capture-shortcut "['<Super>t']"
gsettings --schemadir $S set org.gnome.shell.extensions.quick-task timeout-seconds 3
```

Categories are not a setting. They come from `tasking.json`, which
`install.sh` copies into the extension: edit it, then run `./install.sh`.

A shell keybinding is a **global grab**: the compositor intercepts it before the
focused application ever sees it. That makes `Super` the right modifier here —
by desktop convention applications do not bind `Super`+letter, so nothing gets
shadowed. `<Super>t` is unused by every schema on this system.

Two combinations to avoid: `Ctrl+Alt+T` is Ubuntu's launch-terminal binding, and
`Ctrl+Shift+T` would silently break reopen-closed-tab in browsers, new-tab in
terminals, and reopen-closed-editor in VS Code.

## Payload

Each capture is POSTed as one flat object and stored as one row of the
`entries` table. The columns have the same names as the fields, plus an `id`
that SQLite assigns. `server/types.ts` is the reference.

```json
{
  "date": "2026-09-09T19:55:19.410Z",
  "text": "Local capture endpoint",
  "note": "",
  "source": "desktop",
  "category": "todo",
  "appId": "code.desktop",
  "appName": "Visual Studio Code",
  "appExe": "/usr/share/code/code",
  "windowTitle": "package.json - tasking - Visual Studio Code"
}
```

- `date` is when you pressed the hotkey, not when the server received it.
- `text` is the first box as you left it: the highlighted text, or the
  clipboard if nothing was highlighted. `note` is the second box. Either may
  be empty, but not both.
- `source` names the tool that captured it. This extension always sends
  `"desktop"`, leaving room for, say, a browser extension later.
- `category` is a key from `tasking.json`: a top-level category such as
  `todo`, or `category:subcategory` such as `buy:ele`.
- `appExe` comes from `/proc/<pid>/exe`, and is `null` when the process
  denies the read.
- `windowTitle` is the highest-value field for later summarization: it is
  usually the page title, file name, or document name.

## Known gap: browser URLs

GNOME cannot read a browser's address bar, only the window title. Captures from
a browser carry the page title but no URL. Closing that needs a companion browser
extension POSTing to the same endpoint.
