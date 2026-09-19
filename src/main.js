// OmarchyTube — vår egen YouTube-klient.
//
// Fönstret, rutnätet och sessionen är våra. YouTube levererar data (InnerTube)
// och video (mpv + yt-dlp). Ingen YouTube-sida laddas, ingen kaka röres, ingen
// webbläsare startas: appen kan därför inte hamna i en inloggningsloop — den
// har ingen inloggning att hamna i.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { search } = require('./innertube');
const { play, stop } = require('./player');

// Egen partition: den gamla appens YouTube-kakor får ligga kvar orörda och
// påverkar inte InnerTube-anropen.
const PARTITION = 'persist:omarchy-tube-own';
let win = null;

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

ipcMain.handle('play', (_event, videoId) => {
    if (!/^[\w-]{11}$/.test(String(videoId || ''))) throw new Error(`ogiltigt video-id: ${videoId}`);
    return { pid: play(videoId) };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stop(); app.quit(); });
app.on('before-quit', stop);
