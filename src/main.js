const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const innertube = require('./innertube');

// Hardware acceleration flags for Hyprland / Linux.
//
// There is deliberately no `appendSwitch('ozone-platform', 'wayland')` here:
// Chromium picks its ozone platform while the browser process starts, which is
// before this script runs, so the switch was never in time — measured in a
// Wayland-only session (cage, no X server): the app still came up as
// ozone_platform_x11 and exited with "Missing X server or $DISPLAY". The
// platform is set on the command line instead: `npm start` passes
// --ozone-platform=wayland, and the flatpak entry point passes it when
// WAYLAND_DISPLAY is set.
// Playing starts on a page transition (the user pressed Enter in our grid, then
// the window loads youtube.com), and Chromium only counts gestures made on the
// page itself — measured: the watch page came up with a paused <video> at t=0
// and no error. A leanback player that answers a keypress with silence is
// broken, so the policy is lifted.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-vulkan');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecodeLinuxGL,VaapiVideoDecoder');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Set application identifiers
app.name = 'OmarchyTube';
app.setName('OmarchyTube');
if (process.platform === 'linux') {
    app.setDesktopName('OmarchyTube.desktop');
}

// User-Agents
const TV_USER_AGENT = 'Mozilla/5.0 (Web0S; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36 WebAppManager';
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

let mainWindow = null;
const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
    try {
        if (fs.existsSync(stateFile)) {
            return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        }
    } catch (err) {
        console.warn('Could not read window state:', err);
    }
    return { width: 1280, height: 800, isMaximized: true, isFullScreen: false, mode: 'tv' };
}

function saveWindowState(extra = {}) {
    if (!mainWindow) return;
    try {
        const bounds = mainWindow.getBounds();
        const current = loadWindowState();
        const state = {
            ...current,
            width: bounds.width,
            height: bounds.height,
            isMaximized: mainWindow.isMaximized(),
            isFullScreen: mainWindow.isFullScreen(),
            ...extra
        };
        fs.writeFileSync(stateFile, JSON.stringify(state));
    } catch (err) {
        console.warn('Could not save window state:', err);
    }
}

// Detect mode from CLI args or saved preference (defaults to 'tv')
const args = process.argv.slice(2);
let currentMode = args.includes('--desktop') ? 'desktop' : (args.includes('--tv') ? 'tv' : (loadWindowState().mode || 'tv'));

function getUserAgentForMode(mode) {
    return mode === 'tv' ? TV_USER_AGENT : DESKTOP_USER_AGENT;
}

function getUrlForMode(mode) {
    return mode === 'tv' ? 'https://www.youtube.com/tv' : 'https://www.youtube.com';
}

// Our own grid is the app's home. YouTube's TV view is one key away (F1) and is
// where playback happens, so everything the injector does — ad skipping,
// SponsorBlock, dislike counts, the back button — still applies.
const BROWSE_PAGE = path.join(__dirname, 'browse.html');
let onBrowsePage = false;
// Set when a video is started from the grid, so leaving that video comes back
// here instead of to YouTube's own home — and cleared whenever the user walks
// off to YouTube themselves (F1, F2, or any navigation to youtube.com).
let returnToGrid = false;

function loadBrowse() {
    if (!mainWindow) return;
    onBrowsePage = true;
    mainWindow.loadFile(BROWSE_PAGE);
}


app.userAgentFallback = getUserAgentForMode(currentMode);

function configureSession(targetSession) {
    targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = getUserAgentForMode(currentMode);
        if (currentMode === 'desktop') {
            details.requestHeaders['Sec-CH-UA'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
            details.requestHeaders['Sec-CH-UA-Mobile'] = '?0';
            details.requestHeaders['Sec-CH-UA-Platform'] = '"Linux"';
        } else {
            delete details.requestHeaders['Sec-CH-UA'];
            delete details.requestHeaders['Sec-CH-UA-Mobile'];
            delete details.requestHeaders['Sec-CH-UA-Platform'];
        }
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    // YouTube ad network blocking (never blocking Google Auth)
    targetSession.webRequest.onBeforeRequest(
        {
            urls: [
                '*://*.doubleclick.net/*',
                '*://*.googleadservices.com/*',
                '*://*.googlesyndication.com/*',
                '*://*.youtube.com/api/stats/ads*',
                '*://*.youtube.com/pagead/*',
                '*://*.youtube.com/ptracking*',
                '*://*.youtube.com/get_midroll_info*'
            ]
        },
        (details, callback) => {
            if (details.url.includes('accounts.google.com') ||
                details.initiator?.includes('accounts.google.com') ||
                details.url.includes('youtube.com/activate')) {
                return callback({ cancel: false });
            }
            callback({ cancel: true });
        }
    );
}

function applyMode(newMode) {
    currentMode = newMode;
    saveWindowState({ mode: currentMode });
    app.userAgentFallback = getUserAgentForMode(currentMode);
    if (mainWindow) mainWindow.webContents.setUserAgent(getUserAgentForMode(currentMode));
}

function switchMode(newMode) {
    if (newMode === currentMode) {
        // Same mode: F2 then means "back to the grid", so the key never strands
        // the user on a page with no way home.
        if (!onBrowsePage) loadBrowse();
        return;
    }
    applyMode(newMode);
    onBrowsePage = false;
    loadBrowse();
    console.log(`[OmarchyTube] Switched mode to: ${currentMode}`);
}

function createWindow() {
    const windowState = loadWindowState();
    const customSession = session.fromPartition('persist:omarchy-tube');

    configureSession(customSession);

    const iconPath = path.join(__dirname, 'assets', 'icon.png');

    mainWindow = new BrowserWindow({
        title: 'OmarchyTube',
        width: windowState.width || 1280,
        height: windowState.height || 800,
        minWidth: 640,
        minHeight: 480,
        backgroundColor: '#000000',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        autoHideMenuBar: true,
        webPreferences: {
            session: customSession,
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            plugins: true,
            webSecurity: true
        }
    });

    if (windowState.isFullScreen) {
        mainWindow.setFullScreen(true);
    } else if (windowState.isMaximized) {
        mainWindow.maximize();
    }

    mainWindow.webContents.setUserAgent(getUserAgentForMode(currentMode));

    const injectResources = () => {
        const url = mainWindow.webContents.getURL();
        if (url && url.includes('youtube.com')) {
            try {
                const stylesPath = path.join(__dirname, 'styles.css');
                const injectorPath = path.join(__dirname, 'injector.js');
                if (fs.existsSync(stylesPath)) {
                    mainWindow.webContents.insertCSS(fs.readFileSync(stylesPath, 'utf8'));
                }
                if (fs.existsSync(injectorPath)) {
                    mainWindow.webContents.executeJavaScript(fs.readFileSync(injectorPath, 'utf8')).catch((err) => {
                        console.error('[OmarchyTube] JS inject error:', err);
                    });
                }
            } catch (err) {
                console.error('[OmarchyTube] Injection error from main process:', err);
            }
        }
    };

    mainWindow.webContents.on('dom-ready', () => {
        if (!mainWindow.webContents.getURL().startsWith('file://')) onBrowsePage = false;
        injectResources();
    });

    loadBrowse();

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        const isYT = url.includes('youtube.com') || url.includes('youtu.be');
        const isGoogleAuth = url.includes('accounts.google.com') || url.includes('google.com');

        if (isGoogleAuth) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    autoHideMenuBar: true,
                    webPreferences: { session: customSession }
                }
            };
        }

        if (!isYT) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Global in-window keyboard shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // Our grid / YouTube's own view: F1
        if (input.key === 'F1' && input.type === 'keyDown') {
            if (onBrowsePage) {
                onBrowsePage = false;
                returnToGrid = false;
                mainWindow.loadURL(getUrlForMode(currentMode));
            } else {
                loadBrowse();
            }
            event.preventDefault();
        }

        // Fullscreen toggle: F11
        if (input.key === 'F11' && input.type === 'keyDown') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
        }

        // Toggle between TV mode and Desktop mode: F2
        if (input.key === 'F2' && input.type === 'keyDown') {
            switchMode(currentMode === 'tv' ? 'desktop' : 'tv');
            event.preventDefault();
        }

        // Picture-in-Picture: F10 or Ctrl+P (Desktop mode)
        if ((input.key === 'F10' || (input.control && input.key.toLowerCase() === 'p')) && input.type === 'keyDown') {
            mainWindow.webContents.executeJavaScript(`
                const video = document.querySelector('video');
                if (video) {
                    if (document.pictureInPictureElement) {
                        document.exitPictureInPicture();
                    } else if (video.requestPictureInPicture) {
                        video.requestPictureInPicture();
                    }
                }
            `);
            event.preventDefault();
        }

        // Home: Alt+Home
        if (input.alt && input.key === 'Home' && input.type === 'keyDown') {
            loadBrowse();
            event.preventDefault();
        }

        // Reload: Ctrl+R or F5
        if (((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') && input.type === 'keyDown') {
            mainWindow.reload();
            event.preventDefault();
        }

        // Exit video / Back navigation: Escape, Backspace, or Alt+Left.
        // On the grid those keys belong to the renderer (Escape there means
        // "back to the home feed"); without this guard Escape inside the grid
        // threw the user out to YouTube's own view instead.
        if (onBrowsePage) return;

        if (((input.key === 'Escape' || input.key === 'Backspace') && input.type === 'keyDown') ||
            (input.alt && input.key === 'ArrowLeft' && input.type === 'keyDown')) {
            mainWindow.webContents.executeJavaScript(`
                Boolean(document.activeElement && (
                    document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.tagName === 'TEXTAREA' ||
                    document.activeElement.isContentEditable
                ));
            `).then(isInput => {
                if (!isInput || input.key === 'Escape') {
                    handleExitVideo();
                }
            }).catch(() => {
                handleExitVideo();
            });
            event.preventDefault();
        }

        if (input.alt && input.key === 'ArrowRight' && input.type === 'keyDown') {
            if (mainWindow.webContents.canGoForward()) mainWindow.webContents.goForward();
            event.preventDefault();
        }
    });

    function handleExitVideo() {
        if (!mainWindow) return;

        console.log('[OmarchyTube] Main process handling exit video...');
        mainWindow.webContents.executeJavaScript(`
            try {
                const p = document.querySelector('.html5-video-player');
                if (p && typeof p.stopVideo === 'function') p.stopVideo();
                const v = document.querySelector('video');
                if (v) { v.pause(); v.currentTime = 0; }
            } catch (e) {}
        `).catch(() => {});

        if (mainWindow.webContents.canGoBack()) {
            mainWindow.webContents.goBack();
        } else if (returnToGrid) {
            loadBrowse();
        } else {
            mainWindow.loadURL(getUrlForMode(currentMode));
        }
        returnToGrid = false;

        // Fallback: If still on watch page after 350ms, navigate to root URL
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.executeJavaScript(`
                    (() => {
                        const onWatch = !!document.querySelector('ytlr-watch-page, ytd-watch-flexy');
                        const v = document.querySelector('video');
                        const playing = !!v && !v.paused;
                        return onWatch || playing;
                    })()
                `).then(isWatching => {
                    if (isWatching) {
                        loadBrowse();
                    }
                }).catch(() => {});
            }
        }, 350);
    }

    ipcMain.on('omarchy-exit-video', () => {
        handleExitVideo();
    });

    // The grid's two ways to YouTube's data, and its one way to play.
    ipcMain.handle('omarchy-browse-home', () => innertube.home());
    ipcMain.handle('omarchy-browse-search', (_event, query) => innertube.search(String(query || '')));
    // Playback happens on YouTube's desktop watch page. Measured: it loads the
    // right video signed out (duration 1793 s for the video the fixture holds),
    // while the TV app's own watch route never opened — it bounced back to its
    // home, signed out at least. The app's injector also targets that page
    // (ytd-*: ad skipping, SponsorBlock, dislike counts, the back button).
    ipcMain.on('omarchy-play', (_event, videoId) => {
        if (!mainWindow || !/^[\w-]{11}$/.test(String(videoId))) return;
        onBrowsePage = false;
        returnToGrid = true;
        applyMode('desktop');
        mainWindow.loadURL(`https://www.youtube.com/watch?v=${videoId}`);
    });

    // Handle mouse 4 (Back) button
    mainWindow.on('app-command', (e, cmd) => {
        if (cmd === 'browser-backward') {
            handleExitVideo();
        }
    });

    mainWindow.on('close', () => {
        saveWindowState();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    saveWindowState();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
