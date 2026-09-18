const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const innertube = require('./innertube');
const { addProfile, findProfile, partitionFor, readProfiles, removeProfile, writeProfiles } = require('./profiles');
const { planForSession } = require('./sign-in');

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

// User-Agents live in ./user-agent (pure, so npm test can reach the mapping)
const { getUserAgentForMode } = require('./user-agent');

let mainWindow = null;
let pickerWindow = null;
// En profil = en partition = en Google-session. Fönstren hålls kvar per profil
// så att ett byte fram och tillbaka inte laddar om något.
const profileWindows = new Map();
const configuredPartitions = new Set();
// Fönster -> profil, så att rutnätets InnerTube-anrop kan göras i rätt session
// (det är kakan som gör flödet personligt).
const windowProfiles = new Map();
const profilesFile = path.join(app.getPath('userData'), 'profiles.json');
const pickerPage = path.join(__dirname, 'profiles.html');
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

function createWindow(profile) {
    const windowState = loadWindowState();
    const customSession = session.fromPartition(partitionFor(profile.id));

    // onBeforeRequest/onBeforeSendHeaders sätts en gång per partition: att göra
    // det igen på samma session hade gett dubbla lyssnare.
    if (!configuredPartitions.has(profile.id)) {
        configureSession(customSession);
        configuredPartitions.add(profile.id);
    }

    const iconPath = path.join(__dirname, 'assets', 'icon.png');

    const win = new BrowserWindow({
        title: `OmarchyTube — ${profile.name}`,
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

    mainWindow = win;
    profileWindows.set(profile.id, win);
    windowProfiles.set(win.webContents.id, profile.id);
    // Allt som redan pekar på mainWindow (tangenter, injektorn, sparat
    // fönsterläge) följer den ruta användaren är i.
    win.on('focus', () => { mainWindow = win; });

    if (windowState.isFullScreen) {
        win.setFullScreen(true);
    } else if (windowState.isMaximized) {
        win.maximize();
    }

    win.webContents.setUserAgent(getUserAgentForMode(currentMode));

    const injectResources = (contents) => {
        const url = contents.getURL();
        if (url && url.includes('youtube.com')) {
            try {
                const stylesPath = path.join(__dirname, 'styles.css');
                const injectorPath = path.join(__dirname, 'injector.js');
                if (fs.existsSync(stylesPath)) {
                    contents.insertCSS(fs.readFileSync(stylesPath, 'utf8'));
                }
                if (fs.existsSync(injectorPath)) {
                    contents.executeJavaScript(fs.readFileSync(injectorPath, 'utf8')).catch((err) => {
                        console.error('[OmarchyTube] JS inject error:', err);
                    });
                }
            } catch (err) {
                console.error('[OmarchyTube] Injection error from main process:', err);
            }
        }
    };

    win.webContents.on('dom-ready', () => {
        if (!win.webContents.getURL().startsWith('file://')) onBrowsePage = false;
        injectResources(win.webContents);
    });

    // Inloggad? Då är det här hela YouTube: flödet kontot kurerat genom åren,
    // prenumerationerna, historiken, listorna. Utloggad? Då tar vi TV-lägets
    // QR-väg — skrivbordssidans e-postformulär svarar Google "This browser or
    // app may not be secure" i en inbäddad webbläsare (mätt 2026-09-18).
    // Partitionskakan avgör vilket svar som gäller den här profilen.
    customSession.cookies.get({ domain: '.youtube.com' })
        .then((cookies) => {
            const plan = planForSession(cookies, currentMode);
            applyMode(plan.mode);
            if (plan.autoSignIn) {
                openSignIn(win);
            } else {
                win.loadURL(plan.url);
            }
        })
        .catch((err) => {
            console.warn('[OmarchyTube] Kunde inte läsa profilens kakor:', err);
            win.loadURL('https://www.youtube.com/tv');
        });

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

        // Byt tittare: F3
        if (input.key === 'F3' && input.type === 'keyDown') {
            createPickerWindow();
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

    // Handle mouse 4 (Back) button
    win.on('app-command', (e, cmd) => {
        if (cmd === 'browser-backward') {
            handleExitVideo();
        }
    });

    win.on('close', () => {
        saveWindowState();
    });

    win.on('closed', () => {
        profileWindows.delete(profile.id);
        windowProfiles.delete(win.webContents.id);
        if (mainWindow === win) mainWindow = null;
    });
}

// TV-appens inloggning ligger ett Enter bort från dess hemskärm (första valet
// är "Get started"). Vi trycker det åt användaren och slutar så snart koden
// syns, så att det första en ny profil visar är QR-koden och de åtta tecknen —
// inte en meny att leta i. Mätt: ett Enter ger "Sign in with your phone — Scan
// QR code or go to yt.be/activate — Enter the code GDM-STY-SDG".
const SIGN_IN_SEEN = /scan qr|yt\.be\/activate|enter the code/i;

function openSignIn(win) {
    let attempts = 0;

    const press = () => {
        if (win.isDestroyed()) return;
        // Leanback-appen lyssnar på keydown, och Chromium svarar på båda namnen
        // men inte alltid på samma — varannan gång får vardera.
        const keyCode = attempts % 2 === 0 ? 'Return' : 'Enter';
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    };

    const check = async () => {
        if (win.isDestroyed()) return;
        try {
            const atSignIn = await win.webContents.executeJavaScript(
                `/${SIGN_IN_SEEN.source}/i.test(document.body.innerText)`);
            if (atSignIn) return;
        } catch (err) {
            // Sidan byts ut medan vi frågar; nästa varv får svaret.
        }
        attempts += 1;
        if (attempts > 4) {
            console.warn('[OmarchyTube] TV-appens QR-skärm kom inte upp av sig själv — Enter i fönstret tar dig dit.');
            return;
        }
        press();
        setTimeout(check, 2500);
    };

    win.webContents.once('did-finish-load', () => setTimeout(check, 3500));
    win.loadURL('https://www.youtube.com/tv');
}

// Väljaren: en liten ruta med en uppgift. Egen partition, så den inte delar
// kaka med något konto.
function createPickerWindow() {
    if (pickerWindow && !pickerWindow.isDestroyed()) {
        pickerWindow.show();
        pickerWindow.focus();
        return pickerWindow;
    }

    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    pickerWindow = new BrowserWindow({
        width: 1000,
        height: 660,
        minWidth: 720,
        minHeight: 520,
        title: 'Vem skall titta? — OmarchyTube',
        backgroundColor: '#0b0b0d',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        autoHideMenuBar: true,
        webPreferences: {
            session: session.fromPartition('persist:omarchy-picker'),
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    pickerWindow.loadFile(pickerPage);
    pickerWindow.on('closed', () => { pickerWindow = null; });

    // Esc stänger väljaren bara när det redan finns en profilruta att gå
    // tillbaka till — annars vore appen tom.
    pickerWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown' && mainWindow) {
            pickerWindow.close();
            event.preventDefault();
        }
    });

    return pickerWindow;
}

function openProfile(id) {
    const profile = findProfile(readProfiles(profilesFile), id);
    if (!profile) return null;

    const existing = profileWindows.get(profile.id);
    if (existing && !existing.isDestroyed()) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        return existing;
    }
    return createWindow(profile);
}

// Allt som bara får registreras en gång. Låg tidigare inuti createWindow, vilket
// gick bra så länge appen hade ett enda fönster — med ett fönster per profil
// hade ipcMain.handle kastat på den andra registreringen.
function registerIpc() {
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
    const partitionOf = (sender) => {
        const id = windowProfiles.get(sender.id);
        return id ? partitionFor(id) : undefined;
    };
    ipcMain.handle('omarchy-browse-home', (event) => innertube.home(partitionOf(event.sender)));
    ipcMain.handle('omarchy-browse-search', (event, query) => innertube.search(String(query || ''), partitionOf(event.sender)));
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

    // Profilerna: listan bor i userData, valet öppnar ett fönster i den
    // profilens session.
    ipcMain.handle('omarchy-profiles:list', () => readProfiles(profilesFile));

    ipcMain.handle('omarchy-profiles:add', (_event, name) => {
        const result = addProfile(readProfiles(profilesFile), name);
        if (!result) return readProfiles(profilesFile);
        writeProfiles(profilesFile, result.list);
        console.log(`[OmarchyTube] Profil tillagd: ${result.profile.name} (${result.profile.id})`);
        return result.list;
    });

    ipcMain.handle('omarchy-profiles:remove', (_event, id) => {
        const list = removeProfile(readProfiles(profilesFile), String(id));
        writeProfiles(profilesFile, list);
        const open = profileWindows.get(String(id));
        if (open && !open.isDestroyed()) open.close();
        return list;
    });

    ipcMain.handle('omarchy-profiles:pick', (_event, id) => {
        openProfile(String(id));
        return true;
    });
}

app.whenReady().then(() => {
    registerIpc();

    // Första skärmen är frågan, inte en tom ruta: vem skall titta? Svaret avgör
    // vilken Google-session resten av appen pratar med.
    createPickerWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createPickerWindow();
        }
    });
});

app.on('window-all-closed', () => {
    saveWindowState();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
