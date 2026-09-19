// Kontots två känsliga punkter: vilka kakor som betyder "inloggad", och att
// dörren inte städar något.
//
// Mätt 2026-09-19: den gamla kontokontrollen frågade med domänfilter och en
// namnlista utan LOGIN_INFO, och svarade "utloggad" medan kontot fanns.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const SRC = path.join(__dirname, '..', 'src');
const original = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? { BrowserWindow: class {}, session: { fromPartition: () => ({}) } } : original.call(Module, request, ...rest));
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
    const markers = account.markersIn([{ name: 'SID' }, { name: 'LOGIN_INFO' }, { name: 'SID' }, { name: 'PREF' }]);
    assert.deepStrictEqual(markers, ['LOGIN_INFO', 'SID']);
});

test('dörren städar ingenting — den bara visar sin kod', () => {
    const door = fs.readFileSync(path.join(SRC, 'account.js'), 'utf8');
    for (const forbidden of ['clearStorageData', 'cookies.remove', 'removeItem', 'deleteDatabase']) {
        assert.ok(!door.includes(forbidden), `${forbidden} får inte finnas i dörren`);
    }
});

test('dörren presenterar TV-identiteten — skrivbordsagenten ger en återvändsgränd', () => {
    assert.match(account.TV_UA, /Web0S|SmartTV|Tizen/, 'dörren skall använda en TV-agent (mätt 2026-09-19)');
    assert.match(account.DOOR_URL, /^https:\/\/www\.youtube\.com\/tv$/);
});
