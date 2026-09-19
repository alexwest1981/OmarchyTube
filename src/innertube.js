// YouTubes data, utan dess sidor.
//
// Rutnätet är vårt; datan är YouTubes. Anropen går i huvudprocessen, där det
// inte finns någon CORS att ta hänsyn till. Ingen YouTube-sida laddas någonsin,
// så ingenting här kan omdirigeras, kläs om eller förväxlas med en inloggning.
//
// Mätt 2026-09-19: sökning svarar utan konto (19–45 träffar); YouTubes egna
// startflöden (FEwhat_to_watch, FEtrending, FEexplore) svarar 400 eller tomt
// utan konto — därför är sökning appens ingång.
const { net } = require('electron');
const { extractItems } = require('./innertube-extract');

// Nyckeln youtube.com själv skickar till sina egna sidor via ytcfg. Ingen
// hemlighet, inte knuten till något konto.
const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const CONTEXT = {
    client: {
        clientName: 'WEB',
        clientVersion: '2.20260916.00.00',
        hl: 'en',
        gl: 'US',
    },
};

// Miniatyrerna YouTube skickar i träfflistan är 720x404 och ser suddiga ut i ett
// 240 px-kort på en 1920-skärm. Samma video finns i 1280x720 hos i.ytimg.com:
// mätt 2026-09-19 (mq 320x180, hq 480x360, sd 640x480, hq720 1280x720).
const thumbUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;

async function post(endpoint, body) {
    const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${API_KEY}&prettyPrint=false`;
    const response = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: CONTEXT, ...body }),
    });
    if (!response.ok) throw new Error(`${endpoint} svarade ${response.status}`);
    return response.json();
}

// Loggar varje anrop: utan raden ser en tom ruta likadan ut oavsett om YouTube
// svarade tomt eller inte svarade alls (mätt 2026-09-18, när rutnätet stod på
// "Searching ..." utan att någon kunde se varför).
async function run(what, endpoint, body) {
    try {
        const items = extractItems(await post(endpoint, body));
        console.log(`[OmarchyTube] InnerTube ${what}: ${items.length} träffar`);
        return items;
    } catch (err) {
        console.error(`[OmarchyTube] InnerTube ${what} misslyckades:`, err.message);
        throw err;
    }
}

const search = (query) => run(`sök "${query}"`, 'search', { query });

module.exports = { search, thumbUrl, API_KEY, CONTEXT };
