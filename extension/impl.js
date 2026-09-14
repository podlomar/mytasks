import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Soup from 'gi://Soup';

import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';

const CAPTURE_KEY = 'capture-shortcut';
const ENTER_KEYS = [Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter];
// Roughly how many characters of chip labels fit on one row of the dialog.
const CHIP_ROW_CHARS = 46;

/**
 * The implementation. Re-imported fresh on every enable() by extension.js, so
 * edits to this file take effect on a disable/enable cycle with no logout.
 *
 * Because of that re-import, nothing here may call GObject.registerClass:
 * registering the same type name a second time throws. The dialog is composed
 * from the shell's own classes instead of subclassing them.
 */
export default class QuickTask {
    constructor(extension) {
        this._extension = extension;
    }

    enable() {
        this._settings = this._extension.getSettings();
        this._cancellable = new Gio.Cancellable();
        this._session = new Soup.Session();
        this._session.set_timeout(this._settings.get_int('timeout-seconds'));

        Main.wm.addKeybinding(
            CAPTURE_KEY,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => this._capture()
        );
    }

    disable() {
        Main.wm.removeKeybinding(CAPTURE_KEY);
        // close() drops the modal grab synchronously. A dialog left open across
        // a reload would hold the keyboard with no code left to release it.
        this._dialog?.close();
        this._dialog = null;
        this._cancellable?.cancel();
        this._cancellable = null;
        this._session?.abort();
        this._session = null;
        this._source?.destroy();
        this._source = null;
        this._lastBanner = null;
        this._settings = null;
    }

    /**
     * Hotkey handler. Window context is collected synchronously first: the
     * clipboard read is async, and once the dialog opens it owns the focus.
     */
    _capture() {
        if (this._dialog)
            return;

        const context = this._collectContext();
        const date = new Date().toISOString();

        this._readSelection(text => {
            // The extension may have been disabled while the clipboard answered.
            if (this._settings && !this._dialog)
                this._openDialog({date, text, context});
        });
    }

    /** The highlighted text, falling back to whatever was last copied. */
    _readSelection(callback) {
        const clipboard = St.Clipboard.get_default();
        clipboard.get_text(St.ClipboardType.PRIMARY, (_cb, primary) => {
            if (primary?.trim()) {
                callback(primary);
                return;
            }
            clipboard.get_text(St.ClipboardType.CLIPBOARD, (_cb2, clip) => callback(clip ?? ''));
        });
    }

    /** Where this capture came from: the focused window and its app. */
    _collectContext() {
        const win = global.display.focus_window;
        const tracker = Shell.WindowTracker.get_default();
        const app = win ? tracker.get_window_app(win) : tracker.focus_app;

        return {
            appId: app?.get_id() ?? null,
            appName: app?.get_name() ?? null,
            appExe: this._readProcLink(win?.get_pid() ?? null, 'exe'),
            windowTitle: win?.get_title() ?? null,
        };
    }

    /** Resolve /proc/<pid>/<name>. The read can be denied, so never throw. */
    _readProcLink(pid, name) {
        if (!(pid > 0))
            return null;
        try {
            return GLib.file_read_link(`/proc/${pid}/${name}`);
        } catch {
            return null;
        }
    }

    _openDialog(capture) {
        const dialog = new ModalDialog.ModalDialog({styleClass: 'quick-task-dialog'});
        this._dialog = dialog;
        dialog.connect('closed', () => {
            if (this._dialog === dialog)
                this._dialog = null;
        });

        try {
            this._buildDialog(dialog, capture);
            if (!dialog.open())
                throw new Error('Another window is holding the keyboard.');
        } catch (e) {
            // Never leave a half-built dialog holding the keyboard.
            dialog.popModal();
            dialog.destroy();
            this._dialog = null;
            this._fail('Quick Task: could not open the dialog', String(e.message ?? e));
        }
    }

    /**
     * App name and window title up top, then the selection and a note, a
     * category picker, and Cancel / Add. Esc cancels; Ctrl+Enter adds, because
     * plain Enter is a newline in both fields.
     */
    _buildDialog(dialog, {date, text, context}) {
        const content = dialog.contentLayout;

        content.add_child(new Dialog.MessageDialogContent({
            title: context.appName ?? 'Unknown app',
            description: context.windowTitle ?? '',
        }));

        const textField = this._textArea(text, 'Selected text', 'quick-task-text');
        const noteField = this._textArea('', 'Add a note…', 'quick-task-note');
        content.add_child(textField.view);
        content.add_child(noteField.view);

        // Top-level categories, plus a second row of subcategories for those that
        // have them (buy). The stored value is the category alone ("todo",
        // "buy"), or "buy:ele" when a subcategory is chosen.
        let taxonomy = [];
        try {
            taxonomy = this._loadTaxonomy();
        } catch (e) {
            this._fail('Quick Task: could not read tasking.json', String(e.message ?? e));
        }

        let category = null;
        let current = null;
        const chosenSub = new Map();
        const subRows = new Map();
        const updateCategory = () => {
            if (!current)
                category = null;
            else if (chosenSub.get(current.key))
                category = `${current.key}:${chosenSub.get(current.key)}`;
            else
                category = current.key;
        };

        const topRow = this._chipGroup(
            taxonomy.map(c => ({key: c.key, label: c.key})),
            'quick-task-categories',
            key => {
                current = taxonomy.find(c => c.key === key);
                for (const [k, row] of subRows)
                    row.actor.visible = k === key;
                updateCategory();
            });

        for (const c of taxonomy.filter(t => t.subcategories.length > 0)) {
            const row = this._chipGroup(
                c.subcategories.map(sub => ({key: sub.key, label: sub.name})),
                'quick-task-subcategories',
                subKey => {
                    chosenSub.set(c.key, subKey);
                    updateCategory();
                },
                {allowNone: true});
            // Nothing preselected: with no subcategory the entry is stored as the
            // category alone, which is every category's default.
            row.actor.visible = false;
            subRows.set(c.key, row);
        }

        if (taxonomy.length > 0) {
            content.add_child(topRow.actor);
            for (const row of subRows.values())
                content.add_child(row.actor);
            topRow.select(taxonomy[0].key);
        }

        const status = new St.Label({
            style_class: 'quick-task-status',
            x_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        status.clutter_text.line_wrap = true;
        content.add_child(status);

        let busy = false;
        const add = {label: 'Add', default: true, action: () => submit()};
        dialog.setButtons([
            {label: 'Cancel', key: Clutter.KEY_Escape, action: () => dialog.close()},
            add,
        ]);

        const hasContent = () => /\S/.test(textField.text.text) || /\S/.test(noteField.text.text);
        const refresh = () => (add.button.reactive = !busy && hasContent());

        for (const field of [textField, noteField]) {
            field.text.connect('text-changed', refresh);
            field.text.connect('key-press-event', (_actor, event) => {
                const ctrl = event.get_state() & Clutter.ModifierType.CONTROL_MASK;
                if (ctrl && ENTER_KEYS.includes(event.get_key_symbol())) {
                    submit();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
        }
        refresh();

        const submit = () => {
            if (!add.button.reactive)
                return;

            busy = true;
            refresh();
            add.button.label = 'Adding…';
            status.hide();

            // The stored shape, field for field: server/types.ts is the reference.
            const payload = {
                date,
                text: textField.text.text,
                note: noteField.text.text,
                source: 'desktop',
                category,
                ...context,
            };

            this._post(payload, error => {
                if (!this._settings)
                    return; // disabled mid-request - the cancellable already fired

                const stillOpen = this._dialog === dialog;
                if (!error) {
                    if (stillOpen)
                        dialog.close();
                    this._succeed(payload);
                } else if (stillOpen) {
                    // Keep the dialog so nothing typed is lost; show why and let Add retry.
                    busy = false;
                    add.button.label = 'Add';
                    refresh();
                    status.text = error;
                    status.show();
                    console.error(`[quick-task] ${error}`);
                    global.display.get_sound_player().play_from_theme('dialog-error', 'Capture failed', null);
                } else {
                    this._fail('Quick Task: capture not saved', error);
                }
            });
        };

        dialog.setInitialKeyFocus(noteField.text);
    }

    /**
     * Categories from tasking.json, which install.sh copies next to this file:
     * top-level categories in file order, each with its subcategories, if any.
     * Read on every dialog open, so the dialog never shows a stale list.
     */
    _loadTaxonomy() {
        const path = this._extension.dir.get_child('tasking.json').get_path();
        const [, bytes] = GLib.file_get_contents(path);
        const {taxonomy} = JSON.parse(new TextDecoder().decode(bytes));
        return Object.entries(taxonomy).map(([key, def]) => ({
            key,
            subcategories: Object.entries(def.subcategories ?? {})
                .map(([subKey, sub]) => ({key: subKey, name: sub.name ?? subKey})),
        }));
    }

    /**
     * Chips that behave as a radio group, in centred rows. Rows are split by
     * label length rather than by a wrapping layout manager: Clutter.FlowLayout,
     * which nothing in GNOME Shell itself uses, left the chips with no visible
     * size. Plain St.BoxLayout rows are what the shell's own dialogs use.
     */
    _chipGroup(options, styleClass, onSelect, {allowNone = false} = {}) {
        const actor = new St.BoxLayout({
            style_class: `quick-task-chips ${styleClass}`,
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
        });

        const chips = new Map();
        let selected = null;
        const select = key => {
            // With allowNone, choosing the selected chip again clears the choice.
            selected = allowNone && key === selected ? null : key;
            for (const [k, chip] of chips)
                chip.checked = k === selected;
            onSelect(selected);
        };

        let row = null;
        let used = 0;
        for (const {key, label} of options) {
            // A chip costs its label plus about four characters of padding and spacing.
            const cost = label.length + 4;
            if (!row || used + cost > CHIP_ROW_CHARS) {
                row = new St.BoxLayout({
                    style_class: 'quick-task-chip-row',
                    x_align: Clutter.ActorAlign.CENTER,
                });
                actor.add_child(row);
                used = 0;
            }
            used += cost;

            const chip = new St.Button({
                style_class: 'button quick-task-chip',
                label,
                toggle_mode: true,
                can_focus: true,
            });
            chip.connect('clicked', () => select(key));
            row.add_child(chip);
            chips.set(key, chip);
        }

        return {actor, select};
    }

    /**
     * A wrapping multi-line text box. St has no text-area widget, so this is an
     * St.Entry with its inner Clutter.Text taken out of single-line mode, inside
     * a scroll view that CSS caps with max-height.
     */
    _textArea(initial, hint, styleClass) {
        const entry = new St.Entry({
            style_class: 'quick-task-entry',
            hint_text: hint,
            can_focus: true,
            reactive: true,
            x_expand: true,
        });
        ShellEntry.addContextMenu(entry);

        const text = entry.clutter_text;
        text.single_line_mode = false;
        text.line_wrap = true;
        text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        text.activatable = false;
        text.set_text(initial);

        // The inner Clutter.Text only covers the lines it holds, so most of an
        // empty note box is frame, and St.Entry does not pass clicks there on to
        // the text. Do it here, putting the cursor at the end like a text area.
        // Bubble phase: Clutter.Text stops clicks that land on the text itself,
        // so those keep their usual cursor placement and never reach this.
        const click = new Clutter.ClickGesture();
        click.set_required_button(Clutter.BUTTON_PRIMARY);
        click.connect('recognize', () => {
            text.grab_key_focus();
            text.set_cursor_position(-1);
            text.set_selection_bound(-1);
        });
        entry.add_action(click);

        // St.Entry centres its text and placeholder vertically, so with a
        // min-height on the box (the note) both would float in the middle.
        // Hand that minimum to the text and the placeholder instead: each then
        // fills the box and starts at the top. The height stays defined in CSS.
        entry.connect('style-changed', () => {
            const min = Math.max(entry.get_theme_node().get_min_height(), 0);
            text.min_height = min;
            if (entry.hint_actor)
                entry.hint_actor.min_height = min;
        });

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        box.add_child(entry);

        const view = new St.ScrollView({
            style_class: `quick-task-field ${styleClass}`,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            child: box,
        });

        // Clutter.Text knows nothing about the scroll view around it, so keep the
        // cursor visible by hand: when it moves, and again after relayout grows
        // the content (the adjustment's bounds change then).
        const adjustment = view.vadjustment;
        const follow = () => {
            const [ok, , y, lineHeight] = text.position_to_coords(text.cursor_position);
            if (!ok)
                return;
            const top = entry.y + text.y + y;
            const bottom = top + lineHeight;
            if (top < adjustment.value)
                adjustment.value = top;
            else if (bottom > adjustment.value + adjustment.page_size)
                adjustment.value = bottom - adjustment.page_size;
        };
        text.connect('cursor-changed', follow);
        adjustment.connect('changed', follow);

        return {view, text};
    }

    /** POST the capture; done(null) on success, done(message) on failure. */
    _post(payload, done) {
        const url = this._settings.get_string('endpoint');
        let message = null;
        try {
            message = Soup.Message.new('POST', url);
        } catch {}
        if (message === null) {
            done(`Not a valid endpoint URL: ${url}`);
            return;
        }

        message.set_request_body_from_bytes(
            'application/json',
            new GLib.Bytes(new TextEncoder().encode(JSON.stringify(payload)))
        );

        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            this._cancellable,
            (session, result) => {
                let error = null;
                try {
                    session.send_and_read_finish(result);
                    const status = message.get_status();
                    if (status < 200 || status >= 300)
                        error = `The task server answered ${status} ${message.get_reason_phrase() ?? ''}`.trim();
                } catch (e) {
                    error = `Could not reach the task server at ${url}: ${e.message ?? e}`;
                }
                done(error);
            }
        );
    }

    /**
     * Success is a chime plus a transient banner. Transient means it shows and
     * then goes, without leaving an entry in the notification list. Each success
     * replaces the previous one, so rapid captures cannot stack banners.
     */
    _succeed({text, note, category}) {
        global.display.get_sound_player().play_from_theme('complete', 'Task added', null);
        this._banner(category ? `Added to ${category}` : 'Task added',
            this._preview(/\S/.test(text) ? text : note),
            {urgency: MessageTray.Urgency.NORMAL, isTransient: true, replace: true});
    }

    /**
     * Failure outside the dialog is loud and it stays put: a task you meant to
     * record did not land. CRITICAL urgency also shows through Do Not Disturb,
     * and failures are never replaced, because each one is a separate loss.
     */
    _fail(title, body) {
        console.error(`[quick-task] ${title}: ${body}`);
        global.display.get_sound_player().play_from_theme('dialog-error', 'Capture failed', null);
        this._banner(title, body,
            {urgency: MessageTray.Urgency.CRITICAL, isTransient: false, replace: false});
    }

    /** One line of text, enough to confirm the right thing was captured. */
    _preview(text, max = 120) {
        const flat = text.replace(/\s+/g, ' ').trim();
        return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
    }

    /** This extension's own entry in the notification list. */
    _ensureSource() {
        if (!this._source) {
            this._source = new MessageTray.Source({
                title: 'Quick Task',
                iconName: 'checkbox-checked-symbolic',
            });
            this._source.connect('destroy', () => {
                this._source = null;
                this._lastBanner = null;
            });
            Main.messageTray.add(this._source);
        }
        return this._source;
    }

    _banner(title, body, {urgency, isTransient, replace}) {
        try {
            const source = this._ensureSource();

            // Source.addNotification ignores a notification it already holds, so
            // replacing means destroying the old one and building a fresh one.
            if (replace) {
                this._lastBanner?.destroy();
                this._lastBanner = null;
            }

            const notification = new MessageTray.Notification({
                source,
                title,
                body,
                urgency,
                isTransient,
            });
            source.addNotification(notification);

            if (replace) {
                this._lastBanner = notification;
                notification.connect('destroy', () => {
                    if (this._lastBanner === notification)
                        this._lastBanner = null;
                });
            }
        } catch (e) {
            console.error(`[quick-task] could not show a notification: ${e}`);
        }
    }
}
