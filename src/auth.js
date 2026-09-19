// Inloggningen: Googles device-flöde — samma kod-flöde som TV-appens QR —
// med DIN egen OAuth-klient. Ingen webbläsare, inga kakor, ingen loop.
//
// Mätt 2026-09-19: Googles egna TV-klienter svarar restricted_client /
// invalid_client, så klienten måste vara din egen: skapa en OAuth-klient av
// typen "TVs and limited-input devices" i Google Cloud-konsolen (två minuter,
// en gång), klistra in id:t här. Sedan äger appen sin refresh-token.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { net } = require('electron');

const DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'omarchy-tube');
const CLIENT_FILE = path.join(DIR, 'oauth.json');
const TOKEN_FILE = path.join(DIR, 'token.json');
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const DEVICE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function writeJson(file, value) {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
}

const client = () => readJson(CLIENT_FILE);
const token = () => readJson(TOKEN_FILE);
const signedIn = () => Boolean(token() && token().refresh_token);
const hasClient = () => Boolean(client() && client().client_id);

function setClient(clientId, clientSecret) {
    writeJson(CLIENT_FILE, { client_id: String(clientId).trim(), client_secret: String(clientSecret).trim() });
}

function forget() { try { fs.unlinkSync(TOKEN_FILE); } catch { /* inget att glömma */ } }

async function form(url, params) {
    const res = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
}

// Steg 1: be Google om en kod att visa. Ingen hemlighet behövs här.
async function start() {
    const c = client();
    if (!c || !c.client_id) throw new Error('ingen OAuth-klient sparad');
    const r = await form(DEVICE_URL, { client_id: c.client_id, scope: SCOPE });
    if (!r.ok) throw new Error(`Google svarade ${r.status}: ${r.body.error || JSON.stringify(r.body).slice(0, 120)}`);
    console.log(`[OmarchyTube] inloggning: kod ${r.body.user_code} → ${r.body.verification_url}`);
    return { userCode: r.body.user_code, url: r.body.verification_url, deviceCode: r.body.device_code, interval: r.body.interval || 5 };
}

// Steg 2: fråga en gång om användaren hunnit bekräfta. Renderaren upprepar.
// authorization_pending är inte ett fel, det är "inte än".
async function pollOnce(deviceCode) {
    const c = client();
    const r = await form(TOKEN_URL, {
        client_id: c.client_id,
        client_secret: c.client_secret,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (r.ok) {
        writeJson(TOKEN_FILE, {
            refresh_token: r.body.refresh_token,
            access_token: r.body.access_token,
            expires_at: Date.now() + (r.body.expires_in || 3600) * 1000,
        });
        console.log('[OmarchyTube] inloggad — refresh-token sparad, giltig tills den återkallas');
        return { state: 'klar' };
    }
    if (r.body.error === 'authorization_pending') return { state: 'väntar' };
    if (r.body.error === 'slow_down') return { state: 'väntar', slower: true };
    if (r.body.error === 'access_denied') return { state: 'nekad' };
    if (r.body.error === 'expired_token') return { state: 'utgången' };
    return { state: 'fel', message: r.body.error_description || r.body.error || String(r.status) };
}

// En färsk access-token, förnyad när den gått ut. Refresh-token rör sig aldrig.
async function accessToken() {
    const t = token();
    if (!t || !t.refresh_token) throw new Error('inte inloggad');
    if (t.access_token && t.expires_at && Date.now() < t.expires_at - 60_000) return t.access_token;
    const c = client();
    const r = await form(TOKEN_URL, { client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' });
    if (!r.ok) throw new Error(`kunde inte förnya token (${r.status}): ${r.body.error || ''}`);
    writeJson(TOKEN_FILE, { refresh_token: t.refresh_token, access_token: r.body.access_token, expires_at: Date.now() + (r.body.expires_in || 3600) * 1000 });
    return r.body.access_token;
}

module.exports = { DIR, signedIn, hasClient, setClient, forget, start, pollOnce, accessToken, SCOPE };
