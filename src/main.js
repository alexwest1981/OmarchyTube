// OmarchyTube — vår egen YouTube-klient.
//
// Fönstret, rutnätet och sessionen är våra. YouTube levererar data (InnerTube)
// och video (mpv + yt-dlp). Ingen YouTube-sida laddas, ingen kaka röres, ingen
// webbläsare startas: appen kan därför inte hamna i en inloggningsloop — den
// har ingen inloggning att hamna i.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { search, recommended } = require('./innertube');
const feeds = require('./dataapi');
const auth = require('./auth');
const { play, stop } = require('./player');

// Egen partition: den gamla appens YouTube-kakor får ligga kvar orörda och
// påverkar inte InnerTube-anropen.
const PARTITION = 'persist:omarchy-tube-own';
let win = null;
let pending = null;   // pågående device-kod, en i taget

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
    win.webContents.on('did-finish-load', () => {
        const [w, h] = win.getSize();
        console.log(`[OmarchyTube] rutan ${w}x${h} | fullskärm ${win.isFullScreen()} | sök först, Enter spelar`);
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

// Flikarna: rekommenderat (YouTubes flöde, kräver konto), senaste (din feed),
// mina kanaler (din lista). Allt tre säger ifrån i klartext när kontot saknas.
ipcMain.handle('feed', async (_event, kind) => {
    if (kind === 'recommended') return recommended();
    if (kind === 'latest') return feeds.latestFromSubscriptions();
    if (kind === 'subscriptions') {
        const channels = await feeds.mySubscriptions();
        console.log(`[OmarchyTube] mina kanaler: ${channels.length}`);
        return channels.map((c) => ({ kind: 'channel', channelId: c.channelId, title: c.title, channel: 'Kanal', thumbnail: c.avatar }));
    }
    throw new Error(`okänd flik: ${kind}`);
});

// Ett klick på en kanal: dess senaste videor.
ipcMain.handle('channelVideos', async (_event, channelId) => feeds.channelVideos(String(channelId || '')));

ipcMain.handle('loggedOut', () => { auth.forget(); return { signedIn: false }; });
ipcMain.handle('account', () => ({ signedIn: auth.signedIn(), hasClient: auth.hasClient() }));
ipcMain.handle('saveClient', (_event, id, secret) => { auth.setClient(String(id || ''), String(secret || '')); return { saved: true }; });
ipcMain.handle('startLogin', async () => {
    const started = await auth.start();
    pending = started;
    return { userCode: started.userCode, url: started.url, interval: started.interval };
});
ipcMain.handle('loginStatus', async () => {
    if (!pending) return { state: 'ingen pågående inloggning' };
    const result = await auth.pollOnce(pending.deviceCode);
    if (result.state === 'klar') pending = null;
    return result;
});

ipcMain.handle('play', (_event, videoId) => {
    if (!/^[\w-]{11}$/.test(String(videoId || ''))) throw new Error(`ogiltigt video-id: ${videoId}`);
    return { pid: play(videoId) };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stop(); app.quit(); });
app.on('before-quit', stop);
