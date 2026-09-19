// Vad en profil skall öppna — och varför det avgörs här.
//
// MÄTT 2026-09-18, två gånger: att skicka en utloggad profil till YouTubes
// e-postformulär får Google att svara en inbäddad webbläsare med "Couldn't sign
// you in — This browser or app may not be secure". Den vägen är stängd.
//
// TV-appens device-flöde är den väg Google öppnar: mätt mot youtube.com/tv med
// TV-agenten är första valet "Get started", och ett Enter ger "Sign in with your
// phone — Scan QR code or go to yt.be/activate — Enter the code GDM-STY-SDG".
//
// Men TV-läget är en dörr, inte en spelare: dess 10-fotslayout är byggd i rem mot
// fönsterbredden, så den blir varken tätare eller mindre av zoom, och i en ruta
// under ~1500 px visar den två gigantiska brickor (mätt: 941 px). Därför öppnar en
// utloggad profil sin vanliga sida — den ser ut som YouTube och lyder zoom — och
// appen byter till TV-dörren först när Google-inloggningen faktiskt försöks.
//
// Ingen electron-import: det här är beslutet, och `npm test` skall kunna mäta det
// utan fönster.
const TV_PAGE = 'https://www.youtube.com/tv';
const DESKTOP_PAGE = 'https://www.youtube.com';

// SID/SAPISID är Googles riktiga sessionskakor; __Secure-* är samma sak över HTTPS.
const SESSION_COOKIES = /^(SID|SAPISID|__Secure-1PSID|__Secure-3PSID)$/;

const isSignedIn = (cookies = []) => cookies.some((cookie) => SESSION_COOKIES.test(cookie.name));

// DEN BLOCKERADE vägen — och bara den. Google svarar "This browser or app may not be
// secure" på lösenordsformuläret i en inbäddad webbläsare, och det är den sidan vi
// fångar: ServiceLogin, signin/v2, kontoväljaren (som leder vidare dit), och
// YouTubes egen /signin.
//
// Allt annat måste få passera. Mätt 2026-09-19: TV-appens EGEN inloggning går via
// Google, och en fångst som tog allt under accounts.google.com slet sidan, laddade
// om dörren och släppte användaren tillbaka i TV-flödet — mitt i inloggningen, utan
// att ha fått fylla i något.
const BLOCKED_SIGN_IN = [
    /accounts\.google\.com\/(ServiceLogin|signin\/v2|v3\/signin|AccountChooser)/,
    /accounts\.google\.com\/embedded/,
    /youtube\.com\/signin(\?|$)/
];

const isBlockedSignIn = (url = '') => BLOCKED_SIGN_IN.some((pattern) => pattern.test(url));

const pageForMode = (mode) => (mode === 'tv' ? TV_PAGE : DESKTOP_PAGE);

// mode: läget fönstret skall stå i. url: sidan som skall laddas.
// signIn: sant när sidan ÄR inloggningsdörren, alltså när appen skall vakta
// sessionskakan och gå tillbaka till användarens läge så fort kontot finns.
function planForSession(cookies, currentMode) {
    const mode = currentMode === 'tv' ? 'tv' : 'desktop';
    const signedIn = isSignedIn(cookies);
    return { mode, url: pageForMode(mode), signedIn, signIn: !signedIn && mode === 'tv' };
}

// Dörren: samma svar varje gång Google-inloggningen försöks.
const signInPlan = () => ({ mode: 'tv', url: TV_PAGE, signedIn: false, signIn: true });

module.exports = { DESKTOP_PAGE, TV_PAGE, isBlockedSignIn, isSignedIn, pageForMode, planForSession, signInPlan };
