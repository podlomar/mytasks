import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * A thin, stable loader.
 *
 * GNOME imports extension.js exactly once per shell process - see the comment
 * in the shell's own extensionSystem.js: "Extensions can only be imported
 * once". That would mean logging out to test every code change. So this file
 * stays deliberately trivial and never needs to change, while the real code in
 * impl.js is imported under a unique URI each time. A differing query string
 * defeats the module cache, so a disable/enable cycle picks up edits.
 *
 * Cost: each reload leaves the previous module in the JS module cache for the
 * life of the session. Fine for a development loop, not for thousands of them.
 */
export default class QuickTaskLoader extends Extension {
    async enable() {
        const uri = `${this.dir.get_child('impl.js').get_uri()}?v=${Date.now()}`;
        const {default: QuickTask} = await import(uri);

        this._impl = new QuickTask(this);
        this._impl.enable();
    }

    disable() {
        this._impl?.disable();
        this._impl = null;
    }
}
