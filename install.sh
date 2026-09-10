#!/usr/bin/env bash
# Compile the schema, sync the extension, and reload it.
set -euo pipefail

UUID="quick-task@podlomar.local"
SRC="$(cd "$(dirname "$0")" && pwd)/extension"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

glib-compile-schemas "$SRC/schemas/"
mkdir -p "$DEST"
cp -r "$SRC/." "$DEST/"
echo "installed -> $DEST"

known=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
          --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID" 2>/dev/null || true)

if [[ "$known" == *"'uuid'"* ]]; then
  gnome-extensions disable "$UUID"
  sleep 1
  gnome-extensions enable "$UUID"
  echo "reloaded."
  echo
  echo "That picks up edits to impl.js. It does NOT pick up edits to extension.js:"
  echo "GNOME imports extension.js once per shell process, so changing the loader"
  echo "itself still needs a log out and back in."
else
  echo
  echo "The shell has not loaded this extension yet. GNOME only scans for new"
  echo "extensions at startup and Wayland cannot restart the shell in place, so:"
  echo "  1. log out and back in"
  echo "  2. gnome-extensions enable $UUID"
fi

errors=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
           --method org.gnome.Shell.Extensions.GetExtensionErrors "$UUID" 2>/dev/null || true)
[[ "$errors" == "(@as [],)" || -z "$errors" ]] || echo "ERRORS: $errors"
