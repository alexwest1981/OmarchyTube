// Nyckeln som hämtas ur TV-appens lagring: sparas den rätt, och följer den med
// i anropen? Utan det sista vore hela hämtningen meningslös — en sparad nyckel
// som aldrig skickas ser ut som en inloggning utan att vara det.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'omarchy-token-'));
process.env.XDG_CONFIG_HOME = tmp;

const requests = [];
const fakeElectron = {
    net: {
        fetch: async (url, options = {}) => {
            requests.push({ url, options });
            const status = global.__status || 200;
            return { ok: status === 200, status, json: async () => ({ contents: {} }) };
        },
    },
    session: { fromPartition: () => ({}) },
};
const original = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? fakeElectron : original.call(Module, request, ...rest));
const { extractItems } = require('../src/innertube-extract');
const innertube = require(path.join(__dirname, '..', 'src', 'innertube.js'));
Module._load = original;

test('nyckeln sparas läsbar bara för ägaren', () => {
    innertube.storeToken('hemlig-nyckel-1234567890');
    assert.strictEqual(innertube.storedToken(), 'hemlig-nyckel-1234567890');
    const file = path.join(tmp, 'omarchy-tube', 'session.json');
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
});

test('nyckeln följer med som Bearer — både den givna och den sparade', async () => {
    requests.length = 0;
    await innertube.recommendedWith('prov-nyckel-1234567890');
    assert.strictEqual(requests[0].options.headers.Authorization, 'Bearer prov-nyckel-1234567890');
    await innertube.recommended();
    assert.strictEqual(requests[1].options.headers.Authorization, 'Bearer hemlig-nyckel-1234567890');
});

test('utan nyckel skickas ingen Authorization', async () => {
    fs.unlinkSync(path.join(tmp, 'omarchy-tube', 'session.json'));
    requests.length = 0;
    await innertube.search('test');
    assert.strictEqual(requests[0].options.headers.Authorization, undefined);
});

test('kandidaterna plockas ur ett JSON-värde, inte ur hela blobben', () => {
    const blob = JSON.stringify({ tokens: [{ token: 'ya29.hemlig-1234567890' }], annat: 'kort' });
    const funna = innertube.candidatesFrom(blob);
    assert.ok(funna.includes('ya29.hemlig-1234567890'), `hittade ${JSON.stringify(funna)}`);
    assert.ok(!funna.includes(blob), 'hela blobben skall inte provas');
    assert.deepStrictEqual(innertube.candidatesFrom('kort'), [], 'för korta strängar hoppas över');
    assert.deepStrictEqual(innertube.candidatesFrom('en-lang- strang-1234567890'), ['en-lang- strang-1234567890']);
});

test('TV-sessionen skickas som TV-appen gör, och nyckeln hamnar aldrig i loggen', async () => {
    const token = 'hemlig-tv-nyckel-1234567890';
    innertube.storeSession({
        token,
        visitorId: 'besokare-123',
        clientVersion: '7.20260916.14.00',
        pageLabel: 'youtube.leanback.v4',
        pageCl: '1234567',
        context: { client: { clientName: 'TVHTML5', clientVersion: '7.20260916.14.00', deviceModel: 'SmartTV', gl: 'SE' } },
    });
    const loggat = [];
    const äktaLogg = console.log;
    const äktaFel = console.error;
    console.log = (...a) => loggat.push(a.join(' '));
    console.error = (...a) => loggat.push(a.join(' '));
    const före = requests.length;
    try { await innertube.recommended(); } finally { console.log = äktaLogg; console.error = äktaFel; }

    const skickat = requests[före];
    assert.ok(skickat, 'inget anrop gjordes');
    assert.strictEqual(skickat.options.headers.Authorization, `Bearer ${token}`, 'nyckeln skickades inte som Bearer');
    assert.strictEqual(skickat.options.headers['X-Youtube-Client-Name'], '7', 'TV-klientens namn saknas');
    assert.strictEqual(skickat.options.headers['X-Goog-Visitor-Id'], 'besokare-123', 'besökarens id saknas');
    assert.match(skickat.options.headers['X-Youtube-Client-Version'], /^7\./, 'klientversionen följer inte med');
    const kropp = JSON.parse(skickat.options.body);
    assert.strictEqual(kropp.browseId, 'default', 'TV-klientens eget flöde skall användas');
    assert.strictEqual(kropp.context.client.clientName, 'TVHTML5', 'fel klientkontext');
    const allt = loggat.join('\n');
    assert.ok(!allt.includes(token) && !allt.includes('hemlig'), `NYCKELN LÄCKTE TILL LOGGEN:\n${allt}`);
    assert.ok(allt.includes('rekommenderat'), 'anropet skall ändå synas i loggen');
});

test('ett fångat huvud med "Bearer " blir inte "Bearer Bearer"', async () => {
    const rent = 'eyJhbGciOi-rent-1234567890';
    innertube.storeSession({ token: rent, visitorId: 'v', clientVersion: '7.0', context: { client: { clientName: 'TVHTML5' } } });
    const före = requests.length;
    await innertube.recommended();
    const huvud = requests[före].options.headers.Authorization;
    assert.strictEqual(huvud, `Bearer ${rent}`, `fel huvud: ${huvud.slice(0, 20)}…`);
    assert.ok(!/Bearer\s+Bearer/i.test(huvud), 'prefixet sattes två gånger — det gav 401 hos YouTube');
});

test('TV-flödets poster hittas (id:t ett steg ned, titeln i metadata)', () => {
    const fixtur = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'innertube-tv-feed.json'), 'utf8'));
    const poster = extractItems(fixtur);
    assert.strictEqual(poster.length, 1, `hittade ${poster.length} poster`);
    assert.strictEqual(poster[0].videoId.length, 11, 'fel video-id');
    assert.ok(poster[0].title.length > 5, 'titeln saknas');
});

test('sökningen är kontofri — TV-sessionen gäller bara flödena', async () => {
    innertube.storeSession({ token: 'hemlig-1234567890', visitorId: 'v', clientVersion: '7.0', context: { client: { clientName: 'TVHTML5' } } });
    const före = requests.length;
    await innertube.search('linux');
    const sök = requests[före];
    assert.ok(!sök.options.headers.Authorization, 'sökningen skall inte bära kontots nyckel');
    assert.strictEqual(JSON.parse(sök.options.body).context.client.clientName, 'WEB', 'sökningen skall presentera sig som webbläsare');
    const efter = requests.length;
    await innertube.recommended();
    assert.ok(requests[efter].options.headers.Authorization, 'flödet skall bära nyckeln');
});

test('en avvisad nyckel kastas, så att appen fångar en ny (annars fungerar det bara en timme)', async () => {
    innertube.storeSession({ token: 'utgången-nyckel-1234567890', visitorId: 'v', clientVersion: '7.0', context: { client: { clientName: 'TVHTML5' } } });
    assert.ok(innertube.storedSession(), 'sessionen skulle finnas');
    global.__status = 401;
    try {
        await assert.rejects(() => innertube.recommended(), '401 skall synas som ett fel');
    } finally {
        global.__status = 200;
        console.error = console.error;   // (loggen skall få skriva, vi städar bara statusen)
    }
    assert.strictEqual(innertube.storedSession(), null, 'den utgångna nyckeln ligger kvar — då fastnar appen i tomt flöde');
});
