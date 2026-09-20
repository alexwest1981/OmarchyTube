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
const fs = require('node:fs');
const path = require('node:path');
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
// Finns en token (hämtad ur TV-appens egen lagring) följer den med i stället —
// den är samma nyckel TV-appen själv använder mot YouTube.
// Det är de som gör flödet personligt — utan konto svarar YouTube 400 eller
// tomt (mätt 2026-09-19). Anropen presenterar sig som en vanlig webbläsare;
// bara inloggningsdörren behöver TV-identiteten.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const sessionFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(require('node:os').homedir(), '.config'), 'omarchy-tube', 'session.json');
function storedSession() {
    try {
        const data = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
        // En nyckel UTAN klientkontext gav 400 (mätt 2026-09-20: den gamla
        // gissningsvägen skrev en sådan fil). En halv session är ingen session —
        // då öppnar appen dörren och fångar en hel i stället.
        return data && data.token && data.context ? data : null;
    } catch { return null; }
}
function storedToken() {
    const s = storedSession();
    return s ? s.token : null;
}
// Mätt 2026-09-20: TV-appen autentiserar inte med kakor utan med en Bearer på
// 272 tecken, och den skickar en rad TV-huvuden vid sidan av. Nyckeln fångas ur
// appens EGNA dörrfönster (dess eget webRequest), aldrig ur en gissning — och
// den skrivs till disk, aldrig till loggen.
function storeSession(data) {
    const file = sessionFile();
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
}
function storeToken(token) {
    storeSession({ token });
}

const headers = (token, session) => {
    // session === null betyder: det här anropet skall vara kontofritt (sökningen).
    const s = session === undefined ? storedSession() : session;
    const base = { 'Content-Type': 'application/json', 'User-Agent': UA };
    const bearer = token || (s && s.token);
    if (!bearer) return base;
    if (!s) return { ...base, Authorization: `Bearer ${bearer}` };
    // TV-identitetens huvuden, ordagrant som TV-appen skickar dem (mätta i dess
    // eget anrop 2026-09-20). Utan dem svarar YouTube tomt trots giltig nyckel.
    return {
        ...base,
        Authorization: `Bearer ${bearer}`,
        Origin: 'https://www.youtube.com',
        Referer: 'https://www.youtube.com/tv',
        'X-Youtube-Client-Name': '7',
        'X-Youtube-Client-Version': s.clientVersion || '7.20260916.14.00',
        'X-Goog-Visitor-Id': s.visitorId || '',
        'X-YouTube-Page-Label': s.pageLabel || 'youtube.leanback.v4',
        'X-YouTube-Page-CL': String(s.pageCl || ''),
    };
};

async function post(endpoint, body, token, context) {
    // TV-sessionen gäller flödena (browse), inte sökningen: med TV-nyckeln svarar
    // /search tomt (mätt 2026-09-20: 0 träffar med sessionen, 19–45 utan). Sök
    // är kontofri väg och skall förbli det.
    const s = endpoint === 'browse' ? storedSession() : null;
    // TV-sessionen kom med TV-klientens egen nyckel i URL:en. Behåll frågedelen
    // (key/prettyPrint) från den — annars svarar YouTube 401.
    let url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${API_KEY}&prettyPrint=false`;
    if (s && s.url) {
        try {
            const fångad = new URL(s.url);
            url = `https://www.youtube.com/youtubei/v1/${endpoint}?${fångad.searchParams.toString()}`;
        } catch { /* behåll standard-URL:en */ }
    }
    const response = await net.fetch(url, {
        method: 'POST',
        headers: headers(token, s),
        session: partition(),
        body: JSON.stringify({ context: context || (s && s.context) || CONTEXT, ...body }),
    });
    // Nyckeln lever ungefär en timme (TV-appen förnyar den själv hela tiden). Svarar
    // YouTube 401 är den slut: släng den sparade sessionen, så att appen visar
    // inloggningsrutan igen, öppnar dörren och fångar en ny nyckel av sig själv.
    if (response.status === 401 || response.status === 403) {
        const fil = sessionFile();
        try { if (fs.existsSync(fil)) fs.unlinkSync(fil); } catch { /* redan borta */ }
        console.log(`[OmarchyTube] sessionen avvisades (${response.status}) — den hämtas igen`);
        throw new Error(`${endpoint} svarade ${response.status} — sessionen förnyas`);
    }
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
const recommended = () => run('rekommenderat', 'browse', { browseId: storedToken() ? 'default' : 'FEwhat_to_watch' });

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

// En nyckel i TV-appens lagring är ofta ett JSON-objekt, inte en färdig sträng
// (mätt: "yt.leanback.default::cached-access-tokens" gav 0 videor som helhet).
// Plocka ut varje lång sträng ur värdet och prova dem — rena, aldrig loggade.
function candidatesFrom(value) {
    const ut = [];
    const gå = (n) => {
        if (typeof n === 'string') { if (n.length >= 20 && n.length <= 4000) ut.push(n); return; }
        if (Array.isArray(n)) return n.forEach(gå);
        if (n && typeof n === 'object') return Object.values(n).forEach(gå);
    };
    try { gå(JSON.parse(value)); } catch { gå(value); }
    return [...new Set(ut)];
}

// Provning: fungerar en token vi hittat i TV-appens lagring? Token tillhör
// TV-klienten, så båda kontexterna provas (WEB och TVHTML5) — 0 videor betyder
// nej, och då loggas aldrig själva token.
async function recommendedWith(token, clientName = 'WEB') {
    const context = { client: { ...CONTEXT.client, ...(clientName === 'WEB' ? {} : { clientName, clientVersion: '7.20260101.10.00' }) } };
    return extractItems(await post('browse', { browseId: 'FEwhat_to_watch' }, token, context));
}

async function recommendedWithAnyClient(token) {
    for (const clientName of ['TVHTML5', 'WEB']) {
        try {
            const items = await recommendedWith(token, clientName);
            if (items.length) return { items, clientName };
        } catch { /* nästa klient */ }
    }
    return { items: [], clientName: null };
}

module.exports = { storedSession, storeSession, search, recommended, recommendedWith, recommendedWithAnyClient, candidatesFrom, subscriptionsFeed, storeToken, storedToken, thumbUrl, API_KEY, CONTEXT };
