// Hur en profil öppnas i webbläsaren — kommandot, och varför det ser ut så.
//
// Mätt 2026-09-18: Google vägrar lösenordsinloggning i en inbäddad webbläsare,
// YouTubes TV-app blir oläslig i en smal ruta, och Electronns skalning beter sig
// inte som en webbläsares. I Brave fungerar allt tre, och varje profil får sin
// egen --user-data-dir: egen Google-session, egna flöden, egen historik. Ingen
// electron-import här, så npm test kan mäta kommandot.
const path = require('path');

const DEFAULT_BROWSER = 'brave';
const TV_PAGE = 'https://www.youtube.com/tv';
const DESKTOP_PAGE = 'https://www.youtube.com';

const pageForMode = (mode) => (mode === 'tv' ? TV_PAGE : DESKTOP_PAGE);

function browserDir(userData, profileId) {
    return path.join(userData, 'profiles', profileId, 'browser');
}

// --no-first-run och --no-default-browser-check: en ny katalog skall vara en
// YouTubeyta, inte en välkomstguide. Adressen sist, som webbläsare vill ha den.
function browserArgs(dir, url) {
    return [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', url];
}

function browserCommand(userData, profile, mode, browser = process.env.OMARCHYTUBE_BROWSER || DEFAULT_BROWSER) {
    const dir = browserDir(userData, profile.id);
    return { command: browser, args: browserArgs(dir, pageForMode(mode)), dir, url: pageForMode(mode) };
}

module.exports = { DEFAULT_BROWSER, DESKTOP_PAGE, TV_PAGE, browserArgs, browserCommand, browserDir, pageForMode };
