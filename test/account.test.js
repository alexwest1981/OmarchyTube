// Kontots känsliga punkter: vilka kakor som betyder "inloggad", att dörren
// städar ingenting, och — dyrast lärd 2026-09-19 — att dörrfönstret FAKTISKT
// skapas med rutnätets partition och TV-identiteten. En regex i källkoden såg
// rätt ut medan fönstret saknade partitionen; därför mäts fönstrets egna
// argument här.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const SRC = path.join(__dirname, '..', 'src');

const skapade = [];
const kakor = { lista: [{ name: 'LOGIN_INFO' }, { name: 'PREF' }] };

const session = {
    cookies: { get: async () => kakor.lista },
    setUserAgent() {},
    flushStorageData: async () => {},
};

class AttrappFonster {
    constructor(options) {
        this.options = options;
        this.handlers = {};
        this.closed = false;
        this.webContents = {
            session,
            on() {},
            getTitle: () => '',
            getURL: () => '',
            executeJavaScript: async () => JSON.stringify({ lagring: ['yt.leanback.…'], sessions: [], kakor: ['PREF'], adress: 'https://www.youtube.com/tv#/' }),
        };
        skapade.push(this);
    }
    loadURL(url, options) { this.url = url; this.urlOptions = options; }
    on(event, fn) { this.handlers[event] = fn; }
    close() {
        if (this.closed) return;
        this.closed = true;
        // Ett riktigt fönster säger till när det stängs; attrappen måste göra det
        // också, annars håller dörrens poll-intervall processen vid liv för evigt.
        if (this.handlers.closed) return this.handlers.closed();
        return undefined;
    }
}

const original = Module._load;
Module._load = (request, ...rest) => (request === 'electron'
    ? { BrowserWindow: AttrappFonster, session: { fromPartition: () => session } }
    : original.call(Module, request, ...rest));
const account = require(path.join(SRC, 'account.js'));
Module._load = original;

test('LOGIN_INFO räcker för att känna igen ett konto', () => {
    assert.deepStrictEqual(account.markersIn([{ name: 'LOGIN_INFO' }]), ['LOGIN_INFO']);
});

test('kakor utan kontomarkör ger inget konto', () => {
    assert.deepStrictEqual(account.markersIn([{ name: 'PREF' }, { name: 'VISITOR_INFO1_LIVE' }]), []);
    assert.deepStrictEqual(account.markersIn([]), []);
    assert.deepStrictEqual(account.markersIn(null), []);
});

test('markörerna räknas en gång var och sorteras', () => {
    assert.deepStrictEqual(account.markersIn([{ name: 'SID' }, { name: 'LOGIN_INFO' }, { name: 'SID' }, { name: 'PREF' }]), ['LOGIN_INFO', 'SID']);
});

test('kontot känns igen ur den session dörren använder', async () => {
    const state = await account.accountState(session);
    assert.deepStrictEqual(state, { signedIn: true, markers: ['LOGIN_INFO'], total: 2 });
    kakor.lista = [{ name: 'PREF' }];
    assert.strictEqual((await account.accountState(session)).signedIn, false);
    kakor.lista = [{ name: 'LOGIN_INFO' }, { name: 'PREF' }];
});

test('dörrfönstret skapas med rutnätets partition och TV-identiteten', () => {
    skapade.length = 0;
    const door = account.openDoor({});
    assert.strictEqual(skapade.length, 1, 'dörrfönstret skapades inte');
    assert.strictEqual(skapade[0].options.webPreferences.partition, account.PARTITION,
        'dörren måste dela partition med rutnätet — annars gäller inloggningen ingenting (mätt 2026-09-19)');
    assert.strictEqual(door.url, account.DOOR_URL);
    assert.strictEqual(door.urlOptions.userAgent, account.TV_UA, 'identiteten skall sättas på hämtningen');
    door.close();
});

test('dörren stänger sig på flödesprovet, inte bara på kaknamn', async () => {
    kakor.lista = [{ name: 'PREF' }, { name: 'VISITOR_INFO1_LIVE' }];   // inga kontomarkörer alls
    skapade.length = 0;
    let klart = null;
    const door = account.openDoor({ intervalMs: 5, probe: async () => 33, onSignedIn: (state) => { klart = state; } });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.ok(klart, 'dörren stängde sig inte trots att flödet svarade');
    assert.match(klart.via, /flödet svarade \(33 videor\)/);
    assert.ok(door.closed, 'fönstret skall vara stängt');
    kakor.lista = [{ name: 'LOGIN_INFO' }, { name: 'PREF' }];
});

test('koden plockas ur sidans text, i rätt form', () => {
    assert.strictEqual(account.codeFrom('Skriv in GDM-STY-SDG på yt.be/activate'), 'GDM-STY-SDG');
    assert.strictEqual(account.codeFrom('Koden är GDM-STY, två grupper'), 'GDM-STY');
    assert.strictEqual(account.codeFrom('ingen kod här'), null);
    assert.strictEqual(account.codeFrom(null), null);
});

test('dörrfönstret är osynligt — inget YouTube-fönster får öppnas', () => {
    skapade.length = 0;
    const door = account.openDoor({ intervalMs: 10000 });
    assert.strictEqual(skapade[0].options.show, false, 'inloggningen skall ske i ett osynligt fönster (Alex: "det skall ske I appen")');
    door.close();
});

test('dörren städar ingenting — den bara visar sin kod', () => {
    const door = fs.readFileSync(path.join(SRC, 'account.js'), 'utf8');
    for (const forbidden of ['clearStorageData', 'cookies.remove', 'removeItem', 'deleteDatabase']) {
        assert.ok(!door.includes(forbidden), `${forbidden} får inte finnas i dörren`);
    }
});

test('dörren presenterar TV-identiteten — skrivbordsagenten ger en återvändsgränd', () => {
    assert.match(account.TV_UA, /Web0S|SmartTV|Tizen/);
    assert.match(account.DOOR_URL, /^https:\/\/www\.youtube\.com\/tv$/);
});
