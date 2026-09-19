// OmarchyTube — vår egen YouTube-klient.
//
// Fönstret, rutnätet och sessionen är våra. YouTube levererar data (InnerTube)
// och video (mpv + yt-dlp). Ingen YouTube-sida visas i rutnätet, ingen
// webbläsare startas, och inloggningen är YouTubes egen kod-dörr — ett fönster
// som visar TV-appens QR, inget annat.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const { search, recommended, subscriptionsFeed } = require('./innertube');
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
        const [w, h] = win.getSize();
        const state = await account.accountState();
        console.log(`[OmarchyTube] rutan ${w}x${h} | fullskärm ${win.isFullScreen()} | ${state.signedIn ? `konto: ${state.markers.join(', ')}` : 'inget konto'}`);
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

// Inloggningen: YouTubes egen kod-dörr. Renderaren frågar 'account' medan
// fönstret är öppet, så ingen kanal behövs för att säga till när det är klart.
ipcMain.handle('openLogin', () => {
    account.openDoor({ onSignedIn: () => console.log('[OmarchyTube] dörren stängd, kontot i partitionen') });
    return { opened: true };
});

ipcMain.handle('play', (_event, videoId) => {
    if (!/^[\w-]{11}$/.test(String(videoId || ''))) throw new Error(`ogiltigt video-id: ${videoId}`);
    return { pid: play(videoId) };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stop(); app.quit(); });
// Sessionen skall till disk innan appen dör, annars börjar nästa start om.
app.on('before-quit', (event) => {
    stop();
    if (flushed) return;
    event.preventDefault();
    flushed = true;
    session.fromPartition(PARTITION).flushStorageData()
        .catch((err) => console.error('[OmarchyTube] kunde inte skriva sessionen:', err.message))
        .finally(() => { console.log('[OmarchyTube] sessionen skriven till disk'); app.quit(); });
});
