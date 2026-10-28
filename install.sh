#!/usr/bin/env bash
#
# Installer for Spotify Controls + Track Info (fork by szczerel).
# Installs the extension for the current user only (no sudo needed).
#
# Usage:
#   ./install.sh                 install / update
#   ./install.sh --reset-icons   install / update and overwrite your custom icons
#                                (the old icons are backed up first)
#   ./install.sh --uninstall     remove the extension
#   ./install.sh --help
#
set -euo pipefail

UUID="spotify-control-ext@szczerel.github.com"
OLD_UUID="spotify-controls@Sonath21"   # the original extension this is a fork of
REQUIRED_SHELL=51

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
DEST="$EXT_ROOT/$UUID"

FILES=(extension.js prefs.js i18n.js metadata.json stylesheet.css LICENSE THIRD-PARTY-NOTICES.md)

info() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m==> Warning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m==> Error:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
    sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

uninstall() {
    command -v gnome-extensions >/dev/null && gnome-extensions disable "$UUID" 2>/dev/null || true
    if [[ -d "$DEST" ]]; then
        rm -rf "$DEST"
        info "Removed $DEST"
    else
        info "Nothing to remove, the extension is not installed."
    fi
}

RESET_ICONS=0
case "${1:-}" in
    "")              ;;
    --reset-icons)   RESET_ICONS=1 ;;
    --uninstall)     uninstall; exit 0 ;;
    -h|--help)       usage; exit 0 ;;
    *)               usage; die "Unknown option: $1" ;;
esac

# --- Checks -----------------------------------------------------------------
command -v glib-compile-schemas >/dev/null \
    || die "glib-compile-schemas not found. Install your distro's GLib tools (e.g. libglib2.0-bin / glib2-devel)."
command -v gnome-extensions >/dev/null \
    || warn "gnome-extensions not found, the extension will have to be enabled manually."

for f in "${FILES[@]}"; do
    [[ -f "$SRC_DIR/$f" ]] || die "Missing $f - run this script from the extracted project folder."
done
for d in icons locale schemas; do
    [[ -d "$SRC_DIR/$d" ]] || die "Missing $d/ - run this script from the extracted project folder."
done

if command -v gnome-shell >/dev/null; then
    shell_major="$(gnome-shell --version | grep -oE '[0-9]+' | head -n1 || true)"
    if [[ -n "$shell_major" && "$shell_major" -ne "$REQUIRED_SHELL" ]]; then
        warn "This extension supports GNOME Shell $REQUIRED_SHELL only, you are running $shell_major."
        warn "It will be installed, but GNOME will most likely refuse to load it."
    fi
fi

# --- The original extension would show a second indicator ---------------------
if [[ -d "$EXT_ROOT/$OLD_UUID" ]]; then
    warn "The original extension ($OLD_UUID) is installed. Disabling it to avoid two indicators."
    gnome-extensions disable "$OLD_UUID" 2>/dev/null || true
fi

# --- Install -------------------------------------------------------------------
info "Installing to $DEST"
mkdir -p "$DEST/icons" "$DEST/locale" "$DEST/schemas"

for f in "${FILES[@]}"; do
    cp -f "$SRC_DIR/$f" "$DEST/$f"
done

# Translations: overwrite the shipped ones, keep any extra language files.
cp -rf "$SRC_DIR/locale/." "$DEST/locale/"

# Icons: keep the user's customised icons unless --reset-icons is given.
if [[ $RESET_ICONS -eq 1 && -n "$(ls -A "$DEST/icons" 2>/dev/null)" ]]; then
    backup="$DEST/icons.backup-$(date +%Y%m%d-%H%M%S)"
    cp -r "$DEST/icons" "$backup"
    info "Backed up the current icons to $backup"
fi
for icon in "$SRC_DIR"/icons/*; do
    target="$DEST/icons/$(basename "$icon")"
    if [[ $RESET_ICONS -eq 1 || ! -e "$target" ]]; then
        cp -f "$icon" "$target"
    fi
done

# Settings schema (must be compiled for the extension to load).
cp -f "$SRC_DIR"/schemas/*.gschema.xml "$DEST/schemas/"
glib-compile-schemas "$DEST/schemas"

# --- Enable ----------------------------------------------------------------------
if command -v gnome-extensions >/dev/null && gnome-extensions enable "$UUID" 2>/dev/null; then
    info "Extension enabled. If you updated an installed copy, log out and back in to reload it."
else
    info "Installed. GNOME Shell does not know about the new extension yet:"
    echo "    1. Log out and log back in (Wayland), or press Alt+F2, type 'r' and Enter (X11)."
    echo "    2. Then run:  gnome-extensions enable $UUID"
fi
info "Open the settings with:  gnome-extensions prefs $UUID"
