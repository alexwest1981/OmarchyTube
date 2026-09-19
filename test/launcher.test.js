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

test('dörren är ETT ställe med tre vägar in', () => {
    // Vägarna: ett klick på YouTubes inloggning (popup eller navigering), F2, eller
    // en utloggad profil som startar i TV-läget. Alla tre går genom openSignInDoor.
    const calls = code.match(/openSignInDoor\(/g) || [];
    assert.strictEqual(calls.length, 4, `openSignInDoor förekommer ${calls.length} gånger (definitionen + tre vägar in)`);
    assert.match(code, /if \(currentMode === 'tv'\) \{\s*openSignInDoor\(/, 'F2 tar inte dörren');
    assert.match(code, /if \(plan\.signIn\) \{\s*openSignInDoor\(/, 'starten tar inte dörren');
});

test('dörren städar besökskakorna innan TV-sidan laddas', () => {
    // Mätt 2026-09-19: med besökskakor i partitionen visar TV-appen sitt FLÖDE
    // ("Recommended"/"New to you") i stället för inloggningen — ingen QR-kod finns
    // då någonstans, och ett klick på Sign in ledde rakt tillbaka till flödet.
    // Ordningen spelar roll: städa först, ladda sedan.
    const door = code.match(/async function openSignInDoor[\s\S]*?\n\}/);
    assert.ok(door, 'hittade ingen openSignInDoor');
    const clear = door[0].indexOf('await forgetVisitor(');
    const load = door[0].indexOf('win.loadURL(plan.url)');
    assert.ok(clear !== -1, 'dörren städar inte besökskakorna');
    assert.ok(clear < load, 'dörren laddar sidan innan kakorna är städade');
});

test('städningen rör aldrig ett konto', () => {
    const guard = code.match(/async function forgetVisitor[\s\S]*?\n\}/);
    assert.ok(guard, 'hittade ingen forgetVisitor');
    assert.match(guard[0], /if \(isSignedIn\(cookies\)\) return false;/, 'städningen kontrollerar inte om kontot finns');
    assert.match(guard[0], /cookies\.remove\(/, 'städningen tar inga kakor');
});

test('en vakt per ruta, och den går tillbaka till användarens läge', () => {
    assert.match(code, /watchedWindows\.has\(win\.webContents\.id\)/, 'ingen spärr mot staplade vakter');
    assert.match(code, /customSession\.cookies\.get\(\{ domain: '\.youtube\.com' \}\)/, 'ingen vakt på sessionen');
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
    assert.match(code, /did-navigate[\s\S]{0,200}currentMode === 'desktop' && isBlockedSignIn\(url\)/,
        'navigeringsfångsten gäller även i TV-läget — då kapas TV-appens inloggning');
    assert.match(code, /if \(isBlockedSignIn\(url\)\) \{[\s\S]{0,300}if \(currentMode === 'desktop'\) routeToSignInDoor\(win\);/,
        'popup-fångsten gäller även i TV-läget');
});

test('städningen tar lokal lagring också, inte bara kakor', () => {
    // Mätt: städade kakor räckte inte — TV-appen kände ändå igen en återkommande
    // besökare och visade flödet i stället för inloggningen.
    const guard = code.match(/async function forgetVisitor[\s\S]*?\n\}/);
    assert.match(guard[0], /clearStorageData\(/, 'den lokala lagringen städas inte');
    assert.match(guard[0], /storages: \['localstorage'/, 'localstorage saknas i städningen');
    // Ursprungslistan måste vara verklig: med [] städas ingenting medan koden ser rätt ut.
    assert.match(guard[0], /for \(const origin of \['https:\/\/www\.youtube\.com'/, 'städningen går inte över något ursprung');
});

test("'closed' läser aldrig webContents, som redan är förstörd", () => {
    const closed = main.match(/on\('closed',[\s\S]{0,200}?\}\);/);
    assert.ok(closed, 'hittade ingen closed-hanterare');
    assert.ok(!closed[0].includes('win.webContents.id'), 'webContents läses efter stängning');
    assert.match(main, /const contentsId = win\.webContents\.id;/, 'id:t fångas inte före stängningen');
});

test('paketeringen hittar fortfarande sin ingång', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.main, 'src/main.js');
});
