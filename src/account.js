// Kontot: en dörr, en session, inga kakor att flytta.
//
// Mätt 2026-09-19: Google blockerar inbäddad LÖSENORDSinloggning i en
// app-webbläsare ("This browser or app may not be secure"), men deras eget
// device-flöde — TV-appens QR-kod — är öppet (Alex loggade in med den i kväll).
// Därför är inloggningen ett fönster som visar YouTubes egen kod: du bekräftar
// på mobilen, och sessionen stannar i appens partition. Ingen konsol, ingen
// egen OAuth-app, inga kakor att exportera.
//
// Dörren får inte städa något. Förra gången raderade den partitionens kakor och
// lokala lagring "för att visa inloggningsrutan" — vilket raderade exakt den
// session TV-appen just skapat, och gjorde att varje inloggning började om.
const { BrowserWindow, session } = require('electron');

const PARTITION = 'persist:omarchy-tube-own';
const TV_UA = 'Mozilla/5.0 (Web0S; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const DOOR_URL = 'https://www.youtube.com/tv';

// Namnen som betyder "ett konto finns". LOGIN_INFO är YouTubes egen markör och
// saknades i den gamla listan — därför kunde appen svara "utloggad" medan
// kontot fanns (mätt 2026-09-19).
const MARKERS = ['LOGIN_INFO', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID', 'SID'];

const partition = () => session.fromPartition(PARTITION);

// Vilka kontomarkörer finns i en kaka-lista? Ren funktion, så provet kan mäta
// den utan Electron.
const markersIn = (cookies) => [...new Set((cookies || []).map((c) => c.name).filter((name) => MARKERS.includes(name)))].sort();

// Frågar ALLA kakor, utan domänfilter: filtret var det som gömde kontot.
async function accountState() {
    const markers = markersIn(await partition().cookies.get({}));
    return { signedIn: markers.length > 0, markers };
}

// Dörren: ett fönster med TV-appen, som visar sin kod och inget annat.
// onSignedIn kallas när kontot syns i partitionen; fönstret stängs då.
function openDoor({ onSignedIn, onClosed } = {}) {
    partition().setUserAgent(TV_UA);   // mätt: med skrivbordsagenten svarar YouTube med en återvändsgränd
    const door = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0b0b0d',
        autoHideMenuBar: true,
        title: 'Logga in på YouTube',
        // Dörren MÅSTE bo i appens partition: annars hamnar sessionen i en annan
        // burk än rutnätet läser, och inloggningen gäller ingenting (mätt
        // 2026-09-19 — dörren visade YouTubes skrivbordssida i stället för
        // TV-appens kod, och kontot syntes aldrig).
    });
    // Identiteten sätts på själva hämtningen: med skrivbordsagenten svarar
    // YouTube med sin grå omdirigering till youtube.com (mätt 2026-09-19).
    door.loadURL(DOOR_URL, { userAgent: TV_UA });
    console.log(`[OmarchyTube] inloggningsfönstret öppnat: ${DOOR_URL} (skanna koden med telefonen)`);

    const timer = setInterval(async () => {
        const state = await accountState();
        if (state.signedIn) {
            clearInterval(timer);
            console.log(`[OmarchyTube] inloggad — kontot syns i partitionen (${state.markers.join(', ')})`);
            await partition().flushStorageData();   // skriv sessionen till disk innan fönstret stängs
            door.close();
            if (onSignedIn) onSignedIn(state);
        }
    }, 2000);

    door.on('closed', () => {
        clearInterval(timer);
        if (onClosed) onClosed();
    });
    return door;
}

module.exports = { PARTITION, TV_UA, DOOR_URL, MARKERS, markersIn, accountState, openDoor, partition };
