// OmarchyTube — vem skall titta, och sedan YouTube i den här rutan.
//
// Efter rivningen 2026-09-18 är regeln: appen äger fönstret, frågan och
// sessionerna. Den rör inte YouTubes sidor. Ingen injicerad CSS, ingen injicerad
// JS, ingen zoom, ingen egen skalning — varje gång vi la oss i deras layout blev
// det sämre:
//
//   * våra geometriregler (tvinga #container till 100vw/100vh) träffade
//     skrivbordssidan, som har SJU element med det id:t, och la hela sidan i ett
//     band högst upp med resten bortklippt;
//   * setZoomFactor(0.49) blev dpr 0,49 på Wayland: layouten sa 1920 CSS-px
//     medan ytan målades i fönstrets storlek — innehåll i en fjärdedels ruta;
//   * en funktion som deklareras inuti en annan (handleExitVideo i registerIpc)
//     gjorde Esc stendöd utan ett ljud.
//
// Fönstret är fullskärm (en riktig begäran till kompositorn — maximize() förlorar
// mot Hyprlands tilning: mätt blev rutan 941 px bred, och YouTubes 10-fotslayout
// visar då två gigantiska brickor i stället för en läsbar rad).
//
// Det vi gör är fönstret, sessionen, webbläsaridentiteten och läget. Inloggningen
// går via Googles TV-flöde (QR-koden) eftersom Google vägrar lösenordsformuläret
// i en inbäddad webbläsare — mätt: "Couldn't sign you in — This browser or app
// may not be secure".
const { app, BrowserWindow, screen, session, shell, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const { addProfile, findProfile, partitionFor, readProfiles, removeProfile, writeProfiles } = require('./profiles');
const { getUserAgentForMode } = require('./user-agent');
const { planForSession } = require('./sign-in');

// Spelaren startar när sidan byts (användaren tryckte Enter i TV-appen och
// fönstret laddar en tittarsida). Chromium räknar bara gester på sidan själv —
// mätt: tittarsidan kom upp med en pausad <video> på t=0 och utan fel. En
// leanback-spelare som svarar på en tangent med tystnad är trasig, så policyn är
// lyft. Detta är den ENDA sida vi rör, och den rör bara uppspelning.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.name = 'OmarchyTube';
app.setName('OmarchyTube');
if (process.platform === 'linux') {
    app.setDesktopName('OmarchyTube.desktop');
}

const argv = process.argv.slice(2);
const profilesFile = path.join(app.getPath('userData'), 'profiles.json');
const stateFile = path.join(app.getPath('userData'), 'picker-state.json');
const pickerPage = path.join(__dirname, 'profiles.html');
// Startfönstret (väljaren) behöver ingen session alls — men ett fönster måste ha
// en, och den här rör inget konto.
const PICKER_PARTITION = 'persist:omarchy-picker';

let mainWindow = null;
const configuredPartitions = new Set();
// Fönster -> profil: appen måste veta vilken session rutan visar, annars vet
// inte Esc i väljaren vart den skall tillbaka.
const windowProfiles = new Map();

function readState() {
    try {
        return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (err) {
        return {};
    }
}

function writeState(patch) {
    try {
        fs.writeFileSync(stateFile, JSON.stringify({ ...readState(), ...patch }, null, 2));
    } catch (err) {
        console.warn('[OmarchyTube] Kunde inte spara läget:', err.message);
    }
}

// Skrivbordsläge är standard: YouTubes TV-app räknar sin textskala ur
// fönsterbredden i kvadrat (mätt: 941 px gav rotfont 5,88 px mot 24 px vid 1920),
// så TV-läget vill ha en bred skärm och skall vara ett val, inte en överraskning.
let currentMode = argv.includes('--tv') ? 'tv'
    : argv.includes('--desktop') ? 'desktop'
        : (readState().mode || 'desktop');

const getUrlForMode = (mode) => (mode === 'tv' ? 'https://www.youtube.com/tv' : 'https://www.youtube.com');

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
    writeState({ mode: currentMode });
    app.userAgentFallback = getUserAgentForMode(currentMode);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.setUserAgent(getUserAgentForMode(currentMode));
    }
}

// Mätraden. Alex ögon är instrumentet, men den här raden ger siffrorna bakom dem
// — och den läser bara Electronns egen yta, aldrig sidans DOM.
function logViewport(win) {
    try {
        const bounds = win.getContentBounds();
        const display = screen.getDisplayMatching(bounds);
        const zoom = win.webContents.getZoomFactor();
        console.log(`[OmarchyTube] rutan ${bounds.width}x${bounds.height} | zoom ${zoom.toFixed(2)} | skärmens skala ${display.scaleFactor} | fullskärm ${win.isFullScreen()} | ${currentMode}`);
    } catch (err) {
        console.warn('[OmarchyTube] Kunde inte läsa rutan:', err.message);
    }
}

function goBack() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const history = mainWindow.webContents.navigationHistory;
    if (history.canGoBack()) history.goBack();
    else mainWindow.loadURL(getUrlForMode(currentMode));
}

// Profilfönstret. profile === null betyder startfönstret, som visar väljaren.
function createWindow(profile) {
    const customSession = session.fromPartition(profile ? partitionFor(profile.id) : PICKER_PARTITION);

    // Reglerna sätts en gång per partition: att göra det igen på samma session
    // hade gett dubbla lyssnare.
    const key = profile ? profile.id : 'picker';
    if (!configuredPartitions.has(key)) {
        configureSession(customSession);
        configuredPartitions.add(key);
    }

    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const state = readState();
    const win = new BrowserWindow({
        title: profile ? `OmarchyTube — ${profile.name}` : 'Vem skall titta? — OmarchyTube',
        // Profilen är en dedikerad fullskärmsapp. fullscreen: true är en riktig
        // begäran till kompositorn; maximize() förlorar mot Hyprlands tilning —
        // mätt: rutan blev 941 px bred, och YouTubes 10-fotslayout visar då två
        // gigantiska brickor i stället för en läsbar rad.
        fullscreen: Boolean(profile),
        width: state.width || 1280,
        height: state.height || 800,
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
    const contentsId = win.webContents.id;
    if (profile) windowProfiles.set(contentsId, profile.id);
    win.on('focus', () => { mainWindow = win; });
    win.on('close', () => {
        try {
            const bounds = win.getBounds();
            writeState({ width: bounds.width, height: bounds.height, mode: currentMode });
        } catch (err) {
            // Stängningen får inte falla på att läget inte kunde sparas.
        }
    });
    win.on('closed', () => {
        windowProfiles.delete(contentsId);
        if (mainWindow === win) mainWindow = null;
    });

    win.webContents.setUserAgent(getUserAgentForMode(currentMode));

    win.webContents.setWindowOpenHandler(({ url }) => {
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        const isGoogleAuth = url.includes('accounts.google.com') || url.includes('google.com');
        if (isGoogleAuth) {
            return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { session: customSession } } };
        }
        if (!isYouTube) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Tangenterna rör fönstret och läget — aldrig sidans innehåll.
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;

        // Byt tittare: visar väljaren i den här rutan.
        if (input.key === 'F3') {
            showPicker(win);
            event.preventDefault();
            return;
        }
        if (input.key === 'F2') {
            switchMode(currentMode === 'tv' ? 'desktop' : 'tv');
            event.preventDefault();
            return;
        }
        // Koden från TV-skärmen skrivs in i en webbläsare — F4 öppnar rätt sida.
        if (input.key === 'F4') {
            shell.openExternal('https://yt.be/activate');
            event.preventDefault();
            return;
        }
        if (input.key === 'F11') {
            win.setFullScreen(!win.isFullScreen());
            event.preventDefault();
            return;
        }
        // Tillbaka, som i en webbläsare.
        if (input.key === 'Escape' || input.key === 'Backspace' || (input.alt && input.key === 'ArrowLeft')) {
            goBack();
            event.preventDefault();
        }
        if (input.alt && input.key === 'ArrowRight') {
            if (win.webContents.navigationHistory.canGoForward()) win.webContents.navigationHistory.goForward();
            event.preventDefault();
        }
    });

    win.on('app-command', (e, cmd) => {
        if (cmd === 'browser-backward') goBack();
    });

    if (profile) startWithProfile(win, customSession);
    else showPicker(win);

    return win;
}

function showPicker(win) {
    if (!win || win.isDestroyed()) return win;
    win.setTitle('Vem skall titta? — OmarchyTube');
    win.loadFile(pickerPage);
    return win;
}

function switchMode(newMode) {
    applyMode(newMode);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(getUrlForMode(currentMode));
}

// Inloggad: YouTubes sida i det läge användaren valt. Inte inloggad: TV-läget, för
// det är den enda väg Google öppnar för en inbäddad webbläsare — där ligger QR-
// koden och de åtta tecknen (mätt: första valet "Get started", ett Enter ger
// "Sign in with your phone — Scan QR code or go to yt.be/activate").
function startWithProfile(win, customSession) {
    customSession.cookies.get({ domain: '.youtube.com' })
        .then((cookies) => {
            const plan = planForSession(cookies, currentMode);
            if (plan.mode !== currentMode) applyMode(plan.mode);
            win.loadURL(plan.url);
            logViewport(win);
            if (plan.autoSignIn) {
                console.log('[OmarchyTube] Ingen session i den här profilen: TV-appens första val är "Get started" — ett Enter ger QR-koden och de åtta tecknen. F4 öppnar yt.be/activate.');
                win.setTitle('OmarchyTube — tryck Enter för QR-koden');
                watchForSignIn(win, customSession);
            }
        })
        .catch((err) => {
            console.warn('[OmarchyTube] Kunde inte läsa profilens kakor:', err.message);
            win.loadURL('https://www.youtube.com/tv');
        });
}

// TV-vägen är en inloggningsdörr, inte en spelare: 10-fotslayouten är grotesk i
// ett normalt fönster. Så fort kontot finns i sessionen går appen tillbaka till
// det läge användaren valt (skrivbordet, som ser ut som YouTube). Läser bara
// Electronns kakburk — aldrig sidan.
const SIGN_IN_POLL_MS = 3000;
// ponytail: ger upp efter tio minuter; gör det till en inställning om någon vill vakta längre
const SIGN_IN_WATCH_MS = 10 * 60 * 1000;

function watchForSignIn(win, customSession) {
    const started = Date.now();
    const timer = setInterval(() => {
        if (win.isDestroyed() || Date.now() - started > SIGN_IN_WATCH_MS) {
            clearInterval(timer);
            return;
        }
        customSession.cookies.get({ domain: '.youtube.com' })
            .then((cookies) => {
                const plan = planForSession(cookies, readState().mode || 'desktop');
                if (plan.autoSignIn) return; // fortfarande utloggad
                clearInterval(timer);
                if (win.isDestroyed()) return;
                console.log(`[OmarchyTube] Kontot finns i sessionen — tillbaka till ${plan.mode}-läget.`);
                applyMode(plan.mode);
                win.loadURL(plan.url);
                logViewport(win);
            })
            .catch((err) => console.warn('[OmarchyTube] Kunde inte läsa sessionen:', err.message));
    }, SIGN_IN_POLL_MS);
    if (timer.unref) timer.unref();
}

function openProfile(id) {
    const profile = findProfile(readProfiles(profilesFile), id);
    if (!profile) return null;

    const current = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const currentId = current ? windowProfiles.get(current.webContents.id) : null;

    // Samma profil: rutan har redan rätt session, så det är bara att gå tillbaka.
    if (current && currentId === profile.id) {
        startWithProfile(current, session.fromPartition(partitionFor(profile.id)));
        return current;
    }

    // Annan profil: partitionen sitter på fönstret och går inte att byta, så det
    // blir ett nytt fönster i samma storlek och det gamla stängs — ett fönster
    // kvar på skärmen.
    const next = createWindow(profile);
    if (current && !current.isDestroyed()) current.close();
    return next;
}

function registerIpc() {
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
        return list;
    });

    ipcMain.handle('omarchy-profiles:mode', (_event, next) => {
        if (next === 'tv' || next === 'desktop') applyMode(next);
        return currentMode;
    });

    ipcMain.handle('omarchy-profiles:pick', (_event, id) => {
        const profile = findProfile(readProfiles(profilesFile), String(id));
        if (!profile) return { ok: false, message: 'Profilen finns inte längre.' };
        openProfile(String(id));
        return { ok: true, message: `Öppnar ${profile.name} …` };
    });

    ipcMain.handle('omarchy-profiles:current', (event) => windowProfiles.get(event.sender.id) || null);
}

app.whenReady().then(() => {
    registerIpc();

    // Första skärmen är frågan: vem skall titta?
    createWindow(null);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
