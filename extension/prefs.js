import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class QuickTaskPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({title: _('Capture')});
        window.add(page);

        const server = new Adw.PreferencesGroup({
            title: _('Task server'),
            description: _('Where each capture is POSTed.'),
        });
        page.add(server);

        const endpoint = new Adw.EntryRow({title: _('Endpoint URL')});
        settings.bind('endpoint', endpoint, 'text', Gio.SettingsBindFlags.DEFAULT);
        server.add(endpoint);

        const timeout = new Adw.SpinRow({
            title: _('Timeout'),
            subtitle: _('Seconds before the server is reported unreachable'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 30, step_increment: 1}),
        });
        settings.bind('timeout-seconds', timeout, 'value', Gio.SettingsBindFlags.DEFAULT);
        server.add(timeout);

        const shortcut = new Adw.PreferencesGroup({
            title: _('Shortcut'),
            description: _('Change it with gsettings; see Configuration in the README.'),
        });
        page.add(shortcut);

        const current = new Adw.ActionRow({
            title: _('Current shortcut'),
            subtitle: settings.get_strv('capture-shortcut').join(', ') || _('none'),
        });
        shortcut.add(current);
    }
}
