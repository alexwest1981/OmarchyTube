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

// Googles sessionskakor (SID, SAPISID, __Secure-*PSID över HTTPS) och YouTubes egen
// markör LOGIN_INFO. LOGIN_INFO saknades i den första listan — och eftersom appen
// frågade med ett domänfilter kunde svaret bli "utloggad" medan kontot fanns, varpå
// dörren städade bort sessionen och krävde QR-koden på nytt varje gång (Alex
// symptom 2026-09-19: "måste logga in varje gång").
const SESSION_COOKIES = /^(SID|SAPISID|__Secure-1PSID|__Secure-3PSID|LOGIN_INFO)$/;

const isSignedIn = (cookies = []) => cookies.some((cookie) => SESSION_COOKIES.test(cookie.name));

// Namnen på de sessionskakor som hittades — till loggen, så svaret går att läsa
// av i stället för att gissas.
const sessionCookieNames = (cookies = []) =>
    cookies.filter((cookie) => SESSION_COOKIES.test(cookie.name)).map((cookie) => cookie.name);

// Googles inloggningsväg. Google svarar en inbäddad webbläsare "This browser or app
// may not be secure" — mätt, tre gånger, på tre olika former av samma väg
// (ServiceLogin, v3/signin och OAuth).
//
// Fångsten är därför vid igen: ALLT under accounts.google.com och YouTubes egen
// /signin. Att smalna av den efter vägens utseende var ett misstag — OAuth-varianten
// gick rakt igenom och visade Googles felsida i appens fönster (mätt 2026-09-19).
//
// Det som hindrar den från att slita sönder TV-appens EGEN inloggning är inte
// mönstret utan grinden i main.js: fångsten gäller bara i skrivbordsläget. I dörren
// äger TV-appen sin inloggning.
const SIGN_IN_WAY = /accounts\.google\.com|youtube\.com\/signin(\?|$)/;

const isBlockedSignIn = (url = '') => SIGN_IN_WAY.test(url);

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

module.exports = { DESKTOP_PAGE, TV_PAGE, isBlockedSignIn, isSignedIn, pageForMode, planForSession, sessionCookieNames, signInPlan };
