// Inloggningens logik: kodflödet, tokenförvaringen och förnyelsen.
//
// Electron byts mot en attrapp (samma grepp som i wiring.test.js) och nätet mot
// en stubbe, så provet mäter vad appen SKICKAR och vad den SPARAR — inte att
// Google svarar. Det som fick sin egen kontroll: att förnyelsen bara sker när
// token gått ut, och att refresh-token aldrig skrivs över av ett nytt värde.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omarchy-auth-'));
process.env.XDG_CONFIG_HOME = tmp;

const requests = [];
let answer = { ok: true, status: 200, body: {} };
const fakeElectron = {
    net: {
        fetch: async (url, options = {}) => {
            requests.push({ url, body: options.body ? Object.fromEntries(new URLSearchParams(options.body)) : null });
            return { ok: answer.ok, status: answer.status, json: async () => answer.body };
        },
    },
};
const original = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? fakeElectron : original.call(Module, request, ...rest));
const auth = require(path.join(__dirname, '..', 'src', 'auth.js'));
const dataapi = require(path.join(__dirname, '..', 'src', 'dataapi.js'));
Module._load = original;

test('klienten sparas och läses tillbaka, i en fil bara ägaren kan läsa', () => {
    auth.setClient('  123-abc.apps.googleusercontent.com ', ' GOCSPX-hemlig ');
    assert.ok(auth.hasClient());
    const stored = JSON.parse(fs.readFileSync(path.join(auth.DIR, 'oauth.json'), 'utf8'));
    assert.strictEqual(stored.client_id, '123-abc.apps.googleusercontent.com', 'id:t skall trimmas');
    assert.strictEqual(stored.client_secret, 'GOCSPX-hemlig');
    assert.strictEqual(fs.statSync(path.join(auth.DIR, 'oauth.json')).mode & 0o777, 0o600);
});

test('utan inloggning finns ingen token att hämta', async () => {
    await assert.rejects(() => auth.accessToken(), /inte inloggad/);
});

test('kodbegäran innehåller klient-id och läsbehörigheten — inget annat', async () => {
    requests.length = 0;
    answer = { ok: true, status: 200, body: { user_code: 'ABCD-1234', verification_url: 'https://www.google.com/device', device_code: 'dev-1', interval: 5, expires_in: 1800 } };
    const started = await auth.start();
    assert.strictEqual(started.userCode, 'ABCD-1234');
    assert.strictEqual(requests.length, 1);
    assert.match(requests[0].url, /oauth2\.googleapis\.com\/device\/code$/);
    assert.deepStrictEqual(requests[0].body, { client_id: '123-abc.apps.googleusercontent.com', scope: 'https://www.googleapis.com/auth/youtube.readonly' });
});

test('väntar är inte ett fel, och klart sparar token', async () => {
    answer = { ok: false, status: 428, body: { error: 'authorization_pending' } };
    assert.deepStrictEqual(await auth.pollOnce('dev-1'), { state: 'väntar' });
    assert.ok(!auth.signedIn(), 'ingen token skall ha sparats än');

    requests.length = 0;
    answer = { ok: true, status: 200, body: { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 } };
    assert.deepStrictEqual(await auth.pollOnce('dev-1'), { state: 'klar' });
    assert.ok(auth.signedIn());
    assert.strictEqual(requests[0].body.grant_type, 'urn:ietf:params:oauth:grant-type:device_code');
    assert.strictEqual(fs.statSync(path.join(auth.DIR, 'token.json')).mode & 0o777, 0o600);
});

test('färsk token används utan att fråga Google, utgången förnyas', async () => {
    requests.length = 0;
    assert.strictEqual(await auth.accessToken(), 'at-1');
    assert.strictEqual(requests.length, 0, 'en giltig token skall inte förnyas i onödan');

    const file = path.join(auth.DIR, 'token.json');
    fs.writeFileSync(file, JSON.stringify({ refresh_token: 'rt-1', access_token: 'at-gammal', expires_at: Date.now() - 1000 }));
    answer = { ok: true, status: 200, body: { access_token: 'at-ny', expires_in: 3600 } };
    assert.strictEqual(await auth.accessToken(), 'at-ny');
    assert.strictEqual(requests[0].body.grant_type, 'refresh_token');
    assert.strictEqual(requests[0].body.refresh_token, 'rt-1');
    assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).refresh_token, 'rt-1', 'refresh-token skall bevaras');
});

test('utloggning tar bort token men behåller klienten', () => {
    auth.forget();
    assert.ok(!auth.signedIn());
    assert.ok(auth.hasClient(), 'klienten skall inte behöva klistras in igen');
});

test('varaktigheter räknas om rätt (PT1H2M3S -> 1:02:03)', () => {
    assert.strictEqual(dataapi.isoDuration('PT1H2M3S'), '1:02:03');
    assert.strictEqual(dataapi.isoDuration('PT45S'), '0:45');
    assert.strictEqual(dataapi.isoDuration('PT2M'), '2:00');
    assert.strictEqual(dataapi.isoDuration('P1DT2H'), '26:00:00');
    assert.strictEqual(dataapi.isoDuration(''), '');
});

test('rutnätets form byggs ur YouTubes svar', () => {
    const item = dataapi.itemOf({ resourceId: { videoId: 'abc12345678' }, title: 'Titel', videoOwnerChannelTitle: 'Kanal' }, '1:02:03');
    assert.deepStrictEqual(item, {
        videoId: 'abc12345678',
        title: 'Titel',
        channel: 'Kanal',
        duration: '1:02:03',
        thumbnail: 'https://i.ytimg.com/vi/abc12345678/hq720.jpg',
    });
});
