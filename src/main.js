// OmarchyTube — vem skall titta, och sedan YouTube i den här rutan.
//
// Regeln efter rivningen 2026-09-18: appen äger fönstret, frågan, sessionen och
// vyn. Den rör inte YouTubes sidor — ingen injicerad CSS, ingen injicerad JS.
//
//   * injicerad geometri (tvinga #container till 100vw/100vh) träffade
//     skrivbordssidan, som har SJU element med det id:t, och la hela sidan i ett
//     band högst upp med resten bortklippt;
//   * en funktion som deklarerades inuti en annan (handleExitVideo i registerIpc)
//     gjorde Esc stendöd utan ett ljud.
//
// Vyn får vi däremot styra, och det är två saker:
//
//   * FULLSKÄRM — en riktig begäran till kompositorn. maximize() förlorar mot
//     Hyprlands tilning: mätt blev rutan 941 px bred, och YouTubes 10-fotslayout
//     visar då två gigantiska brickor i stället för en läsbar rad.
//   * ZOOM (zoom.js) — webbläsarens egen vy-inställning, samma sak som Ctrl+- hos
//     Google. Fler kort per rad i skrivbordslayouten. Mätt två gånger: den biter
//     inte i TV-läget, vars 10-fotslayout är byggd i rem mot fönsterbredden.
//
// Inloggningen går via Googles TV-flöde (QR-koden) eftersom Google vägrar
// lösenordsformuläret i en inbäddad webbläsare — mätt: "Couldn't sign you in —
// This browser or app may not be secure".
const { app, BrowserWindow, screen, session, shell, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const { addProfile, findProfile, partitionFor, readProfiles, removeProfile, writeProfiles } = require('./profiles');
const { getUserAgentForMode } = require('./user-agent');
const { TV_PAGE, isBlockedSignIn, isSignedIn, pageForMode, planForSession, signInPlan } = require('./sign-in');
const { DEFAULT: DEFAULT_ZOOM, clampZoom, nextZoom } = require('./zoom');

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

// Användarens läge (sparas) och läget rutan står i just nu. Dörren är ett tillfälligt
// besök i TV-läget och får ALDRIG skriva över användarens val — mätt 2026-09-19:
// dörren sparade 'tv', och efter inloggningen gick appen tillbaka till
// 10-fotslayouten (en rad, två stora lågupplösta kort) i stället för
// skrivbordslayouten han ville ha.
//
// Skrivbordsläge är standard: TV-appen är byggd för en soffa tre meter bort, med
// stora brickor och lågupplöst konst, och den lyder inte zoom (rem mot bredden).
let userMode = argv.includes('--tv') ? 'tv'
    : argv.includes('--desktop') ? 'desktop'
        : (readState().userMode || 'desktop');
let currentMode = userMode;

// Zoomen sparas per användare: den är en kalibrering för hans skärm och ögon, inte
// en konstant. Standard 0,80 ger 2400 CSS-px i en 1920-ruta ⇒ 5–6 kort i bredd i
// stället för 4.
let currentZoom = clampZoom(readState().zoom ?? DEFAULT_ZOOM);

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

// Zoomens enda väg. Skriver resultatet, inte avsikten — den läxan kostade en kväll.
function applyZoom(win, next) {
    currentZoom = clampZoom(next);
    writeState({ zoom: currentZoom });
    if (win && !win.isDestroyed()) win.webContents.setZoomFactor(currentZoom);
    console.log(`[OmarchyTube] zoom => ${win && !win.isDestroyed() ? win.webContents.getZoomFactor().toFixed(2) : currentZoom.toFixed(2)}`);
    if (win && !win.isDestroyed()) logViewport(win);
    return currentZoom;
}

// persist = användarens eget val (F2 när man är inloggad, eller --tv/--desktop).
// Dörren och vakten byter läge utan att spara.
function applyMode(newMode, { persist = false } = {}) {
    currentMode = newMode;
    if (persist) {
        userMode = newMode;
        writeState({ userMode });
    }
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
        // CSS-ytan är det tal som avgör hur många kort som får plats: 1920 px vid
        // zoom 1, 2400 vid 0,80.
        const cssWidth = Math.round(bounds.width / zoom);
        console.log(`[OmarchyTube] rutan ${bounds.width}x${bounds.height} | zoom ${zoom.toFixed(2)} | ≈${cssWidth} CSS-px bred | skärmens skala ${display.scaleFactor} | fullskärm ${win.isFullScreen()} | ${currentMode}`);
    } catch (err) {
        console.warn('[OmarchyTube] Kunde inte läsa rutan:', err.message);
    }
}

function goBack() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const history = mainWindow.webContents.navigationHistory;
    if (history.canGoBack()) history.goBack();
    else mainWindow.loadURL(pageForMode(currentMode));
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
            // Enda skalningen i appen, och den sitter på fönstret — aldrig på
            // sidans innehåll. Bara zoomFactor; setZoomLevel nollställer den (mätt).
            zoomFactor: profile ? currentZoom : 1,
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
            writeState({ width: bounds.width, height: bounds.height });
        } catch (err) {
            // Stängningen får inte falla på att läget inte kunde sparas.
        }
    });
    win.on('closed', () => {
        windowProfiles.delete(contentsId);
        watchedWindows.delete(contentsId);
        if (mainWindow === win) mainWindow = null;
    });

    win.webContents.setUserAgent(getUserAgentForMode(currentMode));

    win.webContents.setWindowOpenHandler(({ url }) => {
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        if (isBlockedSignIn(url)) {
            // Popup-vägen till Googles lösenordsformulär: stäng den och öppna dörren
            // Google faktiskt öppnar i stället för att visa det blockerade formuläret.
            // Bara från skrivbordsläget — i dörren äger TV-appen sin egen inloggning.
            if (currentMode === 'desktop') routeToSignInDoor(win);
            return { action: 'deny' };
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

        // Väljarsidan sköter Enter, Esc, N och Delete själv (profiles-page.js).
        // Utan den här grinden gjorde Esc både sidans jobb och vårt eget.
        if (win.webContents.getURL().includes('profiles.html')) return;

        // Byt tittare: visar väljaren i den här rutan.
        if (input.key === 'F3') {
            showPicker(win);
            event.preventDefault();
            return;
        }
        if (input.key === 'F2') {
            // Inloggad: F2 är ett riktigt val, och det sparas. Utloggad: F2 är dörren
            // till QR-koden, och dörren rör inte användarens läge.
            sessionOfWindow(win).cookies.get({ domain: '.youtube.com' })
                .then((cookies) => {
                    if (isSignedIn(cookies)) switchMode(currentMode === 'tv' ? 'desktop' : 'tv', { persist: true });
                    else switchMode('tv');
                })
                .catch(() => switchMode('tv'));
            event.preventDefault();
            return;
        }
        // Koden från TV-skärmen skrivs in i en webbläsare — F4 öppnar rätt sida.
        if (input.key === 'F4') {
            shell.openExternal('https://yt.be/activate');
            event.preventDefault();
            return;
        }
        // Fler eller färre kort: samma tangentbord som i en webbläsare, och samma
        // tangenter på numpaden (ett svenskt tangentbord skickar '_' för '-').
        const zoomKey = input.control || input.meta;
        if (zoomKey && ['-', '_', 'Subtract'].includes(input.key)) {
            applyZoom(win, nextZoom(currentZoom, 'out'));
            event.preventDefault();
            return;
        }
        if (zoomKey && ['=', '+', 'Add'].includes(input.key)) {
            applyZoom(win, nextZoom(currentZoom, 'in'));
            event.preventDefault();
            return;
        }
        if (zoomKey && ['0', 'Numpad0'].includes(input.key)) {
            applyZoom(win, nextZoom(currentZoom, 'reset'));
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

    // Samma dörr om inloggningen navigeras i huvudramen i stället för i en popup —
    // men bara från skrivbordsläget. Mätt 2026-09-19: fångade vi även TV-appens egna
    // Google-steg rev vi inloggningen och släppte användaren tillbaka i TV-flödet.
    win.webContents.on('did-navigate', (_event, url) => {
        if (currentMode === 'desktop' && isBlockedSignIn(url)) routeToSignInDoor(win);
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

function switchMode(newMode, { persist = false } = {}) {
    applyMode(newMode, { persist });
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;

    // TV-läget ÄR dörren: rätt sida, städade besökskakor, och vakten som går
    // tillbaka till användarens läge så fort kontot finns — annars blir dörren ett
    // rum man fastnar i.
    if (currentMode === 'tv') {
        openSignInDoor(win, sessionOfWindow(win));
        return;
    }
    win.loadURL(pageForMode('desktop'));
}

// Profilen öppnar sin vanliga sida i det läge användaren valt — även utloggad, för
// skrivbordssidan ser ut som YouTube och lyder zoom. Är läget TV (eller blir det, se
// routeToSignInDoor) är sidan inloggningsdörren: mätt är första valet där
// "Get started", och ett Enter ger "Sign in with your phone — Scan QR code or go to
// yt.be/activate — Enter the code GDM-STY-SDG".
function startWithProfile(win, customSession) {
    customSession.cookies.get({ domain: '.youtube.com' })
        .then((cookies) => {
            const plan = planForSession(cookies, currentMode);
            if (plan.mode !== currentMode) applyMode(plan.mode);
            if (plan.signIn) {
                openSignInDoor(win, customSession);
                return;
            }
            win.loadURL(plan.url);
            logViewport(win);
            if (!plan.signedIn) {
                // Utloggad i skrivbordsläget: sidan ser ut som YouTube och lyder
                // zoom. Dörren öppnas när Google-inloggningen faktiskt försöks.
                console.log('[OmarchyTube] Utloggad profil i skrivbordsläget. Google vägrar sitt lösenordsformulär i en inbäddad webbläsare — appen byter till TV-dörren (QR-koden) när du försöker logga in, eller med F2.');
            }
        })
        .catch((err) => {
            console.warn('[OmarchyTube] Kunde inte läsa profilens kakor:', err.message);
            win.loadURL('https://www.youtube.com/tv');
        });
}

// TV-appen hoppar FÖRBI inloggningsrutan när partitionen redan har besökskakor: den
// visar sitt vanliga flöde ("Recommended"/"New to you") i stället, och där finns
// ingen QR-kod. Mätt 2026-09-19 hos Alex — ett klick på Sign in gav flödet, ingen
// kod. Med tom partition kommer "Get started" först (mätt 2026-09-18 mot
// youtube.com/tv). Städningen rör därför bara besökarens egna kakor: finns ett
// konto (SID) rörs ingenting, och en städad besökare kostar ingenting att bygga upp
// igen.
async function forgetVisitor(targetSession) {
    const cookies = await targetSession.cookies.get({ domain: '.youtube.com' });
    if (isSignedIn(cookies)) return false;

    await Promise.all(cookies.map((cookie) =>
        targetSession.cookies.remove('https://www.youtube.com/', cookie.name).catch(() => {})));

    // Kakor är inte allt: TV-appen minns en återkommande besökare i lokal lagring
    // också, och då visar den flödet i stället för inloggningen (mätt 2026-09-19 —
    // städade kakor räckte inte). Electronns egen API, ingen sidscriptning.
    for (const origin of ['https://www.youtube.com', 'https://www.youtube.com/tv']) {
        await targetSession.clearStorageData({
            origin,
            storages: ['localstorage', 'indexdb', 'cookies']
        }).catch((err) => console.warn('[OmarchyTube] Kunde inte städa', origin, err.message));
    }
    console.log(`[OmarchyTube] Städade ${cookies.length} besökskakor och den lokala lagringen, så TV-appen visar inloggningen i stället för flödet.`);
    return true;
}

// Dörren. ETT ställe, tre vägar in: ett klick på YouTubes inloggning (fångad i
// popup eller navigering), F2, eller en utloggad profil som startar i TV-läget.
async function openSignInDoor(win, targetSession) {
    if (!win || win.isDestroyed()) return;
    const wasVisitor = await forgetVisitor(targetSession);
    if (win.isDestroyed()) return;

    const plan = signInPlan();
    applyMode(plan.mode);
    win.loadURL(plan.url);
    console.log('[OmarchyTube] Inloggningsdörren: TV-appens första val är "Get started" — ett Enter ger QR-koden och de åtta tecknen. F4 öppnar yt.be/activate.');
    win.setTitle('OmarchyTube — tryck Enter för QR-koden');
    logViewport(win);
    // Vakten finns för att följa en inloggning som pågår — en inloggad profil behöver
    // den inte, och skulle bara ladda om dörren i onödan.
    if (wasVisitor) watchForSignIn(win, targetSession);
}

// Googles lösenordsväg är stängd för inbäddade webbläsare. I stället för att visa
// deras blockerade formulär går appen till den dörr Google öppnar: TV-appens QR-kod.
function routeToSignInDoor(win) {
    if (!win || win.isDestroyed()) return;
    console.log('[OmarchyTube] Google-inloggning i en inbäddad webbläsare är stängd — öppnar TV-dörren (QR-koden).');
    openSignInDoor(win, sessionOfWindow(win));
}

const sessionOfWindow = (win) => sessionOfWindow(win);

function partitionOfWindow(win) {
    const id = windowProfiles.get(win.webContents.id);
    return id ? partitionFor(id) : PICKER_PARTITION;
}

// TV-vägen är en inloggningsdörr, inte en spelare: 10-fotslayouten är grotesk i
// ett normalt fönster. Så fort kontot finns i sessionen går appen tillbaka till
// det läge användaren valt (skrivbordet, som ser ut som YouTube). Läser bara
// Electronns kakburk — aldrig sidan.
const SIGN_IN_POLL_MS = 3000;
// ponytail: ger upp efter tio minuter; gör det till en inställning om någon vill vakta längre
const SIGN_IN_WATCH_MS = 10 * 60 * 1000;

const watchedWindows = new Set();

function watchForSignIn(win, customSession) {
    if (watchedWindows.has(win.webContents.id)) return; // en vakt per ruta
    watchedWindows.add(win.webContents.id);
    const started = Date.now();
    const timer = setInterval(() => {
        if (win.isDestroyed() || Date.now() - started > SIGN_IN_WATCH_MS) {
            clearInterval(timer);
            return;
        }
        customSession.cookies.get({ domain: '.youtube.com' })
            .then((cookies) => {
                if (!isSignedIn(cookies)) return; // fortfarande utloggad
                clearInterval(timer);
                watchedWindows.delete(win.webContents.id);
                if (win.isDestroyed()) return;
                // Tillbaka till användarens läge — inte till det dörren lånade.
                const back = userMode;
                console.log(`[OmarchyTube] Kontot finns i sessionen — tillbaka till ${back}-läget.`);
                applyMode(back);
                win.loadURL(pageForMode(back));
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
