// Låser den nya arkitekturen: vår app, YouTubes data, användarens konto.
//
// Proverna biter på det som faktiskt gick sönder: appen skall inte kunna radera
// en session (det var hela inloggningsloopen), inte ladda en YouTube-sida i
// rutnätet, inte kräva att användaren bygger en egen OAuth-app, och spelaren
// skall ha den formatväljare som är mätt fungerande.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
const files = () => fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
const all = () => files().map(read).join('\n');

test('appen raderar aldrig sessionsdata — det var inloggningsloopen', () => {
    const src = all();
    for (const forbidden of ['clearStorageData', 'cookies.remove', 'cookies.set', 'storageData.remove']) {
        assert.ok(!src.includes(forbidden), `${forbidden} får inte finnas i src/`);
    }
});

// Mätt 2026-09-20: appen satte aldrig userData, så partitionen hamnade i
// Electrons standardkatalog — tre olika TV-tillstånd låg på disk samtidigt
// (~/.config/Electron, ~/.config/OmarchyTube, ~/.config/omarchy-tube) och
// inloggningen tappades varje gång appens namn eller startväg ändrades.
// Det är den buggen det här provet fångar.
test('appens session har ett eget hem, och partitionen är den inloggade', () => {
    assert.match(read('main.js'), /app\.setPath\('userData'/, 'main.js måste sätta userData');
    assert.match(read('account.js'), /const PARTITION = 'persist:omarchy-tube';/, 'partitionen skall vara den inloggade');
    assert.match(read('main.js'), /requestSingleInstanceLock/, 'två instanser delar partition och skriver över varandra');
});

test('sessionen skrivs till disk, annars börjar nästa start om', () => {
    assert.match(read('account.js'), /flushStorageData/, 'dörren skall skriva sessionen till disk när kontot syns');
    assert.match(read('main.js'), /flushStorageData/, 'appen skall skriva sessionen till disk innan den avslutas');
});

test('bara dörren laddar en YouTube-adress, och bara TV-appens sida', () => {
    const loaded = [...all().matchAll(/loadURL\(([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    assert.deepStrictEqual(loaded, ['DOOR_URL'], `bara dörrens adress får laddas, hittade: ${loaded.join(', ')}`);
    assert.match(read('account.js'), /youtube\.com\/tv/, 'dörren skall vara TV-appens sida');
});

test('ingen injektion — enda undantaget är att läsa dörrens egen lagring', () => {
    assert.ok(!all().includes('insertCSS'), 'insertCSS får inte finnas i src/');
    for (const file of files()) {
        if (file === 'account.js') continue;   // dörren får läsa sin egen sida
        assert.ok(!read(file).includes('executeJavaScript'), `executeJavaScript får inte finnas i ${file}`);
    }
    const door = read('account.js');
    assert.ok(!/executeJavaScript\([^)]*[`'"][^`'"]*\b(set|remove|clear|post|send)\b/i.test(door), 'dörren får bara LÄSA sin sida, inte ändra den');
});

test('kontomarkörerna innehåller LOGIN_INFO — den som saknades', () => {
    assert.match(read('account.js'), /'LOGIN_INFO'/, 'LOGIN_INFO är YouTubes egen kontomarkör');
});

test('ingen webbläsare startas — mpv är den enda externa processen', () => {
    const spawned = [...all().matchAll(/spawn\(\s*['"]([^']+)['"]/g)].map((m) => m[1]);
    assert.deepStrictEqual([...new Set(spawned)], ['mpv'], `bara mpv får startas, hittade: ${spawned.join(', ')}`);
});

test('användaren skall inte behöva bygga en egen OAuth-app', () => {
    const src = all();
    for (const gone of ['apps.googleusercontent.com', 'client_secret', 'GOCSPX']) {
        assert.ok(!src.includes(gone), `${gone} hörde till klientspåret som riven`);
    }
});

test('spelaren har formatväljaren som är mätt fungerande', () => {
    const { FORMAT } = require(path.join(SRC, 'player.js'));
    assert.strictEqual(FORMAT, 'bv*+ba/b');
});

test('rutnätet hämtar 1280x720, inte träfflistans 720x404', () => {
    const src = read('browse.js');
    assert.match(src, /hq720/);
    assert.ok(!/img\.src = item\.thumbnail;\n/.test(src), 'träfflistans bild får bara vara reserv');
});

test('video-id valideras innan det når mpv', () => {
    assert.match(read('main.js'), /\^\[\\w-\]\{11\}\$/);
});

test('allting sker i appen — ingen extern webbläsare någonstans', () => {
    const src = all();
    for (const forbidden of ['xdg-open', 'browser-launch', 'shell.openExternal']) {
        assert.ok(!src.includes(forbidden), `${forbidden} får inte finnas i src/`);
    }
});
