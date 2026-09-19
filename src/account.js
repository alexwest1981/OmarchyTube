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
// Sessionen kan ges in (dörren frågar sin egen, så avkänningen aldrig kan läsa
// en annan burk än den som loggar in).
async function accountState(from) {
    const ses = from || partition();
    const all = await ses.cookies.get({});
    const markers = markersIn(all);
    return { signedIn: markers.length > 0, markers, total: all.length };
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
        webPreferences: { partition: PARTITION },
    });
    // Identiteten sätts på själva hämtningen: med skrivbordsagenten svarar
    // YouTube med sin grå omdirigering till youtube.com (mätt 2026-09-19).
    door.loadURL(DOOR_URL, { userAgent: TV_UA });
    // Dörren skall läsa sin EGEN session, och den skall vara rutnätets. Electron
    // returnerar samma sessionsobjekt för samma partitionsnamn, så en jämförelse
    // avgör saken direkt — i stället för att upptäckas först när kontot uteblir.
    const samma = door.webContents.session === partition();
    console.log(`[OmarchyTube] dörrens session är rutnätets: ${samma ? 'ja' : 'NEJ — inloggningen skulle hamna i fel burk'}`);
    const doorSession = door.webContents.session;
    console.log(`[OmarchyTube] inloggningsfönstret öppnat: ${DOOR_URL} (skanna koden med telefonen)`);
    // Inventeringen: om något inte stämmer svarar nästa loggrad på var sessionen
    // bor, i stället för att kräva ännu en mätning (samma regel som för kakorna).
    partition().cookies.get({}).then((all) => {
        console.log(`[OmarchyTube] partitionen har ${all.length} kakor innan inloggning: ${[...new Set(all.map((c) => c.name))].sort().join(', ') || '(inga)'}`);
    }).catch((err) => console.error('[OmarchyTube] kunde inte läsa partitionen:', err.message));

    const timer = setInterval(async () => {
        const state = await accountState(doorSession);
        if (state.signedIn) {
            clearInterval(timer);
            console.log(`[OmarchyTube] inloggad — kontot syns i partitionen (${state.markers.join(', ')})`);
            await partition().flushStorageData();   // skriv sessionen till disk innan fönstret stängs
            door.close();
            if (onSignedIn) onSignedIn(state);
        }
    }, 2000);

    door.on('closed', async () => {
        clearInterval(timer);
        // Stängde du fönstret själv? Kontrollera en gång till, så en inloggning
        // som hann klart precis då inte tappas.
        const state = await accountState(doorSession).catch(() => ({ signedIn: false }));
        if (state.signedIn) {
            console.log(`[OmarchyTube] kontot hittades när fönstret stängdes (${state.markers.join(', ')})`);
            await partition().flushStorageData()
                .catch((err) => console.error('[OmarchyTube] kunde inte skriva sessionen:', err.message));
            if (onSignedIn) onSignedIn(state);
        }
        if (onClosed) onClosed();
    });
    return door;
}

module.exports = { PARTITION, TV_UA, DOOR_URL, MARKERS, markersIn, accountState, openDoor, partition };
