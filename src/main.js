// OmarchyTube — vår egen YouTube-klient.
//
// Fönstret, rutnätet och sessionen är våra. YouTube levererar data (InnerTube)
// och video (mpv + yt-dlp). Ingen YouTube-sida visas i rutnätet, ingen
// webbläsare startas, och inloggningen är YouTubes egen kod-dörr — ett fönster
// som visar TV-appens QR, inget annat.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Loggen hamnar också i en fil: då kan felet läsas i efterhand i stället för att
// någon skall klistra in en skärmdump (appens utdata försvinner med terminalen).
// Ett eget hem för appens session. Mätt 2026-09-20: appen satte aldrig userData,
// så partitionen hamnade i Electrons standardkatalog — och tre olika TV-tillstånd
// låg på disk (~/.config/Electron, ~/.config/OmarchyTube, ~/.config/omarchy-tube).
// Inloggningen tappades varje gång appens namn eller startväg ändrades.
app.setPath('userData', path.join(app.getPath('appData'), 'OmarchyTube'));

const LOG_FILE = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'omarchy-tube', 'log.txt');
try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    if (fs.statSync(LOG_FILE).size > 1_000_000) fs.truncateSync(LOG_FILE);   // ponytail: en fil, ingen rotation
    fs.appendFileSync(LOG_FILE, `\n=== start ${new Date().toISOString()} ===\n`);
} catch (err) { /* loggfilen är en bekvämlighet, inte ett krav */ }
for (const level of ['log', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
        original(...args);
        try { fs.appendFileSync(LOG_FILE, args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n'); } catch { /* tyst */ }
    };
}
const { search, recommended, recommendedWithAnyClient, candidatesFrom, subscriptionsFeed, storeToken, storeSession, storedSession } = require('./innertube');
const { play, stop } = require('./player');
const account = require('./account');

const PARTITION = account.PARTITION;
let win = null;
let flushed = false;   // sessionen skrivs till disk en gång, inte i en oändlig kedja

function createWindow() {
    win = new BrowserWindow({
        width: 1600,
        height: 900,
        backgroundColor: '#0b0b0d',
        autoHideMenuBar: true,
        // Hyprland tilar fönster: maximize() biter inte mot en tilande kompositor
        // (mätt 2026-09-19, rutan mättes till 941 px bred). fullscreen gör det.
        fullscreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            partition: PARTITION,
        },
    });

    win.loadFile(path.join(__dirname, 'browse.html'));
    win.webContents.on('did-finish-load', async () => {
        const state = await account.accountState();
        const rad = (när) => {
            const [w, h] = win.getSize();
            console.log(`[OmarchyTube] ${när}: rutan ${w}x${h} | fullskärm ${win.isFullScreen()} | ${state.signedIn ? `konto: ${state.markers.join(', ')}` : 'inget konto'}`);
        };
        rad('vid start');
        // Fullskärmsbegäran är inte omedelbar; mät den igen när kompositor hunnit svara.
        setTimeout(() => rad('efter 3 s'), 3000);
    });
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'F11') {
            win.setFullScreen(!win.isFullScreen());
            console.log(`[OmarchyTube] fullskärm => ${win.isFullScreen()}`);
            event.preventDefault();
        } else if (input.key === 'Escape' && win.isFullScreen()) {
            win.setFullScreen(false);
            event.preventDefault();
        } else if (input.key.toLowerCase() === 'q' && input.control) {
            app.quit();
        }
    });
    win.on('closed', () => { stop(); win = null; });
}

ipcMain.handle('search', (_event, query) => search(String(query || '').trim()));

ipcMain.handle('feed', async (_event, kind) => {
    if (kind === 'recommended') return recommended();
    if (kind === 'latest') return subscriptionsFeed();
    throw new Error(`okänd flik: ${kind}`);
});

ipcMain.handle('account', () => account.accountState());

// Koden och QR-bilden till appens egen panel.
ipcMain.handle('loginInfo', () => account.loginInfo());

// Inloggningen: YouTubes egen kod-dörr. Renderaren frågar 'account' medan
// fönstret är öppet, så ingen kanal behövs för att säga till när det är klart.
ipcMain.handle('openLogin', () => {
    account.openDoor({
        // Provet: samma anrop rutnätet behöver. Svarar YouTube med videor betyder
        // det att sessionen bär ett konto — oavsett vad kakburken heter inuti.
        probe: async () => (await recommended()).length,
        // Hittar dörren något som liknar en nyckel i TV-appens lagring provas den
        // mot YouTube. Fungerar den sparas den — och loggen nämner bara NAMNET,
        // aldrig nyckeln (den är kontots).
        onStorage: async (par) => {
            for (const [namn, varde] of par) {
                if (typeof varde !== 'string') continue;
                for (const kandidat of candidatesFrom(varde).slice(0, 4)) {
                    const { items, clientName } = await recommendedWithAnyClient(kandidat);
                    console.log(`[OmarchyTube] provar "${namn}" (${kandidat.length} tecken): ${items.length} videor${clientName ? ` via ${clientName}` : ''}`);
                    if (items.length) {
                        storeToken(kandidat);
                        console.log(`[OmarchyTube] sessionen hittad i "${namn}" och sparad — appen är inloggad`);
                        return;
                    }
                }
            }
        },
        // Nyckeln dörren fångade ur sitt eget anrop: den skrivs till disk (0600)
        // och bevisas med ett riktigt anrop innan appen kallar sig inloggad.
        onSession: async (data) => {
            storeSession(data);
            const antal = await recommended().then((i) => i.length).catch(() => 0);
            console.log(`[OmarchyTube] sessionen sparad (${String(data.token || '').length} tecken) — rekommendationerna svarar ${antal} videor`);
        },
        onSignedIn: (state) => console.log(`[OmarchyTube] dörren stängd, kontot i partitionen (${state.via})`),
    });
    return { opened: true };
});

ipcMain.handle('play', (_event, videoId) => {
    if (!/^[\w-]{11}$/.test(String(videoId || ''))) throw new Error(`ogiltigt video-id: ${videoId}`);
    return { pid: play(videoId) };
});

// En instans: två samtidiga appfönster delar partition och skriver över varandra.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const [win] = BrowserWindow.getAllWindows();
        if (win) { win.show(); win.focus(); }
    });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stop(); app.quit(); });
// Sessionen skall till disk innan appen dör, annars börjar nästa start om.
app.on('before-quit', (event) => {
    stop();
    if (flushed) return;
    event.preventDefault();
    flushed = true;
    // Synkron: inget .catch, och klamrarna på sin egen rad.
    try { session.fromPartition(PARTITION).flushStorageData(); } catch (err) { console.error('[OmarchyTube] kunde inte skriva sessionen:', err.message); }
    app.quit();
});
