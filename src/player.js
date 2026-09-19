// Uppspelningen: mpv gör det svåra.
//
// mpv (med yt-dlp inbyggt) löser strömmar, signaturer, PO-token och codecs. Det
// är deras jobb och de gör det bättre än en egen implementation — SmartTube
// underhåller sin egen spelare, vi lånar en.
//
// Formatväljaren är den enda knuffen som behövs. Mätt 2026-09-19: mpv:s eget
// val gav HTTP 403 på videoströmmen (YouTubes klient-attestering), med
// bv*+ba/b spelade samma video AV1 3840x2160 60 fps utan konto.
const { spawn } = require('node:child_process');

const FORMAT = 'bv*+ba/b';
let current = null;

function play(videoId) {
    stop();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[OmarchyTube] spelar ${url} via mpv`);
    current = spawn('mpv', [
        `--ytdl-format=${FORMAT}`,
        '--force-window=immediate',   // ljudbara videor skall också synas
        '--title=OmarchyTube',
        url,
    ], { stdio: 'inherit' });
    current.on('error', (err) => {
        console.error('[OmarchyTube] mpv kunde inte startas:', err.message);
        current = null;
    });
    current.on('exit', (code) => {
        console.log(`[OmarchyTube] mpv avslutades (${code})`);
        current = null;
    });
    return current.pid;
}

function stop() {
    if (current) {
        current.kill('SIGTERM');
        current = null;
    }
}

module.exports = { play, stop, FORMAT };
