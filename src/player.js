// Uppspelningen sker I APPEN.
//
// MÄTT 2026-09-20: YouTube kräver nu en PO-token för sina https-format; utan den
// svarar varje klient "Only images are available" och mpv blev ett svart fönster
// som inte gick att stänga. Med yt-dlp:s PO-provider (bgutil, installerad lokalt)
// finns formaten igen.
//
// Enda muxade formatet hos VARJE klient är itag 18 (640x360, avc1 + mp4a) — en URL
// med både bild och ljud, alltså det enda ett <video>-element kan spela direkt.
// DASH-paret (video och ljud separat) går inte att spela i ett element utan MSE.
// Därför: Enter spelar 360p direkt i appen, H ger hög kvalitet i mpv (som kan
// sätta ihop paret). Ingen kompromiss göms: kvaliteten står i statusraden.
const { execFile, spawn } = require('node:child_process');

const FORMAT = '18/b[ext=mp4]/b';              // en muxad fil — inget att sätta ihop
const FORMAT_HÖG = 'bv*+ba/b';                 // DASH-paret, för mpv
// MÄTT: android_vr ger 403 på sin egen URL (curl: 403 i alla UA:er), mweb ger
// samma itag 18 och svarar 206 — alltså den klienten som går att spela i <video>.
const KLIENT = 'youtube:player_client=mweb';
const YTDLP = process.env.YTDLP || 'yt-dlp';
let mpv = null;

function args(url) {
    return ['-g', '-f', FORMAT, '--no-playlist', '--extractor-args', KLIENT, url];
}

function play(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    return new Promise((resolve, reject) => {
        execFile(YTDLP, args(url), { timeout: 60000 }, (err, stdout, stderr) => {
            const ström = String(stdout || '').trim().split('\n').filter(Boolean)[0];
            if (err || !ström) {
                console.error(`[OmarchyTube] yt-dlp svarade inte: ${err ? err.message : 'ingen ström'} ${String(stderr || '').slice(0, 200)}`);
                reject(new Error('kunde inte hämta strömmen'));
                return;
            }
            console.log(`[OmarchyTube] spelar ${videoId} i appen`);
            resolve(ström);
        });
    });
}

// Hög kvalitet: mpv sätter ihop DASH-paret. Ett eget fönster — därför bara när
// Alex själv ber om det med H.
function playHigh(videoId) {
    stopHigh();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[OmarchyTube] spelar ${videoId} i mpv (hög kvalitet)`);
    mpv = spawn('mpv', [`--ytdl-format=${FORMAT_HÖG}`, '--force-window=immediate', '--title=OmarchyTube', url], { stdio: 'inherit', detached: false });
    mpv.on('exit', (code) => { console.log(`[OmarchyTube] mpv avslutades (${code})`); mpv = null; });
    mpv.on('error', (err) => { console.error('[OmarchyTube] mpv kunde inte startas:', err.message); mpv = null; });
    return true;
}

function stopHigh() {
    if (mpv) { mpv.kill('SIGTERM'); mpv = null; }
}

module.exports = { play, playHigh, args, FORMAT, FORMAT_HÖG };
