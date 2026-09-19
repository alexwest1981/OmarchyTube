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
    net: { fetch: async (url, options = {}) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => ({ contents: {} }) }; } },
    session: { fromPartition: () => ({}) },
};
const original = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? fakeElectron : original.call(Module, request, ...rest));
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
