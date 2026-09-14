const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Wayland & Hardware Acceleration flags for Hyprland / Linux
app.commandLine.appendSwitch('ozone-platform', 'wayland');
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

function switchMode(newMode) {
    if (newMode === currentMode) return;
    currentMode = newMode;
    saveWindowState({ mode: currentMode });
    app.userAgentFallback = getUserAgentForMode(currentMode);
    mainWindow.webContents.setUserAgent(getUserAgentForMode(currentMode));
    mainWindow.loadURL(getUrlForMode(currentMode));
    console.log(`[OmarchyTube] Växlade läge till: ${currentMode}`);
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
    mainWindow.loadURL(getUrlForMode(currentMode));

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
            mainWindow.loadURL(getUrlForMode(currentMode));
            event.preventDefault();
        }

        // Reload: Ctrl+R or F5
        if (((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') && input.type === 'keyDown') {
            mainWindow.reload();
            event.preventDefault();
        }

        // Back / Forward navigation: Alt+Left / Alt+Right
        if (input.alt && input.key === 'ArrowLeft' && input.type === 'keyDown') {
            if (mainWindow.webContents.canGoBack()) mainWindow.webContents.goBack();
            event.preventDefault();
        }
        if (input.alt && input.key === 'ArrowRight' && input.type === 'keyDown') {
            if (mainWindow.webContents.canGoForward()) mainWindow.webContents.goForward();
            event.preventDefault();
        }

        // In TV mode, Escape goes back in the TV navigation
        if (currentMode === 'tv' && input.key === 'Escape' && input.type === 'keyDown') {
            mainWindow.webContents.executeJavaScript(`
                window.history.back();
            `).catch(() => {});
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
