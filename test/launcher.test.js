// Prov för arkitekturen, så att kvällens fel inte kommer tillbaka.
//
// Varje påstående här kommer ur en mätning 2026-09-18:
//   * injicerad CSS (oskopad #container) la YouTubes skrivbordssida i ett band
//     högst upp med resten bortklippt;
//   * zoom-experimentet bet inte: setZoomLevel(0) nollställde faktorn i nästa
//     andetag, och kvartsfönstret var injektorns sju #container;
//   * två fönster sida vid sida gjorde YouTubes TV-app oläslig;
//   * en webbläsare som startades vid sidan av appen var inte vad Alex ville;
//   * en besökskaka i partitionen fick TV-appen att visa sitt flöde i stället för
//     inloggningen, så QR-koden aldrig kom upp (mätt 2026-09-19).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
// Kommentarerna berättar vad som revs (och nämner därför det rivna vid namn);
// reglerna nedan gäller KODEN.
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter((line) => !line.trim().startsWith('//')).join('\n');

test('en ruta, och allt sker i den', () => {
    const created = main.match(/new BrowserWindow\(/g) || [];
    assert.strictEqual(created.length, 1, 'fler än en plats skapar fönster');
    assert.match(main, /win\.loadFile\(pickerPage\)|win\.loadURL\(/, 'fönstret laddar ingen sida');
});

test('appen rör inte YouTubes sidor', () => {
    for (const forbidden of ['insertCSS', 'executeJavaScript', 'injector', 'setZoomLevel']) {
        assert.ok(!code.includes(forbidden), `main.js innehåller "${forbidden}" — det lagret skulle vara rivet`);
    }
});

test('zoomen går genom modulen, och bara med ett grepp', () => {
    // Mätt: setZoomLevel(0) nollställde setZoomFactor(0.49) — två mekanismer
    // samtidigt bet inte, och loggen skrev avsikten. setZoomLevel är därför borta
    // för gott, och resultatet läses med getZoomFactor().
    assert.match(code, /require\('\.\/zoom'\)/, 'zoomen kommer inte från modulen');
    assert.match(code, /applyZoom\(win, nextZoom\(currentZoom,/, 'tangenterna går inte genom applyZoom');
    assert.match(code, /getZoomFactor\(\)\.toFixed\(2\)/, 'loggen skriver avsikten i stället för resultatet');
});

test('ingen webbläsare startas vid sidan av appen', () => {
    for (const forbidden of ['child_process', 'spawn(', 'browserCommand', 'BROWSER']) {
        assert.ok(!code.includes(forbidden), `main.js innehåller "${forbidden}"`);
    }
});

test('varje profil får sin egen session, satt en gång', () => {
    assert.match(main, /fromPartition\(profile \? partitionFor\(profile\.id\) : PICKER_PARTITION\)/,
        'profilfönstret använder inte profilens partition');
    assert.match(main, /configuredPartitions\.has\(key\)/, 'sessionsreglerna sätts utan att kontrollera att de redan finns');
});

test('inloggningsvalet kommer från sign-in-modulen', () => {
    assert.match(main, /planForSession\(/, 'beslutet om inloggning tas någon annanstans än i den provade modulen');
});

test('profilfönstret är fullskärm, och det är inte maximize()', () => {
    // Hyprland tilade rutan till 941 px och YouTubes 10-fotslayout blev grotesk
    // (två gigantiska brickor). fullscreen: true är en riktig begäran till
    // kompositorn; maximize() förlorar mot tilningen.
    assert.match(code, /fullscreen: Boolean\(profile\)/, 'profilfönstret ber inte om fullskärm');
    assert.ok(!code.includes('.maximize()'), 'maximize() är tillbaka — den biter inte mot Hyprlands tilning');
});

test('dörren är ETT ställe med två vägar in', () => {
    // Vägarna: ett klick på YouTubes inloggning (fångad i popup eller navigering) och
    // en profil som startar i TV-läget. F2 tar den INTE — F2 => dörr => städning var
    // vägen som dödade sessionen.
    const calls = code.match(/openSignInDoor\(/g) || [];
    assert.strictEqual(calls.length, 3, `openSignInDoor förekommer ${calls.length} gånger (definitionen + två vägar in)`);
    assert.match(code, /if \(plan\.signIn\) \{\s*openSignInDoor\(/, 'starten tar inte dörren');
});

test('dörren är idempotent — den städar inte om den redan är öppen', () => {
    // Städningen tittar på en ögonblicksbild: körde den mitt i TV-appens inloggning
    // kastades sessionen bort.
    const door = code.match(/async function openSignInDoor[\s\S]*?\n\}/);
    assert.match(door[0], /if \(currentMode === 'tv' && win\.webContents\.getURL\(\)\.startsWith\(TV_PAGE\)\) return;/,
        'dörren kan öppnas om och städa mitt i en pågående inloggning');
});

test('appen raderar ALDRIG sessionsdata', () => {
    // 2026-09-19 small hela flödet på att dörren städade profilens kakor och lokala
    // lagring "för att få fram inloggningen": TV-appen håller sin session där, så
    // varje F2 betydde en ny QR-inloggning. Alex: "exakt samma visa hela tiden".
    // Regeln är nu absolut: ingenting i src/ får ta bort något ur en profil.
    const forbidden = ['clearStorageData', 'cookies.remove', 'clearData', 'clearCache'];
    for (const call of forbidden) {
        assert.ok(!code.includes(call), `src/main.js innehåller ${call} — appen får inte radera sessionsdata`);
    }
});

test('dörren städar ingenting — den byter bara sida', () => {
    const door = code.match(/async function openSignInDoor[\s\S]*?\n\}/);
    assert.ok(door, 'hittade ingen openSignInDoor');
    assert.ok(!/remove|clear|delete/i.test(door[0].replace(/\/\/.*/g, '')),
        'dörren tar bort något — det var felet som krävde en ny QR varje gång');
    assert.match(door[0], /win\.loadURL\(plan\.url\)/, 'dörren laddar inte sin sida');
});

test('F2 växlar läge och rör ingenting annat', () => {
    // F2 => dörren => städning var exakt den väg som dödade sessionen.
    const handler = code.match(/if \(input\.key === 'F2'\) \{[\s\S]*?\n        \}/);
    assert.ok(handler, 'hittade ingen F2-hanterare');
    assert.match(handler[0], /switchMode\(currentMode === 'tv' \? 'desktop' : 'tv', \{ persist: true \}\)/,
        'F2 växlar inte läget som ett sparat val');
    assert.ok(!handler[0].includes('openSignInDoor'), 'F2 öppnar dörren — den vägen dödade sessionen');
    assert.ok(!handler[0].includes('sessionCookies'), 'F2 läser sessionen — onödigt och farligt');
});

test('starten skriver ut hela kakinventariet', () => {
    // Gissningar om var sessionen bor har kostat nog. Loggen skall svara.
    assert.match(code, /logCookieInventory\(profile, cookies\)/, 'inventariet loggas inte vid start');
    assert.match(code, /cookie\.domain/, 'inventariet visar inte kakornas domän');
});

test('en vakt per ruta, och den går tillbaka till användarens läge', () => {
    assert.match(code, /watchedWindows\.has\(win\.webContents\.id\)/, 'ingen spärr mot staplade vakter');
    assert.match(code, /sessionCookies\(customSession\)/, 'ingen vakt på sessionen');
    assert.match(code, /const back = userMode;/, 'vakten minns inte användarens läge');
    assert.match(code, /Kontot finns i sessionen[\s\S]{0,400}loadURL\(pageForMode\(back\)\)/, 'appen går inte tillbaka till användarens läge efter inloggning');
});

test('dörren får aldrig skriva över användarens läge', () => {
    // Mätt 2026-09-19: dörren sparade 'tv', och efter inloggningen stod appen kvar i
    // 10-fotslayouten — en rad, två stora lågupplösta kort — i stället för
    // skrivbordslayouten användaren ville ha.
    assert.match(code, /writeState\(\{ userMode \}\)/, 'användarens läge sparas inte under egen nyckel');
    assert.ok(!code.includes('writeState({ mode'), 'läget skrivs utan att skilja på användarens val och dörrens besök');
    for (const door of ['openSignInDoor', 'routeToSignInDoor']) {
        const body = code.match(new RegExp('function ' + door + '[\\s\\S]*?\\n\\}'));
        assert.ok(body, 'hittade ingen ' + door);
        assert.ok(!body[0].includes('persist: true'), door + ' sparar sitt läge som användarens val');
    }
});

test('Googles blockerade inloggningsväg leder till dörren — genom en funktion', () => {
    // Mätt: Google svarar "This browser or app may not be secure" i en inbäddad
    // webbläsare. Både popup-vägen och navigeringsvägen skall gå till QR-dörren.
    const calls = code.match(/routeToSignInDoor\(win\)/g) || [];
    assert.strictEqual(calls.length, 3, `routeToSignInDoor anropas ${calls.length} gånger (förväntat: definitionen + popup + navigering)`);
    assert.match(code, /setWindowOpenHandler[\s\S]{0,500}isBlockedSignIn\(url\)/, 'popup-vägen fångas inte');
    assert.match(code, /did-navigate[\s\S]{0,200}isBlockedSignIn\(url\)/, 'navigeringsvägen fångas inte');
});

test('fångsten gäller bara skrivbordsläget — dörren äger sin egen inloggning', () => {
    // Mätt 2026-09-19: TV-appens egen inloggning går via Google. Fångade vi den
    // revs sidan och användaren släpptes tillbaka i TV-flödet utan att ha fått
    // fylla i något — tre skärmbilder visade loopen.
    assert.match(code, /did-navigate[\s\S]{0,240}currentMode === 'desktop' && !isSignedInCached\(win\) && isBlockedSignIn\(url\)/,
        'navigeringsfångsten gäller även i TV-läget eller för en inloggad ruta — då kapas inloggningen eller kastas man tillbaka till TV');
    assert.match(code, /if \(isBlockedSignIn\(url\)\) \{[\s\S]{0,300}if \(currentMode === 'desktop' && !isSignedInCached\(win\)\) routeToSignInDoor\(win\);/,
        'popup-fångsten gäller även i TV-läget eller för en inloggad ruta');
});

test("'closed' läser aldrig webContents, som redan är förstörd", () => {
    const closed = main.match(/on\('closed',[\s\S]{0,200}?\}\);/);
    assert.ok(closed, 'hittade ingen closed-hanterare');
    assert.ok(!closed[0].includes('win.webContents.id'), 'webContents läses efter stängning');
    assert.match(main, /const contentsId = win\.webContents\.id;/, 'id:t fångas inte före stängningen');
});

test('kakfrågan ställs utan domänfilter — gissningen kostade sessionen', () => {
    // Alex 2026-09-19: "det verkar inte sparas något på datorn, utan man måste logga
    // in varje gång". Domänfiltret kunde svara "utloggad" medan kontot fanns, och då
    // städade dörren bort sessionen. Frågan ställs nu utan filter, och svaret loggas.
    assert.ok(!code.includes("domain: '.youtube.com'"), 'domänfiltret är tillbaka — det är en gissning om var kakan ligger');
    assert.match(code, /const sessionCookies = \(targetSession\) => targetSession\.cookies\.get\(\{\}\)/, 'kakorna frågas inte utan filter');
    assert.match(code, /describeSession\(cookies\)/, 'svaret loggas inte, så det går inte att läsa av');
});

test('sessionen skrivs till disk innan processen dör', () => {
    // Appen startas om med pkill (SIGTERM); Chromium skriver kakor periodiskt, inte
    // nödvändigtvis innan processen dör.
    assert.match(code, /flushStorageData\(\)/, 'sessionen tvingas inte till disk');
    assert.match(code, /app\.on\('before-quit', flushSessions\)/, 'ingen städning vid avslut');
    assert.match(code, /win\.on\('close', \(\) => \{\s*flushSessions\(\)/, 'ingen skrivning när fönstret stängs');
});

test('paketeringen hittar fortfarande sin ingång', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.main, 'src/main.js');
});
