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

/*
 * Tiny JSON based translation helper shared by extension.js and prefs.js.
 *
 * Translations live in <extension dir>/locale/<code>.json (e.g. pl.json,
 * en.json, pt_BR.json). Every file is a flat { "key": "text" } object and may
 * contain a "_language_name" entry which is shown in the language selector.
 * Any new file dropped into the locale folder is picked up automatically.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/** Language used when the system language has no translation file. */
export const FALLBACK_LANGUAGE = 'en';

/** Value of the 'language' setting meaning "follow the system language". */
export const AUTO_LANGUAGE = 'auto';

const NAME_KEY = '_language_name';

/**
 * Reads and parses a JSON translation file.
 * @param {string} path - Absolute path to the file.
 * @returns {Object|null} Parsed object, or null if it can't be read.
 */
function readJson(path) {
    try {
        const [, bytes] = Gio.File.new_for_path(path).load_contents(null);
        const data = JSON.parse(new TextDecoder().decode(bytes));
        return data && typeof data === 'object' ? data : null;
    } catch (e) {
        console.error(`[Spotify Controls ERROR]: Failed to read translation ${path}`, e);
        return null;
    }
}

/**
 * Lists the languages available in the locale folder.
 * @param {string} extensionPath - The extension directory.
 * @returns {{code: string, name: string}[]} Languages sorted by name.
 */
export function listLanguages(extensionPath) {
    const dir = GLib.build_filenamev([extensionPath, 'locale']);
    const languages = [];

    let enumerator = null;
    try {
        enumerator = Gio.File.new_for_path(dir).enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);

        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const fileName = info.get_name();
            if (!fileName.endsWith('.json'))
                continue;

            const code = fileName.slice(0, -'.json'.length);
            const data = readJson(GLib.build_filenamev([dir, fileName]));
            if (data)
                languages.push({ code, name: data[NAME_KEY] || code });
        }
    } catch (e) {
        console.error(`[Spotify Controls ERROR]: Failed to list ${dir}`, e);
    } finally {
        enumerator?.close(null);
    }

    return languages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Picks the best available language for the current system locale.
 * Tries e.g. pl_PL first, then pl, for every entry of the system language
 * list, and finally falls back to FALLBACK_LANGUAGE.
 * @param {string[]} available - Available language codes.
 * @returns {string} A language code.
 */
export function detectSystemLanguage(available) {
    for (const name of GLib.get_language_names()) {
        // "pl_PL.UTF-8@euro" -> "pl_PL"
        const locale = name.split('.')[0].split('@')[0];
        if (!locale || locale === 'C' || locale === 'POSIX')
            continue;

        const candidates = [locale, locale.split('_')[0]];
        const match = candidates.find(code => available.includes(code));
        if (match)
            return match;
    }
    return FALLBACK_LANGUAGE;
}

/**
 * Translator resolves keys using the language chosen in the settings
 * ('auto' = system language), falling back to English and finally to the key.
 */
export class Translator {
    /**
     * @param {string} extensionPath - The extension directory.
     * @param {Gio.Settings} settings - The extension settings.
     */
    constructor(extensionPath, settings) {
        this._dir = GLib.build_filenamev([extensionPath, 'locale']);

        const available = listLanguages(extensionPath).map(l => l.code);
        const chosen = settings.get_string('language');

        this.language = available.includes(chosen)
            ? chosen
            : detectSystemLanguage(available);

        this._strings = this._load(this.language);
        this._fallback = this.language === FALLBACK_LANGUAGE
            ? this._strings
            : this._load(FALLBACK_LANGUAGE);
    }

    _load(code) {
        return readJson(GLib.build_filenamev([this._dir, `${code}.json`])) ?? {};
    }

    /**
     * Translates a key.
     * @param {string} key - Translation key.
     * @returns {string} The translated text (or the key if it is unknown).
     */
    t(key) {
        return this._strings[key] ?? this._fallback[key] ?? key;
    }
}
