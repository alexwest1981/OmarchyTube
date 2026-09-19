const test = require('node:test');
const assert = require('node:assert');

const { DESKTOP_PAGE, TV_PAGE, isBlockedSignIn, isSignedIn, planForSession, signInPlan } = require('../src/sign-in');

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

test('bara den BLOCKERADE lösenordsvägen fångas', () => {
    assert.strictEqual(isBlockedSignIn('https://accounts.google.com/ServiceLogin?service=youtube'), true);
    assert.strictEqual(isBlockedSignIn('https://accounts.google.com/signin/v2/identifier?flowName=…'), true);
    assert.strictEqual(isBlockedSignIn('https://accounts.google.com/AccountChooser?continue=…'), true);
    assert.strictEqual(isBlockedSignIn('https://www.youtube.com/signin?action_handle_signin=true'), true);
});

test('allt annat får passera — särskilt Google-vägar som inte är lösenordsformuläret', () => {
    // Fångade vi dessa slets TV-appens egen inloggning mitt i (mätt 2026-09-19).
    assert.strictEqual(isBlockedSignIn('https://accounts.google.com/o/oauth2/auth?client_id=…'), false);
    assert.strictEqual(isBlockedSignIn('https://accounts.google.com/device'), false);
    assert.strictEqual(isBlockedSignIn('https://www.youtube.com/tv'), false);
    assert.strictEqual(isBlockedSignIn('https://www.youtube.com/activate?user_code=GDM-STY-SDG'), false);
    assert.strictEqual(isBlockedSignIn('https://www.youtube.com/watch?v=abc'), false);
    assert.strictEqual(isBlockedSignIn(''), false);
});

test('dörren är alltid TV-läget med vakten på', () => {
    assert.deepStrictEqual(signInPlan(), { mode: 'tv', url: TV_PAGE, signedIn: false, signIn: true });
});
