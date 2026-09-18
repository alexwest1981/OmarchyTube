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

// Googles inloggningssida — den Google vägrar visa i en inbäddad webbläsare. Fångar
// både popup-fönstret (window.open) och en vanlig navigering.
const isGoogleSignIn = (url = '') =>
    url.includes('accounts.google.com') || url.includes('youtube.com/signin');

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

module.exports = { DESKTOP_PAGE, TV_PAGE, isGoogleSignIn, isSignedIn, pageForMode, planForSession, signInPlan };
