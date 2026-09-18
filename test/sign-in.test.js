const test = require('node:test');
const assert = require('node:assert');

const { DESKTOP_PAGE, TV_PAGE, isGoogleSignIn, isSignedIn, planForSession, signInPlan } = require('../src/sign-in');

const session = [{ name: 'SID', value: 'x' }];

test('en utloggad profil öppnar sin vanliga sida, inte TV-läget', () => {
    // TV-läget är en dörr, inte en spelare: dess 10-fotslayout lyder inte zoom och
    // ser grotesk ut i ett normalt fönster (mätt: två gigantiska brickor vid 941 px).
    assert.deepStrictEqual(planForSession([], 'desktop'), { mode: 'desktop', url: DESKTOP_PAGE, signedIn: false, signIn: false });
    assert.deepStrictEqual(planForSession([], 'tv'), { mode: 'tv', url: TV_PAGE, signedIn: false, signIn: true });
});

test('en inloggad profil öppnar lägets sida — och ingen vakt', () => {
    assert.deepStrictEqual(planForSession(session, 'desktop'), { mode: 'desktop', url: DESKTOP_PAGE, signedIn: true, signIn: false });
    assert.deepStrictEqual(planForSession(session, 'tv'), { mode: 'tv', url: TV_PAGE, signedIn: true, signIn: false });
});

test('bara Googles egna sessionskakor räknas', () => {
    assert.strictEqual(isSignedIn(session), true);
    assert.strictEqual(isSignedIn([{ name: 'PREF' }, { name: 'VISITOR_INFO1_LIVE' }]), false);
    assert.strictEqual(isSignedIn([]), false);
    assert.strictEqual(isSignedIn(), false);
});

test('Googles inloggningsväg känns igen, i både popup och navigering', () => {
    assert.strictEqual(isGoogleSignIn('https://accounts.google.com/ServiceLogin?continue=…'), true);
    assert.strictEqual(isGoogleSignIn('https://www.youtube.com/signin?action_handle_signin=true'), true);
    assert.strictEqual(isGoogleSignIn('https://www.youtube.com/watch?v=abc'), false);
    assert.strictEqual(isGoogleSignIn(''), false);
});

test('dörren är alltid TV-läget med vakten på', () => {
    assert.deepStrictEqual(signInPlan(), { mode: 'tv', url: TV_PAGE, signedIn: false, signIn: true });
});
