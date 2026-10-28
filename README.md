# Spotify Controls Extended ![Spotify Controls Logo](./icons/spotify.svg)

**Spotify Controls Extended** is a GNOME Shell extension that puts Spotify right into your top bar: the Spotify logo, the current artist and track, playback controls (previous, play/pause, next), shuffle and loop buttons - all without leaving your workflow.

> **Works on GNOME Shell 51 only.** The fork is kept up to date with the latest GNOME release, see [Why this fork exists](#why-this-fork-exists).
> Running an older GNOME (45-50)? Use the [original extension on extensions.gnome.org](https://extensions.gnome.org/extension/7406/spotify-controls/).

## Why this fork exists

This is a **fork of [Sonath21/spotify-controls](https://github.com/Sonath21/spotify-controls)**, created by **Athanasios Raptis (Sonath21)**. The idea, the original code and a big part of what you see here come from him and from the contributors listed [below](#contributors) - thank you!

This fork exists out of love for GNOME and for this extension. I honestly can't imagine my daily life without it, and I want to make sure it keeps working and keeps getting better. I will do my best to release an update within 1-2 weeks after every new GNOME release.

## Features

- **Real-time track information:** current artist and track title (the order can be swapped to *Track - Artist*).
- **Playback controls:** previous, play/pause and next buttons.
- **Shuffle button:** toggles between 2 modes (on / off).
- **Loop button:** cycles through 3 modes (off / playlist / track).
- **Volume control:** scroll over the track title to change Spotify's volume (mouse wheel and touchpad).
- **Click actions:** click the title to bring Spotify to the front (a second click can minimize it), middle-click to play/pause.
- **Dynamic visibility:** the indicator only appears while Spotify is running.
- **Highly customizable:** position in the top bar, side of the controls, side and order of the shuffle/loop buttons, what is shown and the maximum width.
- **Custom icons:** all icons are plain SVG files you can replace with your own. The shuffle/loop icons are modified [Lucide](https://lucide.dev) icons.
- **Languages:** English and Polish, with automatic system language detection. Adding a language means adding one JSON file.

## Screenshots

![Spotify Controls in Action](./screenshots/spotify-controls-demo.png)

## Installation

Requirements: **GNOME Shell 51**, Spotify (the desktop app) and `glib-compile-schemas` (package `libglib2.0-bin` on Debian/Ubuntu, `glib2` / `glib2-devel` on Fedora/Arch).

```bash
git clone https://github.com/szczerel/spotify-control-ext.git
cd spotify-control-ext
./install.sh
```

Or download the repository as a ZIP from GitHub, extract it and run `./install.sh` inside the extracted folder.

The script installs the extension for your user only (`~/.local/share/gnome-shell/extensions/`), compiles the settings schema and enables the extension. After the **first** installation GNOME Shell has to discover the extension: log out and back in (or on X11 press `Alt+F2`, type `r`, Enter), then run `gnome-extensions enable spotify-control-ext@szczerel.github.com` if it is not enabled yet.

| Command | What it does |
| --- | --- |
| `./install.sh` | Installs or updates the extension. Your custom icons and extra language files are kept. |
| `./install.sh --reset-icons` | Same, but overwrites the icons with the shipped ones (a backup of the old icons is made first). |
| `./install.sh --uninstall` | Removes the extension. |

> If you have the original `spotify-controls@Sonath21` installed, the installer disables it so you don't get two indicators. The settings are shared, so your configuration is kept.

Open the settings with `gnome-extensions prefs spotify-control-ext@szczerel.github.com` or from the Extensions app.

## Custom icons

Every icon lives in the `icons` folder of the extension (the settings window has a button that opens it). You are welcome to tinker with them and make them your own - just keep the file names:

| File | Used for |
| --- | --- |
| `repeat-off.svg` | Loop: off |
| `repeat-context.svg` | Loop: playlist / album |
| `repeat-track.svg` | Loop: single track |
| `shuffle-on.svg` | Shuffle: on |
| `shuffle-off.svg` | Shuffle: off |
| `spotify.svg` | Spotify logo |

The shuffle and loop icons are **modified icons from [Lucide](https://lucide.dev)** (ISC License, portions MIT) - see [Third-party notices](#third-party-notices).

**Make a backup of the folder before changing anything.** Missing or broken icon files can break the extension (if a shuffle/loop icon is missing a generic system icon is shown instead, but don't count on it for the rest).

## Translations

Translations are JSON files in the `locale/` folder (`en.json`, `pl.json`). The language is chosen in the settings (*Automatic* follows your system language and falls back to English). To add a language, copy `en.json` to `<code>.json` (e.g. `de.json`), translate the values and set `_language_name`. New files are picked up automatically.

## Patch notes

**Version 16** - first release of this fork (GNOME 51 only):
- Added: **shuffle button** (2 modes) and **loop button** (3 modes), with options to show/hide each of them.
- Added: option to choose on which side of the track info the shuffle/loop buttons appear (default: left, right behind the Spotify logo; when sharing a side with the playback controls they always come first).
- Added: option to reverse the order of the buttons (default: Shuffle, Loop; reversed: Loop, Shuffle).
- Added: option to show the track info as *Track - Artist* (default: *Artist - Track*).
- Added: custom icons (`repeat-off`, `repeat-context`, `repeat-track`, `shuffle-on`, `shuffle-off`) and a button in the settings that opens the icons folder.
- Added: language selection with automatic system language detection (English fallback); translations are JSON files in the `locale/` folder (Polish and English included).
- Added: `install.sh` for easy installation from GitHub.
- Changed: the settings window is wider by default (650 px).
- Changed: **GNOME 51 only**; support for GNOME 45-50 was dropped.
- Changed: the extension is now called **Spotify Controls Extended** and has a new UUID: `spotify-control-ext@szczerel.github.com`.
- Changed: clicks and scrolling are handled with `Clutter.ClickGesture` and `Clutter.ScrollController`. Volume control now also works with touchpads.
- Fixed: middle-click play/pause.
- Cleaned up the code (D-Bus helpers, settings handling, unused code).

**Version 15** *(reconstructed from the code, the original notes were not published)*:
- Added: GNOME 50 compatibility.
- Fixed: playback buttons not reacting on GNOME 49/50 (clicks are now handled directly instead of through the `clicked` signal).

**Version 13**:
- Bug fixed: Spotify opens even when pressing play/pause/next/previous [[22]](https://github.com/Sonath21/spotify-controls/issues/22) - submitted by **[r11b22](https://github.com/r11b22)**

**Version 12**:
- Bug fixed: Handle Podcast metadata to show as Artist [[18]](https://github.com/Sonath21/spotify-controls/pull/18) - submitted by **[andrewburgess](https://github.com/andrewburgess)**
- GNOME 49 compatibility

**Version 10**:
- Bug fixed: Spotify window bug when 'Close button should minimize the Spotify window' on the Spotify client. [[14]](https://github.com/Sonath21/spotify-controls/issues/14)
- Added: Show/hide Spotify icon option.
- Added: Show/hide Artist/Track info option.
- Added: Option to minimize the Spotify client on second click (first click brings it to the foreground, second click minimizes it).
- Added: Middle-click on the extension to play/pause the current track option.

**Version 9**:
- Added: "Volume Control via Scroll Wheel" feature - submitted by **[her0](https://github.com/Her0-GitHub)**
- Minimize the Spotify window if it's not minimized when clicking on the extension - submitted by **[AFCMS](https://github.com/AFCMS)**

**Version 8**:
- Added: option to hide playback controls from the top bar.
- Bug fix: the extension caused the distance between the default GNOME top bar icons to be bigger than normal.
- Bug fix: when opening Spotify for the first time, sometimes the name of the artist and the song did not load correctly on Fedora environments.

**Version 5**:
- Open Spotify by pressing on the extension in the top bar.
- Option to move the playback controls to the left.

## Contributors

- **[Sonath21 (Athanasios Raptis)](https://github.com/Sonath21)** - creator of the original extension.
- **[her0](https://github.com/Her0-GitHub)** - "Volume Control via Scroll Wheel" feature.
- **[AFCMS](https://github.com/AFCMS)** - minimizing the Spotify window when clicking on the extension.
- **[andrewburgess](https://github.com/andrewburgess)** - podcast metadata shown as artist.
- **[r11b22](https://github.com/r11b22)** - reported the bug where Spotify was launched by the playback buttons.

## Third-party notices

- The shuffle and loop icons are modified versions of icons from [Lucide](https://lucide.dev), licensed under the ISC License (portions MIT, derived from Feather). The full license text is in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
- The Spotify logo belongs to Spotify AB.

## License

GPL-3.0-or-later, see [LICENSE](./LICENSE) (the Lucide icons keep their own license, see above). This extension is not affiliated, funded, or in any way associated with Spotify.
