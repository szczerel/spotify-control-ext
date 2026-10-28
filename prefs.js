/*
 * Spotify Controls Extension
 * Copyright (C) 2024 Athanasios Raptis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { AUTO_LANGUAGE, Translator, listLanguages } from './i18n.js';

/**
 * A { title, value } pair shown in a combo row.
 */
const ChoiceItem = GObject.registerClass(
    {
        GTypeName: 'SpotifyControlsChoiceItem',
        Properties: {
            'title': GObject.ParamSpec.string('title', 'Title', 'Title', GObject.ParamFlags.READWRITE, ''),
            'value': GObject.ParamSpec.string('value', 'Value', 'Value', GObject.ParamFlags.READWRITE, ''),
        },
    },
    class ChoiceItem extends GObject.Object {}
);

const POSITIONS = [
    'far-left', 'mid-left', 'rightmost-left',
    'middle-left', 'center', 'middle-right',
    'leftmost-right', 'mid-right', 'far-right',
];

const SIDES = ['left', 'right'];

/**
 * SpotifyControlsPrefs class handles the preferences window for the extension.
 */
export default class SpotifyControlsPrefs extends ExtensionPreferences {
    /**
     * Fills the preferences window with necessary widgets and settings.
     * The page is rebuilt whenever the language changes.
     * @param {Adw.PreferencesWindow} window - The preferences window.
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        let page = null;

        // The default size is ignored the first time the window opens after
        // login (gnome-shell issue #7201), so also request a minimum width.
        window.set_default_size(650, 800);
        window.set_size_request(650, -1);

        const rebuild = () => {
            const i18n = new Translator(this.path, settings);
            window.set_title(i18n.t('prefs.window_title'));

            const newPage = this._buildPage(settings, i18n, () => {
                // Rebuild outside of the signal handler of the old widgets.
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    rebuild();
                    return GLib.SOURCE_REMOVE;
                });
            });

            if (page)
                window.remove(page);
            window.add(newPage);
            page = newPage;
        };

        rebuild();
    }

    /**
     * Builds the whole preferences page.
     * @param {Gio.Settings} settings - The extension settings.
     * @param {Translator} i18n - Translator for the active language.
     * @param {Function} onLanguageChanged - Called after the language setting changed.
     * @returns {Adw.PreferencesPage} The page.
     */
    _buildPage(settings, i18n, onLanguageChanged) {
        const t = key => i18n.t(key);
        const page = new Adw.PreferencesPage();

        /** Adds a combo row bound to a string setting. */
        const addCombo = (group, key, titleKey, subtitleKey, choices) => {
            const store = new Gio.ListStore({ item_type: ChoiceItem });
            choices.forEach(({ title, value }) => store.append(new ChoiceItem({ title, value })));

            const row = new Adw.ComboRow({
                title: t(titleKey),
                subtitle: t(subtitleKey),
                model: store,
                expression: Gtk.PropertyExpression.new(ChoiceItem, null, 'title'),
            });

            const current = settings.get_string(key);
            const index = choices.findIndex(c => c.value === current);
            row.set_selected(index >= 0 ? index : 0);

            row.connect('notify::selected', () => {
                const item = store.get_item(row.get_selected());
                if (item && item.value !== settings.get_string(key)) {
                    settings.set_string(key, item.value);
                    if (key === 'language')
                        onLanguageChanged();
                }
            });

            group.add(row);
        };

        /** Adds a switch row bound to a boolean setting. */
        const addSwitch = (group, key, titleKey, subtitleKey) => {
            const row = new Adw.SwitchRow({
                title: t(titleKey),
                subtitle: t(subtitleKey),
            });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        };

        // LANGUAGE
        const languageGroup = new Adw.PreferencesGroup({ title: t('prefs.group_language') });
        addCombo(languageGroup, 'language', 'prefs.language_title', 'prefs.language_subtitle', [
            { title: t('prefs.language_auto'), value: AUTO_LANGUAGE },
            ...listLanguages(this.path).map(({ code, name }) => ({ title: name, value: code })),
        ]);
        page.add(languageGroup);

        // GENERAL
        const generalGroup = new Adw.PreferencesGroup({ title: t('prefs.group_general') });
        addCombo(generalGroup, 'position', 'prefs.position_title', 'prefs.position_subtitle',
            POSITIONS.map(value => ({ title: t(`position.${value}`), value })));
        addCombo(generalGroup, 'controls-position', 'prefs.controls_position_title', 'prefs.controls_position_subtitle',
            SIDES.map(value => ({ title: t(`controls_position.${value}`), value })));
        addCombo(generalGroup, 'modes-position', 'prefs.modes_position_title', 'prefs.modes_position_subtitle',
            SIDES.map(value => ({ title: t(`modes_position.${value}`), value })));
        addSwitch(generalGroup, 'enable-volume-control', 'prefs.volume_title', 'prefs.volume_subtitle');
        addSwitch(generalGroup, 'enable-middle-click', 'prefs.middle_click_title', 'prefs.middle_click_subtitle');
        addSwitch(generalGroup, 'minimize-on-second-click', 'prefs.minimize_title', 'prefs.minimize_subtitle');
        page.add(generalGroup);

        // DISPLAY
        const displayGroup = new Adw.PreferencesGroup({ title: t('prefs.group_display') });
        addSwitch(displayGroup, 'show-playback-controls', 'prefs.show_controls_title', 'prefs.show_controls_subtitle');
        addSwitch(displayGroup, 'show-spotify-icon', 'prefs.show_icon_title', 'prefs.show_icon_subtitle');
        addSwitch(displayGroup, 'show-track-info', 'prefs.show_track_info_title', 'prefs.show_track_info_subtitle');
        addSwitch(displayGroup, 'swap-artist-track', 'prefs.swap_artist_track_title', 'prefs.swap_artist_track_subtitle');
        addSwitch(displayGroup, 'show-shuffle', 'prefs.show_shuffle_title', 'prefs.show_shuffle_subtitle');
        addSwitch(displayGroup, 'show-loop', 'prefs.show_loop_title', 'prefs.show_loop_subtitle');
        addSwitch(displayGroup, 'reverse-modes-order', 'prefs.reverse_modes_title', 'prefs.reverse_modes_subtitle');

        const maxWidthRow = new Adw.ActionRow({
            title: t('prefs.max_width_title'),
            subtitle: t('prefs.max_width_subtitle'),
        });
        const maxWidthSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 10, page_increment: 50 }),
            numeric: true,
            valign: Gtk.Align.CENTER,
        });
        settings.bind('max-width', maxWidthSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
        maxWidthRow.add_suffix(maxWidthSpin);
        maxWidthRow.activatable_widget = maxWidthSpin;
        displayGroup.add(maxWidthRow);
        page.add(displayGroup);

        // ICONS
        const iconsGroup = new Adw.PreferencesGroup({
            title: t('prefs.group_icons'),
            description: t('prefs.icons_description'),
        });
        const iconsRow = new Adw.ActionRow({
            title: t('prefs.icons_open_title'),
            subtitle: t('prefs.icons_open_subtitle'),
        });
        const openButton = new Gtk.Button({
            label: t('prefs.icons_open_button'),
            valign: Gtk.Align.CENTER,
        });
        openButton.connect('clicked', () => {
            try {
                const iconsDir = Gio.File.new_for_path(GLib.build_filenamev([this.path, 'icons']));
                Gio.AppInfo.launch_default_for_uri(iconsDir.get_uri(), null);
            } catch (e) {
                console.error('[Spotify Controls ERROR]: Failed to open the icons folder', e);
            }
        });
        iconsRow.add_suffix(openButton);
        iconsRow.activatable_widget = openButton;
        iconsGroup.add(iconsRow);
        page.add(iconsGroup);

        return page;
    }
}
