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
let current = null;    // den osynliga inloggningssidan, medan den används
let qrBild = null;

// Vilka kontomarkörer finns i en kaka-lista? Ren funktion, så provet kan mäta
// den utan Electron.
// TV-appens kod är åtta tecken i två grupper (mätt: GDM-STY-SDG). Den läses ur
// den osynliga sidan och ritas i vår panel — användaren skall aldrig se en
// YouTube-sida, bara sin egen app.
const codeFrom = (text) => {
    const m = String(text || '').match(/\b[A-Z0-9]{3,4}(?:-[A-Z0-9]{3,4}){1,2}\b/);
    return m ? m[0] : null;
};

// Läser koden och den största bilden på sidan (TV-appens QR-kod) — bara läsning,
// och bara de två uppgifterna. ponytail: största bilden, inte en CSS-selektor;
// byt till en selektor om TV-appen någonsin visar något större.
const LES_KODEN = `(function () {
    var kropp = document.body || {};
    var t = kropp.textContent || kropp.innerText || '';
    var m = t.match(/[A-Z0-9]{3,4}(?:-[A-Z0-9]{3,4}){1,2}/);
    var knappar = Array.prototype.slice.call(document.querySelectorAll('button, a, [role=button]'))
        .map(function (el) { return (el.textContent || '').trim().slice(0, 24); })
        .filter(Boolean).slice(0, 12);
    var bilder = Array.prototype.slice.call(document.querySelectorAll('img, canvas'))
        .filter(function (el) { return el.tagName === 'IMG' ? (el.naturalWidth >= 60 || /^data:/.test(el.src || '')) : el.width >= 60; });
    var qr = null;
    if (bilder[0]) { try { qr = bilder[0].tagName === 'CANVAS' ? bilder[0].toDataURL('image/png') : bilder[0].src; } catch (e) { qr = null; } }
    return JSON.stringify({ code: m ? m[0] : null, qr: qr, knappar: knappar, langd: t.length, titel: document.title, adress: location.href });
})()`;

// TV-appen visar sin inloggning bakom en "Sign in"-knapp. Att trycka på sidans
// EGEN knapp är att använda flödet, inte att ändra sidan — och det är precis vad
// en människa hade gjort i det synliga fönstret.
const TRYCK_KONTO = `(function () {
    var kandidater = Array.prototype.slice.call(document.querySelectorAll('button, a, [role=button]'));
    var konto = kandidater.filter(function (el) { return /@/.test((el.textContent || '')); })[0];
    if (!konto) return null;
    var namn = (konto.textContent || '').trim().split('\n')[0].slice(0, 30);
    konto.click();
    return namn;
})()`;

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
// Två signaler, och den andra är den som avgör: (1) en kontomarkör bland kakorna,
// (2) att YouTube faktiskt svarar med ett personligt flöde. Den andra är
// funktionell — den kan inte ha rätt om kaknamn och fel om verkligheten, och den
// är samma anrop rutnätet behöver ändå. Mätt 2026-09-19: ingen partition på
// disk hade någonsin kontomarkörer, så signal (1) ensam var en gissning.
function openDoor({ onSignedIn, onClosed, probe, onStorage, intervalMs = 2000 } = {}) {
    partition().setUserAgent(TV_UA);   // mätt: med skrivbordsagenten svarar YouTube med en återvändsgränd
    const door = new BrowserWindow({
        width: 1280,
        height: 800,
        // OSYNLIG. Ingen YouTube-sida skall synas: appen har ett fönster, och
        // inloggningen sker med en kod som ritas i appens egen panel (mätt
        // 2026-09-19: ett synligt dörrfönster var exakt vad Alex inte vill ha).
        show: false,
        backgroundColor: '#0b0b0d',
        autoHideMenuBar: true,
        title: 'inloggning',
        // Dörren MÅSTE bo i appens partition: annars hamnar sessionen i en annan
        // burk än rutnätet läser, och inloggningen gäller ingenting (mätt
        // 2026-09-19 — dörren visade YouTubes skrivbordssida i stället för
        // TV-appens kod, och kontot syntes aldrig).
        webPreferences: { partition: PARTITION, backgroundThrottling: false },
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

    let ticks = 0;
    const timer = setInterval(async () => {
      try {
        ticks += 1;
        const state = await accountState(doorSession).catch((err) => { console.error('[OmarchyTube] kakfrågan misslyckades:', err.message); return { signedIn: false, markers: [], total: 0 }; });
        let via = state.signedIn ? `kontomarkör (${state.markers.join(', ')})` : '';
        if (!via && ticks % 5 === 0) {
            // Var bor sessionen? TV-appen kan hålla den i sidans egen lagring i
            // stället för i kakor — och då kan våra egna anrop aldrig se den.
            // Läser bara NAMN, aldrig värden (de är kontots).
            let var_ = 'kunde inte läsas';
            try {
                var_ = await door.webContents.executeJavaScript(
                    'JSON.stringify({lagring: Object.keys(localStorage).slice(0, 25), sessions: Object.keys(sessionStorage).slice(0, 25), kakor: document.cookie.split("; ").filter(Boolean).map(function (c) { return c.split("=")[0]; }), adress: location.href})',
                );
            } catch (err) {
                var_ = `kunde inte läsas (${err.message})`;
            }
            console.log(`[OmarchyTube] dörrens lagring: ${var_}`);
            try {
                const funna = JSON.parse(var_).lagring || [];
                const intressanta = funna.filter((k) => /auth|token|login|session|account|oauth/i.test(k));
                if (intressanta.length && onStorage) {
                    const par = JSON.parse(await door.webContents.executeJavaScript(
                        `JSON.stringify(${JSON.stringify(intressanta)}.map(function (k) { return [k, localStorage.getItem(k)]; }))`,
                    ));
                    onStorage(par);   // värdena lämnas vidare, aldrig till loggen
                }
            } catch (err) {
                console.error(`[OmarchyTube] kunde inte läsa lagringens namn: ${err.message}`);
            }
        }
        if (!via && probe && ticks % 5 === 0) {
            // Var femte gång (var tionde sekund): fråga YouTube om flödet i stället.
            const count = await probe().catch((err) => { console.log(`[OmarchyTube] flödesprovet misslyckades: ${err.message}`); return 0; });
            console.log(`[OmarchyTube] flödesprovet: ${count} videor (efter ${ticks * intervalMs / 1000} s)`);
            if (count > 0) via = `flödet svarade (${count} videor)`;
        }
        if (ticks % 5 === 0 && !via) console.log(`[OmarchyTube] väntar på inloggning (${ticks * intervalMs / 1000} s, ${state.total} kakor i partitionen)`);
        if (via) {
            clearInterval(timer);
            console.log(`[OmarchyTube] inloggad — ${via}`);
            await partition().flushStorageData().catch((err) => console.error('[OmarchyTube] kunde inte skriva sessionen:', err.message));
            door.close();
            if (onSignedIn) onSignedIn({ ...state, via });
        }
      } catch (err) {
        // En trasig tick är inte samma sak som en misslyckad inloggning: säg det
        // och fortsätt vänta i stället för att tystna (mätt: ett TypeError här
        // dödade hela väntan utan ett ord).
        console.error(`[OmarchyTube] väntan snubblade (${err.message}) — fortsätter`);
      }
    }, intervalMs);

    current = door;
    door.on('closed', async () => {
        if (current === door) current = null;
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

// Panelens innehåll: koden och QR-bilden, lästa ur den osynliga sidan.
// TV-appen går genom flera skärmar (mätt: "Get started" först, inloggningen
// efter). Ett tryck per skärm, aldrig samma knapp två gånger, och bara på
// sidans EGNA knappar — det är vad en människa hade gjort.
let tryckta = [];
let senasteSkarm = null;
let senasteSkarmForra = null;
let senasteBild = 0;

// Koden ligger i en cross-origin-ram (mätt: hela sidans text är 330 tecken, ingen
// kod i den). Därför fotograferas den dolda sidan i stället — mätt 2026-09-19:
// capturePage på ett fönster med show:false ger en riktig bild (1000x671, 26 kB).
// Bilden ritas i appens panel, så QR:en kan skannas direkt från skärmen.
async function loginInfo() {
    if (!current) return { open: false };
    const raw = await current.webContents.executeJavaScript(LES_KODEN).catch(() => null);
    let läst = {};
    if (raw) { try { läst = JSON.parse(raw); } catch { läst = {}; } }
    const code = codeFrom(läst.code) || läst.code || null;
    // TV-appen styrs med fjärrkontroll: Enter väljer. Knapptexten är en gissning,
    // Enter fungerar på varje skärm — och skärmen loggas så vi ser exakt vad den
    // visar i stället för att gissa.
    const skarm = `${läst.titel || ''}|${läst.langd || 0}|${(läst.knappar || []).join(',')}`;
    if (skarm !== senasteSkarm) {
        senasteSkarm = skarm;
        console.log(`[OmarchyTube] skärmen: "${läst.titel || '?'}" ${läst.langd || 0} tecken | ${(läst.knappar || []).join(' | ') || '(inga knappar)'} | kod: ${code || 'nej'}`);
    }
    let lage = (läst.knappar || []).some((k) => k.includes('@')) ? 'konto' : 'kod';
    if (!code && tryckta.length < 4 && skarm !== senasteSkarmForra) {
        senasteSkarmForra = skarm;
        // Mätt i Alex partition: TV-appen står på YouTubes kontoväljare (AlexWest,
        // @alexwest_yt, Premium) och Enter tar den vidare. Kontoraden klickas när
        // den finns — då är valet hans eget konto och inget annat.
        const valt = await current.webContents.executeJavaScript(TRYCK_KONTO).catch(() => null);
        if (valt) {
            tryckta.push(`konto: ${valt}`);
            console.log(`[OmarchyTube] valde kontot "${valt}" (steg ${tryckta.length})`);
        } else {
            await current.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
            await current.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
            await current.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
            tryckta.push(`Enter på "${läst.titel || '?'}"`);
            console.log(`[OmarchyTube] skickade Enter till inloggningsskärmen (steg ${tryckta.length})`);
        }
    }
    const status = lage === 'konto' ? 'Väljer ditt konto i TV-appen …' : 'Inloggningen väntar på dig i den här rutan …';
    if (!code && Date.now() - senasteBild > 3000) {
        senasteBild = Date.now();
        try {
            const bild = await current.webContents.capturePage();
            if (!bild.isEmpty()) {
                qrBild = bild.toDataURL();
                const { width, height } = bild.getSize();
                console.log(`[OmarchyTube] inloggningsrutan fotograferad: ${width}x${height}, ${Math.round(bild.toPNG().length / 1024)} kB`);
            }
        } catch (err) {
            console.error(`[OmarchyTube] kunde inte fotografera inloggningen: ${err.message}`);
        }
    }
    if (code) console.log(`[OmarchyTube] koden läst ur sidan: ${code}`);
    return { open: true, code, qr: qrBild, status };
}

module.exports = { PARTITION, TV_UA, DOOR_URL, MARKERS, markersIn, codeFrom, accountState, openDoor, loginInfo, partition };
