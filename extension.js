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

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Translator } from './i18n.js';

// Debugging flag and function to control debug logging
const DEBUG = false;

/**
 * Logs debug messages to the GNOME Shell log if debugging is enabled.
 * @param {string} message - The debug message to log.
 */
function logDebug(message) {
    if (DEBUG) {
        console.log(`[Spotify Controls DEBUG]: ${message}`);
    }
}

/**
 * Logs error messages to the GNOME Shell log.
 * @param {Error} error - The error object.
 * @param {string} message - Additional context for the error.
 */
function logError(error, message) {
    console.error(`[Spotify Controls ERROR]: ${message}`, error);
}

// Define constants for Spotify's MPRIS D-Bus interface
const SPOTIFY_BUS_NAME = 'org.mpris.MediaPlayer2.spotify'; // D-Bus bus name for Spotify
const SPOTIFY_OBJECT_PATH = '/org/mpris/MediaPlayer2'; // Object path for Spotify's MPRIS interface
const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player'; // Interface for player controls
const PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties'; // Interface for property changes

// Loop (repeat) modes in the order the button cycles through them, and the
// icon file (in the icons folder, without extension) used for each of them
const LOOP_CYCLE = ['None', 'Playlist', 'Track'];
const LOOP_ICONS = { None: 'repeat-off', Playlist: 'repeat-context', Track: 'repeat-track' };

// Generic theme icons used if one of the icon files is missing
const LOOP_FALLBACK_ICON = 'media-playlist-repeat-symbolic';
const SHUFFLE_FALLBACK_ICON = 'media-playlist-shuffle-symbolic';

// Settings that require the indicator to be rebuilt when they change
const REBUILD_SETTINGS = [
    'position',
    'controls-position',
    'show-playback-controls',
    'enable-volume-control',
    'show-spotify-icon',
    'show-track-info',
    'show-shuffle',
    'show-loop',
    'modes-position',
    'reverse-modes-order',
    'swap-artist-track',
    'max-width',
    'language',
];

/**
 * SpotifyIndicator Class
 * Extends PanelMenu.Button to create a Spotify controls indicator in the GNOME top bar.
 */
var SpotifyIndicator = GObject.registerClass(
    class SpotifyIndicator extends PanelMenu.Button {
        /**
         * Constructor for SpotifyIndicator.
         * @param {string} extensionPath - The path to the extension's directory.
         * @param {string} controlsPosition - Position of playback controls ('left' or 'right').
         * @param {Gio.Settings} settings - The settings object for the extension.
         */
        _init(extensionPath, controlsPosition, settings) {
            super._init(0.0, 'Spotify Controls');
            logDebug('SpotifyIndicator initialized');

            this.controlsPosition = controlsPosition;
            this._settings = settings;
            this._i18n = new Translator(extensionPath, settings);
            this._signalSubscriptionId = null;
            this._destroyed = false;

            // Current shuffle / loop state of Spotify and the cached mode icons
            this._loopStatus = 'None';
            this._shuffle = false;
            this._iconCache = new Map();
            this.shuffleButton = null;
            this.loopButton = null;

            // Initialize the _activeTimeouts array
            this._activeTimeouts = [];

            // Track gesture/controller signal connections so they can be
            // explicitly disconnected on destroy().
            this._gestures = [];

            // Store the extensionPath for later use
            this.extensionPath = extensionPath;

            this._buildUI(extensionPath);
            this._monitorSpotifyPresence();

        }

        /**
         * Helper function to create a separator.
         * @returns {St.Label} - A new St.Label instance acting as a separator.
         */
        _createSeparator() {
            return new St.Label({ text: ' ' });
        }

        /**
         * Builds the user interface components of the Spotify indicator.
         *
         * Three parts can be shown: the shuffle/loop buttons ("modes"), the
         * playback controls and the track button (Spotify icon + track info).
         * The modes and the controls go to the side chosen in the settings.
         * When both are on the same side the modes come first (left to right),
         * and when the modes are on the left they sit between the Spotify icon
         * and the track info.
         * @param {string} extensionPath - The path to the extension's directory.
         */
        _buildUI(extensionPath) {
            logDebug('Building UI');

            // Create the main horizontal box layout for the indicator
            const hbox = new St.BoxLayout({ style_class: 'spotify-hbox', reactive: true });
            this.add_child(hbox);

            // Middle click anywhere on the indicator toggles play/pause (if
            // enabled in the settings). It is attached to the inner box
            // instead of the PanelMenu.Button itself, because the button's
            // own click gesture would otherwise claim the middle click first.
            this._connectClick(hbox, () => this._handleMiddleClick(), Clutter.BUTTON_MIDDLE);

            const modesBox = this._buildModesBox();
            const controlsBox = this._buildControlsBox();
            const modesOnRight = this._settings.get_string('modes-position') === 'right';
            const controlsOnLeft = this.controlsPosition === 'left';

            // With the modes on the left, the Spotify icon is pulled out of
            // the track button so the modes can sit right behind it.
            const splitIcon = !modesOnRight && modesBox !== null &&
                this._settings.get_boolean('show-spotify-icon');
            const trackButton = this._buildTrackButton(extensionPath, !splitIcon);

            let parts;
            if (splitIcon) {
                const iconButton = this._buildIconButton(extensionPath);
                parts = controlsOnLeft
                    ? [iconButton, modesBox, controlsBox, trackButton]
                    : [iconButton, modesBox, trackButton, controlsBox];
            } else {
                const left = [];
                const right = [];
                (modesOnRight ? right : left).push(modesBox);
                (controlsOnLeft ? left : right).push(controlsBox);
                parts = [...left, trackButton, ...right];
            }

            parts.filter(Boolean).forEach((part, index) => {
                if (index > 0) {
                    for (let i = 0; i < 3; i++)
                        hbox.add_child(this._createSeparator());
                }
                hbox.add_child(part);
            });

            logDebug(`UI built (controls: ${this.controlsPosition}, modes: ${modesOnRight ? 'right' : 'left'}, split icon: ${splitIcon})`);
        }

        /**
         * Creates a flat icon button reacting to a left click.
         * @param {Object} iconProps - Properties for the St.Icon.
         * @param {Function} handler - Called when the button is clicked.
         * @returns {St.Button} The button.
         */
        _createButton(iconProps, handler) {
            const button = new St.Button({
                style_class: 'spotify-status-icon',
                child: new St.Icon(iconProps),
            });
            // The legacy 'clicked' signal of St.Button is unreliable for
            // buttons nested inside a PanelMenu.Button, so use
            // Clutter.ClickGesture controllers instead.
            this._connectClick(button, handler);
            return button;
        }

        /**
         * Builds the Previous / Play-Pause / Next buttons.
         * @returns {St.BoxLayout|null} The box, or null if the controls are hidden.
         */
        _buildControlsBox() {
            if (!this._settings.get_boolean('show-playback-controls'))
                return null;

            this.prevButton = this._createButton(
                { icon_name: 'media-skip-backward-symbolic' }, () => this._sendMPRISCommand('Previous'));
            this.playPauseButton = this._createButton(
                { icon_name: 'media-playback-pause-symbolic' }, () => this._sendMPRISCommand('PlayPause'));
            this.nextButton = this._createButton(
                { icon_name: 'media-skip-forward-symbolic' }, () => this._sendMPRISCommand('Next'));

            const box = new St.BoxLayout({ style_class: 'spotify-controls-box' });
            box.add_child(this.prevButton);
            box.add_child(this.playPauseButton);
            box.add_child(this.nextButton);
            return box;
        }

        /**
         * Builds the shuffle and loop buttons.
         * @returns {St.BoxLayout|null} The box, or null if both buttons are hidden.
         */
        _buildModesBox() {
            const buttons = [];

            if (this._settings.get_boolean('show-shuffle')) {
                this.shuffleButton = this._createButton({}, () => this._toggleShuffle());
                this._updateShuffleIcon();
                buttons.push(this.shuffleButton);
            }

            if (this._settings.get_boolean('show-loop')) {
                this.loopButton = this._createButton({}, () => this._cycleLoop());
                this._updateLoopIcon();
                buttons.push(this.loopButton);
            }

            if (buttons.length === 0)
                return null;

            // Default order: shuffle, loop. The option reverses it.
            if (this._settings.get_boolean('reverse-modes-order'))
                buttons.reverse();

            const box = new St.BoxLayout({ style_class: 'spotify-controls-box' });
            buttons.forEach(button => box.add_child(button));
            return box;
        }

        /**
         * Creates the Spotify logo.
         * @param {string} extensionPath - The path to the extension's directory.
         * @returns {St.Icon} The icon.
         */
        _createSpotifyIcon(extensionPath) {
            const icon = new St.Icon({
                gicon: Gio.icon_new_for_string(`${extensionPath}/icons/spotify.svg`),
                icon_size: 16,
                style_class: 'spotify-icon',
            });
            icon.visible = this._settings.get_boolean('show-spotify-icon');
            return icon;
        }

        /**
         * Builds a button with only the Spotify logo (used when the shuffle/loop
         * buttons sit between the logo and the track info).
         * @param {string} extensionPath - The path to the extension's directory.
         * @returns {St.Button} The button.
         */
        _buildIconButton(extensionPath) {
            this.spotifyIcon = this._createSpotifyIcon(extensionPath);
            const button = new St.Button({ child: this.spotifyIcon });
            this._connectClick(button, () => this._activateSpotifyWindow());
            return button;
        }

        /**
         * Builds the button with the track info (and the Spotify logo).
         * @param {string} extensionPath - The path to the extension's directory.
         * @param {boolean} withIcon - Whether the Spotify logo is part of this button.
         * @returns {St.Button} The button.
         */
        _buildTrackButton(extensionPath, withIcon) {
            // Container to contain the track info and spotify logo
            this.trackBox = new St.BoxLayout();

            // Button to show and hide spotify window
            this.trackButton = new St.Button({ child: this.trackBox });
            this._connectClick(this.trackButton, () => this._activateSpotifyWindow());

            if (withIcon) {
                this.spotifyIcon = this._createSpotifyIcon(extensionPath);
                this.trackBox.add_child(this.spotifyIcon);
                for (let i = 0; i < 3; i++)
                    this.trackBox.add_child(this._createSeparator());
            }

            // Artist and Song Title label
            const maxWidth = this._settings.get_int('max-width');
            this.trackLabel = new St.Label({
                text: this._i18n.t('extension.no_track'),
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: maxWidth ? `max-width: ${maxWidth}px;` : '',
            });

            // Display the track label with ellipsis if it exceeds the maximum width
            this.trackLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this.trackLabel.visible = this._settings.get_boolean('show-track-info');
            this.trackBox.add_child(this.trackLabel);

            // Add scroll controller to the widget for volume control
            if (this._settings.get_boolean('enable-volume-control'))
                this._connectVolumeScroll();

            return this.trackButton;
        }

        /**
         * Returns the icon for a shuffle/loop state: the SVG from the icons
         * folder, or a generic theme icon if the file is missing.
         * @param {string} name - Icon file name without extension.
         * @param {string} fallbackIconName - Theme icon used if the file is missing.
         * @returns {Gio.Icon} The icon.
         */
        _getModeIcon(name, fallbackIconName) {
            let icon = this._iconCache.get(name);
            if (!icon) {
                const file = Gio.File.new_for_path(`${this.extensionPath}/icons/${name}.svg`);
                icon = file.query_exists(null)
                    ? new Gio.FileIcon({ file })
                    : new Gio.ThemedIcon({ name: fallbackIconName });
                this._iconCache.set(name, icon);
            }
            return icon;
        }

        _updateLoopIcon() {
            if (this._destroyed || !this.loopButton)
                return;
            this.loopButton.child.gicon = this._getModeIcon(LOOP_ICONS[this._loopStatus], LOOP_FALLBACK_ICON);
        }

        _updateShuffleIcon() {
            if (this._destroyed || !this.shuffleButton)
                return;
            this.shuffleButton.child.gicon = this._getModeIcon(
                this._shuffle ? 'shuffle-on' : 'shuffle-off', SHUFFLE_FALLBACK_ICON);
        }

        /**
         * @param {string} status - MPRIS LoopStatus ('None', 'Playlist' or 'Track').
         */
        _setLoopStatus(status) {
            if (!LOOP_CYCLE.includes(status))
                return;
            this._loopStatus = status;
            this._updateLoopIcon();
        }

        /**
         * @param {boolean} enabled - Whether shuffle is on.
         */
        _setShuffle(enabled) {
            this._shuffle = Boolean(enabled);
            this._updateShuffleIcon();
        }

        /**
         * Switches Spotify to the next loop mode: off -> playlist -> track -> off.
         */
        async _cycleLoop() {
            const next = LOOP_CYCLE[(LOOP_CYCLE.indexOf(this._loopStatus) + 1) % LOOP_CYCLE.length];
            await this._setPlayerProperty('LoopStatus', new GLib.Variant('s', next));
            this._setLoopStatus(next);
        }

        /**
         * Toggles Spotify's shuffle mode.
         */
        async _toggleShuffle() {
            const next = !this._shuffle;
            await this._setPlayerProperty('Shuffle', new GLib.Variant('b', next));
            this._setShuffle(next);
        }

        /**
         * Attaches a Clutter.ClickGesture to an actor.
         * The gesture recognizes on press and only reacts to the given mouse
         * button, so it takes precedence over the click gesture of the parent
         * PanelMenu.Button.
         * @param {Clutter.Actor} actor - The actor to attach the gesture to.
         * @param {Function} handler - Handler invoked when the gesture recognizes.
         * @param {number} [mouseButton] - Required mouse button (default: primary).
         */
        _connectClick(actor, handler, mouseButton = Clutter.BUTTON_PRIMARY) {
            // Drop St.Button's built-in click gesture, ours replaces it.
            if (actor instanceof St.Button)
                actor.clear_actions();

            const gesture = new Clutter.ClickGesture();
            gesture.set_required_button(mouseButton);
            gesture.set_recognize_on_press(true);

            const signalId = gesture.connect('recognize', () => {
                try {
                    const result = handler();
                    if (result instanceof Promise)
                        result.catch(e => logError(e, 'Failed to handle click'));
                } catch (e) {
                    logError(e, 'Failed to handle click');
                }
            });

            actor.add_action(gesture);
            this._gestures.push({ gesture, signalId });
        }

        /**
         * Attaches a Clutter.ScrollController to the track button that raises
         * or lowers Spotify's volume (10% per step).
         */
        _connectVolumeScroll() {
            const flags = Clutter.ScrollControllerFlags.SCROLL_VERTICAL |
                Clutter.ScrollControllerFlags.DISCRETE;
            const controller = new Clutter.ScrollController({ flags });

            // The handler arguments are (sprite, source, dx, dy); dy is the last one.
            const signalId = controller.connect('scroll', (_controller, ...args) => {
                const dy = args[args.length - 1];
                if (typeof dy !== 'number' || dy === 0)
                    return;
                logDebug(`Scroll controller event, dy = ${dy}`);
                this._changeVolume(dy < 0 ? 0.1 : -0.1);
            });

            this.add_action(controller);
            this._gestures.push({ gesture: controller, signalId });
        }

        _handleMiddleClick() {
            const enableMiddleClick = this._settings.get_boolean('enable-middle-click');

            if (!enableMiddleClick)
                return;

            this._sendMPRISCommand('PlayPause')
                .catch(() => {
                    this._launchSpotify();
                });
        }

        /**
         * Activates (or minimizes) the Spotify window, depending on user preferences
         * and the current window state.
         */
        _activateSpotifyWindow() {
            logDebug('Attempting to activate Spotify window');

            // Retrieve the user setting for whether to minimize on second click
            const minimizeOnSecondClick = this._settings.get_boolean('minimize-on-second-click');
            logDebug(`minimizeOnSecondClick = ${minimizeOnSecondClick}`);

            // Retrieve all window actors
            let windowActors = global.get_window_actors();

            // Flag to check if Spotify window is found
            let spotifyFound = false;

            for (let actor of windowActors) {
                let window = actor.get_meta_window();
                let wmClass = window.get_wm_class();

                // Log details for debugging
                logDebug(`Window WM_CLASS: ${JSON.stringify(wmClass)} (Type: ${typeof wmClass})`);
                logDebug(`Window Title: ${window.get_title()} (Type: ${typeof window.get_title()})`);
                logDebug(`Window Workspace: ${window.get_workspace()} (Type: ${typeof window.get_workspace()})`);

                let isSpotify = false;

                if (Array.isArray(wmClass)) {
                    // If wmClass is an array, check if any element matches 'spotify'
                    isSpotify = wmClass.some(cls => cls.toLowerCase() === 'spotify');
                } else if (typeof wmClass === 'string') {
                    // If wmClass is a string, check if it matches 'spotify'
                    isSpotify = wmClass.toLowerCase() === 'spotify';
                }

                if (isSpotify) {
                    // Validate that 'window' has the 'activate' method
                    if (typeof window.activate !== 'function') {
                        logDebug('Window does not have an activate method. Skipping.');
                        continue;
                    }

                    try {
                        if (window.minimized) {
                            // If the window is minimized, unminimize and activate
                            window.unminimize();
                            logDebug("Spotify window unminimized");
                            window.activate(global.get_current_time());
                            logDebug("Spotify window activated");
                        } else {
                            // If it's not minimized and the user wants to
                            // minimize on second click, do so. Otherwise, do nothing.
                            if (minimizeOnSecondClick) {
                                window.minimize();
                                logDebug("Spotify window minimized");
                            } else {
                                logDebug("Spotify already in foreground; doing nothing.");
                            }
                        }

                        spotifyFound = true;
                        break; // Exit once we handle the Spotify window
                    } catch (e) {
                        logError(e, 'Failed to activate Spotify window');
                    }
                }
            }

            if (!spotifyFound) {
                logDebug('Spotify window not found. Attempting to launch Spotify to show its window.');
                this._launchSpotifyProcess(() => {});
            }
        }

        /**
         * Monitors Spotify's presence on the D-Bus.
         * Shows or hides the indicator based on whether Spotify is running.
         */
        _monitorSpotifyPresence() {
            logDebug('Starting to monitor Spotify presence');
            this.hide();

            // Watch for the Spotify MPRIS D-Bus name to appear or vanish
            this._spotifyWatcherId = Gio.DBus.session.watch_name(
                SPOTIFY_BUS_NAME,
                Gio.BusNameWatcherFlags.NONE,
                this._onSpotifyAppeared.bind(this),
                this._onSpotifyVanished.bind(this)
            );
        }

        /**
         * Callback function when Spotify appears on the D-Bus.
         * Shows the indicator and subscribes to property changes.
         */
        async _onSpotifyAppeared() {
            logDebug('Spotify appeared on D-Bus');
            this.show();

            // Subscribe to the PropertiesChanged signal first
            this._signalSubscriptionId = Gio.DBus.session.signal_subscribe(
                SPOTIFY_BUS_NAME,
                PROPERTIES_INTERFACE,
                'PropertiesChanged',
                SPOTIFY_OBJECT_PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                this._onPropertiesChanged.bind(this)
            );

            // Fetch the initial loop/shuffle state (not every Spotify build exposes it)
            this._getPlayerProperty('LoopStatus')
                .then(status => this._setLoopStatus(status))
                .catch(() => logDebug('LoopStatus is not available'));
            this._getPlayerProperty('Shuffle')
                .then(enabled => this._setShuffle(enabled))
                .catch(() => logDebug('Shuffle is not available'));

            // Fetch the initial PlaybackStatus and Metadata from Spotify after subscribing
            try {
                let playbackStatus = await this._getPlayerProperty('PlaybackStatus');
                this._updatePlayPauseIcon(playbackStatus);
                await this._retryFetchMetadata();
            } catch (e) {
                logError(e, 'Failed to get initial PlaybackStatus or Metadata');
            }
        }

        /**
         * Retry fetching Metadata with specified retries and delay.
         * @param {number} retries - Number of retry attempts.
         * @param {number} delay - Delay between retries in milliseconds.
         */
        async _retryFetchMetadata(retries = 3, delay = 500) {
            for (let i = 0; i < retries; i++) {
                try {
                    let metadata = await this._getMetadata();
                    if (metadata['xesam:artist'] && metadata['xesam:title']) {
                        this._updateTrackInfo(metadata);
                        logDebug('Successfully fetched valid Metadata on retry');
                        return;
                    }
                } catch (e) {
                    logError(e, 'Retry fetching Metadata failed');
                }

                // Await the cancellable sleep
                await this._sleep(delay);
            }
            logDebug('Failed to fetch valid Metadata after retries');
        }

        /**
         * Sleeps for the specified delay in milliseconds.
         * The timeout is tracked and can be cleared upon destruction.
         * @param {number} delay - The delay in milliseconds.
         * @returns {Promise<void>} - A Promise that resolves after the delay.
         */
        _sleep(delay) {
            return new Promise((resolve) => {
                const timeoutID = setTimeout(() => {
                    resolve();
                    // Remove the timeoutID from activeTimeouts once resolved
                    const index = this._activeTimeouts.indexOf(timeoutID);
                    if (index > -1) {
                        this._activeTimeouts.splice(index, 1);
                    }
                }, delay);
                this._activeTimeouts.push(timeoutID);
            });
        }

        /**
         * Handler for the PropertiesChanged signal from Spotify.
         * Updates the UI elements based on the changed properties.
         * @param {Gio.DBusConnection} connection - The D-Bus connection.
         * @param {string} sender - The sender's bus name.
         * @param {string} objectPath - The object path of the signal.
         * @param {string} interfaceName - The interface name of the signal.
         * @param {string} signalName - The name of the signal.
         * @param {GLib.Variant} parameters - The parameters of the signal.
         */
        _onPropertiesChanged(connection, sender, objectPath, interfaceName, signalName, parameters) {
            let [iface, changedProps, invalidatedProps] = parameters.deep_unpack();

            // Check if the signal is from the MPRIS Player Interface
            if (iface === MPRIS_PLAYER_INTERFACE) {
                // If PlaybackStatus has changed, update the Play/Pause button icon
                if (changedProps.PlaybackStatus) {
                    let playbackStatus = changedProps.PlaybackStatus.deep_unpack();
                    this._updatePlayPauseIcon(playbackStatus);
                    logDebug(`PlaybackStatus changed to ${playbackStatus}`);
                }

                if (changedProps.LoopStatus)
                    this._setLoopStatus(changedProps.LoopStatus.deep_unpack());

                if (changedProps.Shuffle)
                    this._setShuffle(changedProps.Shuffle.deep_unpack());

                // If Metadata has changed, update the track information label
                if (changedProps.Metadata) {
                    let metadataVariant = changedProps.Metadata.deep_unpack();

                    // Convert the metadata Variant into a plain JavaScript object
                    let metadata = {};
                    for (let key in metadataVariant) {
                        metadata[key] = metadataVariant[key].deep_unpack();
                    }

                    logDebug(`PropertiesChanged Metadata: ${JSON.stringify(metadata)}`);
                    this._updateTrackInfo(metadata);
                }
            }
        }

        /**
         * Calls a method on Spotify's MPRIS object.
         * @param {string} interfaceName - D-Bus interface.
         * @param {string} method - Method name.
         * @param {GLib.Variant|null} [parameters] - Method parameters.
         * @param {GLib.VariantType|null} [replyType] - Expected reply type.
         * @returns {Promise<GLib.Variant>} The reply.
         */
        _callDBus(interfaceName, method, parameters = null, replyType = null) {
            return new Promise((resolve, reject) => {
                Gio.DBus.session.call(
                    SPOTIFY_BUS_NAME,
                    SPOTIFY_OBJECT_PATH,
                    interfaceName,
                    method,
                    parameters,
                    replyType,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (connection, result) => {
                        try {
                            resolve(connection.call_finish(result));
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
        }

        /**
         * Reads a property of the MPRIS player interface.
         * @param {string} name - Property name (e.g. 'PlaybackStatus', 'Shuffle').
         * @returns {Promise<any>} The unpacked value.
         */
        async _getPlayerProperty(name) {
            const reply = await this._callDBus(
                PROPERTIES_INTERFACE,
                'Get',
                new GLib.Variant('(ss)', [MPRIS_PLAYER_INTERFACE, name]),
                GLib.VariantType.new('(v)')
            );
            const [value] = reply.deep_unpack();
            return value.deep_unpack();
        }

        /**
         * Writes a property of the MPRIS player interface.
         * @param {string} name - Property name (e.g. 'LoopStatus', 'Volume').
         * @param {GLib.Variant} value - The new value.
         * @returns {Promise<GLib.Variant>} The reply.
         */
        _setPlayerProperty(name, value) {
            return this._callDBus(
                PROPERTIES_INTERFACE,
                'Set',
                new GLib.Variant('(ssv)', [MPRIS_PLAYER_INTERFACE, name, value])
            );
        }

        /**
         * Retrieves the current Metadata from Spotify using D-Bus.
         * @returns {Promise<Object>} - A promise that resolves to the metadata object.
         */
        async _getMetadata() {
            const metadata = await this._getPlayerProperty('Metadata');

            const unpacked = {};
            for (const key in metadata)
                unpacked[key] = metadata[key].deep_unpack();

            logDebug(`Fetched Metadata: ${JSON.stringify(unpacked)}`);
            return unpacked;
        }

        /**
         * Updates the track information label with the current artist and song title.
         * @param {Object} metadata - The metadata object containing track information.
         */
        _updateTrackInfo(metadata) {
            let artistArray = this._recursiveUnpack(metadata['xesam:artist']);
            let title = this._recursiveUnpack(metadata['xesam:title']);

            let artist = this._i18n.t('extension.unknown_artist');
            if (Array.isArray(artistArray) && artistArray.length > 0 && artistArray[0].trim() !== '') {
                artist = artistArray[0];
            } else {
                // Possibly a podcast

                // Podcasts have a trackid of /com/spotify/episode and seem to put the
                // podcast name in the album property
                let trackid = this._recursiveUnpack(metadata['mpris:trackid']);
                if (trackid && trackid.startsWith('/com/spotify/episode')) {
                    let album = this._recursiveUnpack(metadata['xesam:album']);
                    if (album && album.trim() !== '') {
                        artist = album;
                    }
                }
            }

            if (title && title.trim() !== '') {
                // Valid title
            } else {
                title = this._i18n.t('extension.unknown_title');
            }

            this.trackLabel.text = this._settings.get_boolean('swap-artist-track')
                ? `${title} - ${artist}`
                : `${artist} - ${title}`;
            logDebug(`Updated track info: ${artist} - ${title}`);
        }

        /**
         * Recursively unpacks a GLib.Variant if necessary.
         * @param {any} variant - The value to unpack.
         * @returns {any} - The unpacked value.
         */
        _recursiveUnpack(variant) {
            if (variant instanceof GLib.Variant) {
                return variant.deep_unpack(); // Unpack the Variant to get the raw value
            } else {
                return variant; // Return the value as-is if it's not a Variant
            }
        }

        /**
         * Updates the Play/Pause button icon based on the current playback status.
         * @param {string} playbackStatus - The current playback status ('Playing' or other).
         */
        _updatePlayPauseIcon(playbackStatus) {
            let iconName = (playbackStatus === 'Playing')
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
            if (this.playPauseButton) {
                this.playPauseButton.child.icon_name = iconName;
            }
            logDebug(`Updated play/pause icon to ${iconName}`);
        }

        /**
         * Sends an MPRIS command (e.g., 'Previous', 'PlayPause', 'Next') to Spotify.
         * @param {string} command - The MPRIS command to send.
         * @returns {Promise<GLib.Variant>} - Resolves when the command was sent successfully.
         */
        _sendMPRISCommand(command) {
            logDebug(`Sending MPRIS command: ${command}`);
            return this._callDBus(MPRIS_PLAYER_INTERFACE, command);
        }

        /**
         * Changes Spotify's volume by the given amount (1.0 = 100%).
         * @param {number} delta - Positive to raise, negative to lower the volume.
         */
        async _changeVolume(delta) {
            try {
                const current = await this._getPlayerProperty('Volume');
                const volume = Math.min(1.0, Math.max(0.0, current + delta));
                await this._setPlayerProperty('Volume', new GLib.Variant('d', volume));
                logDebug(`Volume set to ${volume}`);
            } catch (e) {
                logError(e, 'Failed to change volume');
            }
        }

        /**
         * Callback function when Spotify vanishes from D-Bus.
         * Hides the indicator and cleans up signal subscriptions.
         */
        _onSpotifyVanished() {
            logDebug('Spotify vanished from D-Bus');
            this.hide();

            if (this._signalSubscriptionId) {
                Gio.DBus.session.signal_unsubscribe(this._signalSubscriptionId);
                this._signalSubscriptionId = null;
            }
        }

        /**
         * Cleans up resources when the SpotifyIndicator is destroyed.
         */
        destroy() {
            logDebug('Destroying SpotifyIndicator');
            this._destroyed = true;

            // Unwatch Spotify's D-Bus name if it was being watched
            if (this._spotifyWatcherId) {
                Gio.DBus.session.unwatch_name(this._spotifyWatcherId);
                this._spotifyWatcherId = null;
            }

            // Unsubscribe from the PropertiesChanged signal if subscribed
            if (this._signalSubscriptionId) {
                Gio.DBus.session.signal_unsubscribe(this._signalSubscriptionId);
                this._signalSubscriptionId = null;
            }

            // Disconnect gesture/controller signals before their actors are
            // destroyed below.
            if (this._gestures) {
                for (const { gesture, signalId } of this._gestures) {
                    try {
                        if (gesture && signalId)
                            gesture.disconnect(signalId);
                    } catch (_) {
                        // Actor may already be gone; safe to ignore.
                    }
                }
                this._gestures = [];
            }

            // Clear all active timeouts
            for (let timeoutID of this._activeTimeouts) {
                clearTimeout(timeoutID);
            }
            this._activeTimeouts = [];

            // Optionally, hide or destroy the Spotify icon and track label
            if (this.spotifyIcon) {
                this.spotifyIcon.destroy();
                this.spotifyIcon = null;
            }

            if (this.trackLabel) {
                this.trackLabel.destroy();
                this.trackLabel = null;
            }

            if(this.trackBox){
                this.trackBox.destroy();
                this.trackBox = null;
            }

            if (this.trackButton) {
                this.trackButton.destroy();
                this.trackButton = null;
            }

            super.destroy();
        }

        /**
         * Try to launch Spotify using the native command first, then fall back
         * to `flatpak run com.spotify.Client` on failure.
         * @param {Function} [callback] - Optional callback invoked once the
         *     subprocess has been awaited (only when a callback is passed).
         */
        _launchSpotifyProcess(callback) {
            let lastError = null;

            const tryLaunch = (args) => {
                try {
                    const subprocess = Gio.Subprocess.new(args, Gio.SubprocessFlags.NONE);
                    if (callback) {
                        subprocess.wait_async(null, (proc, res) => {
                            try {
                                proc.wait_finish(res);
                                logDebug('Spotify launched successfully to show its window.');
                                callback();
                            } catch (e) {
                                logError(e, 'Failed to launch Spotify to show its window.');
                            }
                        });
                    }
                    return true;
                } catch (e) {
                    lastError = e;
                    return false;
                }
            };

            if (tryLaunch(['spotify'])) {
                if (!callback)
                    logDebug('Spotify launched successfully');
                return;
            }
            logDebug('Native spotify not found, trying Flatpak');
            if (tryLaunch(['flatpak', 'run', 'com.spotify.Client'])) {
                if (!callback)
                    logDebug('Spotify launched successfully');
                return;
            }
            logError(lastError, 'Error while attempting to launch Spotify subprocess.');
            if (callback)
                callback();
        }

        _launchSpotify() {
            logDebug('Attempting to launch Spotify');
            this._launchSpotifyProcess();
        }
    }
);

let spotifyIndicator = null;

/**
 * SpotifyControlsExtension Class
 * Manages the lifecycle (enable/disable) of the Spotify Controls extension.
 * Extends the base Extension class to utilize its properties and methods.
 */
export default class SpotifyControlsExtension extends Extension {
    /**
     * Constructor for SpotifyControlsExtension.
     * @param {Object} metadata - The metadata object provided by GNOME Shell.
     */
    constructor(metadata) {
        super(metadata);
        logDebug('Initializing SpotifyControlsExtension');
    }

    /**
     * Called when the extension is enabled.
     * Initializes the SpotifyIndicator and adds it to the panel.
     */
    enable() {
        logDebug('Enabling SpotifyControlsExtension');
        this._settings = this.getSettings();

        // Rebuild the indicator whenever a setting that affects its layout changes
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (REBUILD_SETTINGS.includes(key)) {
                logDebug(`Setting '${key}' changed: updating indicator`);
                this._updateIndicator();
            }
        });

        this._updateIndicator();
    }

    /**
     * Updates the position of the SpotifyIndicator based on user settings.
     */
    _updateIndicator() {
        if (spotifyIndicator) {
            spotifyIndicator.destroy();
            spotifyIndicator = null;
        }

        // Retrieve settings for indicator position and controls position
        let position = this._settings.get_string('position');
        let controlsPosition = this._settings.get_string('controls-position');

        // Validate 'position' setting
        const validPositions = [
            'far-left',
            'mid-left',
            'rightmost-left',
            'middle-left',
            'center',
            'middle-right',
            'leftmost-right',
            'mid-right',
            'far-right',
        ];

        if (!validPositions.includes(position)) {
            position = 'rightmost-left'; // Default to 'rightmost-left' if invalid
        }

        // Validate 'controls-position' setting
        if (controlsPosition !== 'left' && controlsPosition !== 'right') {
            controlsPosition = 'right'; // Default to 'right' if invalid
        }

        // Pass 'extensionPath', 'controlsPosition', and 'settings' to SpotifyIndicator
        spotifyIndicator = new SpotifyIndicator(this.path, controlsPosition, this._settings);

        // Determine which box (left, center, right) to add the indicator to and its offset
        let boxName;
        let offset = null;

        switch (position) {
            case 'far-left':
                boxName = 'left';
                offset = 0;
                break;
            case 'mid-left':
                boxName = 'left';
                offset = Math.floor(Main.panel._leftBox.get_children().length / 2);
                break;
            case 'rightmost-left':
                boxName = 'left';
                offset = Main.panel._leftBox.get_children().length;
                break;
            case 'middle-left':
                boxName = 'center';
                offset = Math.max(0, Math.floor(Main.panel._centerBox.get_children().length / 2) - 1);
                break;
            case 'center':
                boxName = 'center';
                offset = Math.floor(Main.panel._centerBox.get_children().length / 2);
                break;
            case 'middle-right':
                boxName = 'center';
                offset = Math.floor(Main.panel._centerBox.get_children().length / 2) + 1;
                break;
            case 'leftmost-right':
                boxName = 'right';
                offset = 0;
                break;
            case 'mid-right':
                boxName = 'right';
                offset = Math.floor(Main.panel._rightBox.get_children().length / 2);
                break;
            case 'far-right':
                boxName = 'right';
                offset = Main.panel._rightBox.get_children().length;
                break;
            default:
                boxName = 'right';
                offset = null;
        }

        Main.panel.addToStatusArea('spotify-indicator', spotifyIndicator, offset, boxName);
        logDebug(`Indicator added at position: ${position}, box: ${boxName}, offset: ${offset}`);
    }

    /**
     * Called when the extension is disabled.
     * Destroys the SpotifyIndicator and disconnects settings signals.
     */
    disable() {
        logDebug('Disabling SpotifyControlsExtension');
        if (spotifyIndicator) {
            spotifyIndicator.destroy();
            spotifyIndicator = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._settings = null;
    }
}
