// Låser den nya arkitekturen: vår app, YouTubes data.
//
// Proverna är skrivna för att bita på det som faktiskt gick sönder: appen skall
// inte kunna röra en session, inte ladda en YouTube-sida, inte injicera något i
// en sida den inte äger, och spelaren skall ha den formatväljare som är mätt
// fungerande. Allt annat får ändras fritt.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const files = () => fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(SRC, f), 'utf8')]);
const all = () => files().map(([, src]) => src).join('\n');

test('appen rör aldrig en session — ingen kakburk, ingen lagring', () => {
    const src = all();
    for (const forbidden of ['clearStorageData', 'cookies.remove', 'cookies.set', 'flushStorageData']) {
        assert.ok(!src.includes(forbidden), `${forbidden} får inte finnas i src/`);
    }
});

test('ingen YouTube-sida laddas och inget injiceras', () => {
    const src = all();
    for (const forbidden of ['loadURL', 'insertCSS', 'executeJavaScript', 'setUserAgent', 'setZoomFactor']) {
        assert.ok(!src.includes(forbidden), `${forbidden} får inte finnas i src/`);
    }
});

test('ingen webbläsare startas — mpv är den enda externa processen', () => {
    const spawned = [...all().matchAll(/spawn\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(spawned)], ['mpv'], `bara mpv får startas, hittade: ${spawned.join(', ')}`);
});

test('spelaren har formatväljaren som är mätt fungerande', () => {
    // Utan den: HTTP 403 på videoströmmen (mätt 2026-09-19). Konstanten mäts,
    // inte strängen i filen — annars vore provet teater.
    const { FORMAT } = require(path.join(SRC, 'player.js'));
    assert.strictEqual(FORMAT, 'bv*+ba/b');
});

test('rutnätet hämtar 1280x720, inte träfflistans 720x404', () => {
    const src = fs.readFileSync(path.join(SRC, 'browse.js'), 'utf8');
    assert.match(src, /hq720/, 'browse.js skall bygga hq720-URL:er');
    assert.ok(!/img\.src = item\.thumbnail;\n/.test(src), 'träfflistans bild får bara vara reserv');
});

test('video-id valideras innan det når mpv', () => {
    assert.match(fs.readFileSync(path.join(SRC, 'main.js'), 'utf8'), /\^\[\\w-\]\{11\}\$/);
});

test('appen har ingen inloggning att hamna i en loop i', () => {
    const src = all();
    for (const forbidden of ['sign-in', 'SignIn', 'LOGIN_INFO', 'SAPISID']) {
        assert.ok(!src.includes(forbidden), `${forbidden} hör till den rivna arkitekturen`);
    }
});
