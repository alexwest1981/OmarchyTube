// YouTube's own data, without its pages.
//
// The grid is ours; the data is YouTube's. These calls run in the main process,
// where there is no CORS to satisfy: they go through Electron's net stack in the
// chosen profile's session, so that account's cookies travel with them — that is
// what makes the home feed personal. Search works signed out as well (measured:
// a signed-out search returned 45 items), which is why one call can be made
// before any profile is chosen.
const { net, session } = require('electron');
const { extractItems } = require('./innertube-extract');
// Samma regel som avgör om en profil är inloggad (src/sign-in.js) — en sanning,
// inte två.
const { isSignedIn } = require('./sign-in');

// The public web key youtube.com itself hands to its own pages via ytcfg; it is
// not a secret and not tied to an account.
const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const PARTITION = 'persist:omarchy-tube';
const CONTEXT = {
    client: {
        clientName: 'WEB',
        clientVersion: '2.20260916.00.00',
        hl: 'en',
        gl: 'US',
    },
};

async function post(endpoint, body, partition = PARTITION) {
    const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${API_KEY}&prettyPrint=false`;
    const response = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        session: session.fromPartition(partition),
        body: JSON.stringify({ context: CONTEXT, ...body }),
    });
    if (!response.ok) throw new Error(`${endpoint} answered ${response.status}`);
    return response.json();
}

// partition kommer från fönstret som frågade (main.js håller reda på vilken
// profil varje webContents tillhör). Utan argument blir det appens egen.
// Loggar varje anrop. Utan raden ser en tom ruta likadan ut oavsett om YouTube
// svarade tomt eller inte svarade alls — mätt 2026-09-18, när rutnätet stod på
// "Searching ..." utan att någon kunde se varför.
const home = (partition) => run('home', 'browse', { browseId: 'FEwhat_to_watch' }, partition);
const search = (query, partition) => run(`search "${query}"`, 'search', { query }, partition);

async function run(what, endpoint, body, partition) {
    const where = partition || PARTITION;
    try {
        const items = await post(endpoint, body, partition);
        const result = extractItems(items);
        console.log(`[OmarchyTube] InnerTube ${what}: ${result.length} träffar (${where}, konto: ${await accountLabel(where)})`);
        return result;
    } catch (err) {
        console.error(`[OmarchyTube] InnerTube ${what} misslyckades (${where}, konto: ${await accountLabel(where)}):`, err.message);
        throw err;
    }
}

// "0 träffar" betyder olika saker beroende på om partitionen har ett konto:
// utan konto är det YouTubes riktiga svar, med konto är det vår bugg. Mätt
// 2026-09-18 när Alex rutnät var tomt och ingen kunde se vilket det var.
async function accountLabel(partition) {
    try {
        return isSignedIn(await session.fromPartition(partition).cookies.get({ domain: '.youtube.com' })) ? 'ja' : 'nej';
    } catch (err) {
        return `okänt (${err.message})`;
    }
}

module.exports = { home, search, API_KEY };
