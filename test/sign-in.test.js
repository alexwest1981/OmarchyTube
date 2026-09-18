// Prov för beslutet "vad skall en profil öppna?".
//
// Det här är den regeln som kostade Alex en kväll: en utloggad profil skickades
// till YouTubes skrivbordssida, där Google svarar en inbäddad webbläsare med
// "This browser or app may not be secure". Provet pinnar att den vägen inte
// används igen.
const test = require('node:test');
const assert = require('node:assert');

const { SIGN_IN_PAGE, isSignedIn, planForSession } = require('../src/sign-in');

const cookie = (name) => ({ name, domain: '.youtube.com' });

test('sessionskakorna räknas, andra inte', () => {
    assert.strictEqual(isSignedIn([cookie('SID')]), true);
    assert.strictEqual(isSignedIn([cookie('SAPISID')]), true);
    assert.strictEqual(isSignedIn([cookie('__Secure-1PSID')]), true);
    assert.strictEqual(isSignedIn([cookie('PREF'), cookie('VISITOR_INFO1_LIVE')]), false);
    assert.strictEqual(isSignedIn([]), false);
    assert.strictEqual(isSignedIn(), false);
});

test('inloggad profil öppnar YouTube i det läge användaren lämnade', () => {
    const desktop = planForSession([cookie('SID')], 'desktop');
    assert.deepStrictEqual(desktop, { mode: 'desktop', url: 'https://www.youtube.com', autoSignIn: false });

    const tv = planForSession([cookie('SID')], 'tv');
    assert.deepStrictEqual(tv, { mode: 'tv', url: 'https://www.youtube.com/tv', autoSignIn: false });
});

test('utloggad profil går till TV-lägets QR-väg, oavsett sparat läge', () => {
    for (const mode of ['desktop', 'tv', undefined, 'något-annat']) {
        const plan = planForSession([cookie('VISITOR_INFO1_LIVE')], mode);
        assert.deepStrictEqual(plan, { mode: 'tv', url: SIGN_IN_PAGE, autoSignIn: true });
    }
});

test('QR-vägen pekar aldrig på skrivbordssidan som gav Googles avslag', () => {
    assert.strictEqual(SIGN_IN_PAGE, 'https://www.youtube.com/tv');
    assert.ok(!SIGN_IN_PAGE.endsWith('.com/'));
});
