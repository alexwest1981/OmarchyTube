const { app, BrowserWindow, session, shell, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const innertube = require('./innertube');
const { addProfile, findProfile, partitionFor, readProfiles, removeProfile, writeProfiles } = require('./profiles');
const { planForSession } = require('./sign-in');
const { browserCommand } = require('./browser-launch');

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
// Om Chromiums Vulkan-flaggor, mätt 2026-09-18: 'disable-vulkan' är ingen riktig
// flagga (varningen i terminalen stod kvar), och att stänga av featuren Vulkan
// gjorde saken värre — app.getGPUFeatureStatus() svarade då
// rasterization=disabled_software, video_decode=disabled_software, alltså allt i
// programvara. Varningen "not compatible with Vulkan" är kosmetisk; den får stå.
// Ingen Vulkan-flagga här.
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
// Startfönstret (väljaren) behöver ingen session alls — men ett fönster måste ha
// en, och den här rör inget konto.
const PICKER_PARTITION = 'persist:omarchy-picker';

// Profilen öppnas i webbläsaren, inte i appens eget fönster.
//
// Mätt 2026-09-18, efter en hel kväll av fel: Google vägrar lösenordsinloggning i
// en inbäddad webbläsare ("Couldn't sign you in — This browser or app may not be
// secure"), YouTubes TV-app räknar sin textskala ur fönsterbredden och blir
// oläslig i en tilad ruta (941 px gav rotfont 5,88 px mot 24 px vid 1920), och
// Electronns zoom/kompositor beter sig inte som en vanlig webbläsares. I Brave
// är allt det där någon annans problem: inloggningen fungerar, videon avkodas i
// hårdvara och rutan är en ruta. Varje profil får sin egen --user-data-dir, alltså
// sin egen Google-session och sina egna flöden.
//
// --in-app kör den gamla vägen (YouTubes sidor i appens eget fönster) för den som
// vill jämföra; allt annat är kvar och oförändrat.
const BROWSER = process.env.OMARCHYTUBE_BROWSER || 'brave';
const RUN_IN_APP = process.argv.includes('--in-app');

function openProfileInBrowser(profile) {
    const command = browserCommand(app.getPath('userData'), profile, currentMode, BROWSER);
    fs.mkdirSync(command.dir, { recursive: true });

    try {
        const child = spawn(command.command, command.args, { detached: true, stdio: 'ignore' });
        child.unref();
        console.log(`[OmarchyTube] ${profile.name} öppnas i ${command.command} (${currentMode}-läge, ${command.dir})`);
    } catch (err) {
        console.error(`[OmarchyTube] Kunde inte starta ${command.command}:`, err.message);
    }
    return null;
}
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

    // YouTubes TV-app räknar sin textskala ur fönstrets bredd (mätt: 941 px gav
    // rotfont 5,88 px mot 24 px vid 1920). En TV-yta hör till en bred ruta, så
    // TV-läget tar hela skärmen i stället för att appen försöker krympa YouTube.
    if (newMode === 'tv' && mainWindow && !mainWindow.isDestroyed()
        && !mainWindow.isMaximized() && mainWindow.getBounds().width < 1600) {
        mainWindow.maximize();
        console.log('[OmarchyTube] TV-läget vill ha bredden — fönstret maximerat.');
    }
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

// profile === null betyder startfönstret: samma ruta, men väljaren i den.
function createWindow(profile) {
    const windowState = loadWindowState();
    const customSession = session.fromPartition(profile ? partitionFor(profile.id) : PICKER_PARTITION);

    // onBeforeRequest/onBeforeSendHeaders sätts en gång per partition: att göra
    // det igen på samma session hade gett dubbla lyssnare.
    if (profile && !configuredPartitions.has(profile.id)) {
        configureSession(customSession);
        configuredPartitions.add(profile.id);
    }

    const iconPath = path.join(__dirname, 'assets', 'icon.png');

    const win = new BrowserWindow({
        title: profile ? `OmarchyTube — ${profile.name}` : 'Vem skall titta? — OmarchyTube',
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
    // webContents.id fångas här: efter 'closed' är webContents förstörd, och att
    // läsa .id då kastar "Object has been destroyed" — det var felet som mötte
    // Alex när han stängde en ruta.
    const contentsId = win.webContents.id;
    if (profile) {
        profileWindows.set(profile.id, win);
        windowProfiles.set(contentsId, profile.id);
    }
    // Allt som redan pekar på mainWindow (tangenter, injektorn, sparat
    // fönsterläge) följer den ruta användaren är i.
    win.on('focus', () => { mainWindow = win; });

    if (windowState.isFullScreen) {
        win.setFullScreen(true);
    } else if (windowState.isMaximized) {
        win.maximize();
    }

    win.webContents.setUserAgent(getUserAgentForMode(currentMode));
    // Skalan hör till fönstrets bredd, inte bara till laddningen.
    win.on('resize', () => fitView(win));

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
        const url = win.webContents.getURL();
        if (!url.startsWith('file://')) onBrowsePage = false;
        injectResources(win.webContents);
        if (url.includes('youtube.com')) fitView(win);
    });

    if (profile) {
        startWithProfile(win, profile, customSession);
    } else {
        showPicker(win);
    }

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

        // Byt tittare: F3 visar väljaren i den här rutan.
        if (input.key === 'F3' && input.type === 'keyDown') {
            showPicker(mainWindow);
            event.preventDefault();
        }

        // Logga in i webbläsaren: F4 öppnar yt.be/activate, där koden från
        // TV-skärmen skrivs in. Kontot hamnar i den här profilens session ändå,
        // eftersom det är appen som bad om koden.
        if (input.key === 'F4' && input.type === 'keyDown') {
            shell.openExternal('https://yt.be/activate');
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
            if (mainWindow.webContents.navigationHistory.canGoForward()) mainWindow.webContents.navigationHistory.goForward();
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
        if (profile) profileWindows.delete(profile.id);
        windowProfiles.delete(contentsId);
        if (mainWindow === win) mainWindow = null;
    });
}

// Sidan lämnas i fred: ingen zoom, ingen skalning. Mätt 2026-09-18: ett försök
// att skala YouTubes TV-app till fönstret med setZoomFactor(0.49) gav
// devicePixelRatio 0,49 — layouten blev 1920 CSS-px men ytan målades i fönstrets
// storlek, alltså innehållet i en fjärdedel uppe till vänster. Det var den
// fjärdedelen Alex såg, och den var min. Att bråka med YouTubes egen skalning är
// inte värt det; raden nedan finns bara för att kunna läsa vad sidan fick.

function fitView(win) {
    if (!win || win.isDestroyed()) return;
    const tvPage = win.webContents.getURL().includes('youtube.com/tv');

    setTimeout(() => {
        if (win.isDestroyed()) return;
        win.webContents.executeJavaScript(`(() => ({
            view: [innerWidth, innerHeight], dpr: devicePixelRatio,
            visual: window.visualViewport ? Number(window.visualViewport.scale.toFixed(3)) : null,
            rootFont: getComputedStyle(document.documentElement).fontSize
        }))()`).then((seen) => {
            const bounds = win.getBounds();
            const zoomed = Math.abs(win.webContents.getZoomFactor() - 1) > 0.01;
            console.log(`[OmarchyTube] rutan ${bounds.width}x${bounds.height} | sidan ${seen.view[0]}x${seen.view[1]}`
                + ` | zoom ${win.webContents.getZoomFactor().toFixed(2)} | dpr ${seen.dpr}`
                + ` | visualViewport ${seen.visual} | rotfont ${seen.rootFont}`
                + (tvPage ? ' | TV-läge' : '')
                // Två tillstånd som gav en fjärdedelsruta: zoom utanför 1 och ett
                // devicePixelRatio som inte är 1. De skall skrika, inte tigas.
                + (zoomed ? '  <-- zoom är inte 1' : '')
                + (Math.abs(seen.dpr - 1) > 0.01 ? '  <-- dpr är inte 1, sidan skalas fel' : ''));
        }).catch(() => {});
    }, 900);
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

// Allt sker i ett fönster. Alex 19:25: två rutor sida vid sida gav dessutom
// YouTubes TV-layout i ett smalt fönster, där texten krympte till otydlig.
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

    if (mainWindow.webContents.navigationHistory.canGoBack()) {
        mainWindow.webContents.navigationHistory.goBack();
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

function showPicker(win) {
    if (!win || win.isDestroyed()) return win;
    onBrowsePage = false;
    returnToGrid = false;
    win.setTitle('Vem skall titta? — OmarchyTube');
    win.loadFile(pickerPage);
    return win;
}

// Inloggad? Då är det här hela YouTube: flödet kontot kurerat genom åren,
// prenumerationerna, historiken, listorna. Utloggad? Då tar vi TV-lägets QR-väg
// — skrivbordssidans e-postformulär svarar Google "This browser or app may not
// be secure" i en inbäddad webbläsare (mätt 2026-09-18). Partitionskakan avgör
// vilket svar som gäller den här profilen. Exporterad för openProfile.
function startWithProfile(win, profile, profileSession) {
    const target = profileSession || session.fromPartition(partitionFor(profile.id));
    target.cookies.get({ domain: '.youtube.com' })
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
}

function openProfile(id) {
    const profile = findProfile(readProfiles(profilesFile), id);
    if (!profile) return null;

    if (!RUN_IN_APP) return openProfileInBrowser(profile);

    const current = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const currentId = current ? windowProfiles.get(current.webContents.id) : null;

    // Samma profil: rutan har redan rätt session, så vi går bara tillbaka till
    // YouTube i den.
    if (current && currentId === profile.id) {
        startWithProfile(current, profile);
        return current;
    }

    // Annan profil: partitionen sitter på fönstret och går inte att byta, så det
    // blir ett nytt fönster i samma storlek och det gamla stängs — ett fönster
    // kvar, samma ruta på skärmen.
    const next = createWindow(profile);
    if (current && !current.isDestroyed()) current.close();
    return next;
}

// Allt som bara får registreras en gång. Låg tidigare inuti createWindow, vilket
// gick bra så länge appen hade ett enda fönster — med ett fönster per profil
// hade ipcMain.handle kastat på den andra registreringen.
function registerIpc() {
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

    // Vilken profil rutan visar, om någon — väljaren använder det för Esc
    // (tillbaka till YouTube i samma fönster).
    ipcMain.handle('omarchy-profiles:current', (event) => windowProfiles.get(event.sender.id) || null);
}

app.whenReady().then(() => {
    registerIpc();

    // Vulkan-varningen i Alex terminal kommer från Chromium och svarar inte på om
    // Vulkan faktiskt är på. getGPUFeatureStatus() gör det, och compositing-raden
    // är den som avgör om en delvis målad ruta är ett GPU-fel eller en layout.
    const gpu = app.getGPUFeatureStatus();
    console.log('[OmarchyTube] GPU: ' + ['vulkan', 'gpu_compositing', 'rasterization', 'video_decode']
        .map((key) => `${key}=${gpu[key] || 'saknas'}`).join(', '));

    // Första skärmen är frågan, inte en tom ruta: vem skall titta? Svaret avgör
    // vilken Google-session resten av appen pratar med.
    createWindow(null);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(null);
        }
    });
});

app.on('window-all-closed', () => {
    saveWindowState();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
