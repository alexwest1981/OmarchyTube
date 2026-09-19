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
const { partition } = require('./account');

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

// Sessionen följer med: anropen går i appens partition, där kontots kakor bor.
// Det är de som gör flödet personligt — utan konto svarar YouTube 400 eller
// tomt (mätt 2026-09-19). Anropen presenterar sig som en vanlig webbläsare;
// bara inloggningsdörren behöver TV-identiteten.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const headers = () => ({ 'Content-Type': 'application/json', 'User-Agent': UA });

async function post(endpoint, body) {
    const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${API_KEY}&prettyPrint=false`;
    const response = await net.fetch(url, {
        method: 'POST',
        headers: headers(),
        session: partition(),
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

// YouTubes egna flöden. De kräver ett konto — utan konto svarar YouTube tomt
// eller 400, och då säger appen det i stället för att visa en tom ruta.
const recommended = () => run('rekommenderat', 'browse', { browseId: 'FEwhat_to_watch' });

// Din feed: de nyaste videorna från kanalerna du följer. Namnet är YouTubes
// eget; provar kandidaterna i tur och ordning och loggar vilken som svarade.
const SUBSCRIPTION_FEEDS = ['FEsubscriptions', 'FEchannels'];
async function subscriptionsFeed() {
    let lastError = null;
    for (const browseId of SUBSCRIPTION_FEEDS) {
        try {
            const items = await run(`feed ${browseId}`, 'browse', { browseId });
            if (items.length) return items;
        } catch (err) { lastError = err; }
    }
    if (lastError) throw lastError;
    return [];
}

module.exports = { search, recommended, subscriptionsFeed, thumbUrl, API_KEY, CONTEXT };
