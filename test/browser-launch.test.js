// Prov för hur en profil öppnas i webbläsaren.
//
// Mätt skäl: varje profil måste få sin egen --user-data-dir, annars delar två
// tittare Google-session och då är hela "Vem skall titta?"-idén borta.
const test = require('node:test');
const assert = require('node:assert');

const { DESKTOP_PAGE, TV_PAGE, browserArgs, browserCommand, browserDir } = require('../src/browser-launch');

const profile = { id: 'alex', name: 'Alex' };

test('adressen följer läget', () => {
    assert.strictEqual(browserCommand('/data', profile, 'desktop').url, DESKTOP_PAGE);
    assert.strictEqual(browserCommand('/data', profile, 'tv').url, TV_PAGE);
    assert.strictEqual(browserCommand('/data', profile, 'något-annat').url, DESKTOP_PAGE);
});

test('varje profil får sin egen katalog', () => {
    const alex = browserDir('/data', 'alex');
    const annan = browserDir('/data', 'någon-annan');
    assert.notStrictEqual(alex, annan);
    assert.match(alex, /profiles\/alex\/browser$/);
    assert.strictEqual(browserDir('/data', 'alex'), alex, 'samma profil skall få samma katalog');
});

test('kommandot bär katalogen, tyst start och adressen', () => {
    const { command, args, dir, url } = browserCommand('/data', profile, 'desktop', 'brave');
    assert.strictEqual(command, 'brave');
    assert.deepStrictEqual(args, [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', url]);
    assert.ok(args.includes(url), 'adressen saknas');
    assert.match(args[0], /^--user-data-dir=/);
});

test('annan webbläsare går att välja', () => {
    assert.strictEqual(browserCommand('/data', profile, 'tv', 'chromium').command, 'chromium');
});
