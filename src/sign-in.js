// Vad en profil skall öppna — och varför det avgörs här.
//
// Mätt hos Alex 2026-09-18: att skicka en utloggad profil till YouTubes
// skrivbordssida ger e-postformuläret, och Google svarar en inbäddad webbläsare
// med "Couldn't sign you in — This browser or app may not be secure". Den vägen
// är alltså stängd, hur rätt den än ser ut på papperet.
//
// TV-läget har den väg Google faktiskt öppnar för en TV-app. Mätt samma dag mot
// youtube.com/tv med TV-agenten: första valet är "Get started", och ett Enter
// ger "Sign in with your phone — Scan QR code or go to yt.be/activate — Enter
// the code GDM-STY-SDG". QR-koden och de åtta tecknen, utan e-postfälla.
//
// Ingen electron-import: det här är beslutet, och `npm test` skall kunna mäta
// det utan fönster.
const SIGN_IN_PAGE = 'https://www.youtube.com/tv';
const TV_PAGE = 'https://www.youtube.com/tv';
const DESKTOP_PAGE = 'https://www.youtube.com';

// SID/SAPISID är Googles riktiga sessionskakor; __Secure-* är samma sak över
// HTTPS. Någon av dem räcker för att "kontot finns i den här partitionen".
const SESSION_COOKIES = /^(SID|SAPISID|__Secure-1PSID|__Secure-3PSID)$/;

const isSignedIn = (cookies = []) => cookies.some((cookie) => SESSION_COOKIES.test(cookie.name));

// mode: läget fönstret skall stå i (TV-agenten krävs för QR-vägen).
// url: sidan som skall laddas.
// autoSignIn: om appen själv skall trycka Enter till QR-skärmen.
function planForSession(cookies, currentMode) {
    if (isSignedIn(cookies)) {
        const mode = currentMode === 'tv' ? 'tv' : 'desktop';
        return { mode, url: mode === 'tv' ? TV_PAGE : DESKTOP_PAGE, autoSignIn: false };
    }
    return { mode: 'tv', url: SIGN_IN_PAGE, autoSignIn: true };
}

module.exports = { SIGN_IN_PAGE, isSignedIn, planForSession };
