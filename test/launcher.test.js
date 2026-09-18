// Prov för arkitekturen, så att kvällens fel inte kommer tillbaka.
//
// Varje påstående här kommer ur en mätning 2026-09-18:
//   * injicerad CSS (oskopad #container) la YouTubes skrivbordssida i ett band
//     högst upp med resten bortklippt;
//   * setZoomFactor(0.49) blev dpr 0,49 på Wayland och satte innehållet i en
//     fjärdedels ruta;
//   * två fönster sida vid sida gjorde YouTubes TV-app oläslig;
//   * en webbläsare som startades vid sidan av appen var inte vad Alex ville.
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

test('utloggad profil vaktas tills kontot finns, då blir det användarens läge', () => {
    // TV-vägen är bara en inloggningsdörr: 10-fotslayouten lyder inte zoom och ser
    // grotesk ut i ett fönster.
    assert.match(code, /customSession\.cookies\.get\(\{ domain: '\.youtube\.com' \}\)/, 'ingen vakt på sessionen');
    assert.match(code, /watchForSignIn\(win, customSession\)/, 'vakten kopplas inte in');
    assert.match(code, /Kontot finns i sessionen[\s\S]{0,400}loadURL\(pageForMode\(mode\)\)/, 'appen går inte tillbaka till användarens läge efter inloggning');
});

test('Googles blockerade inloggningsväg leder till dörren — genom en funktion', () => {
    // Mätt: Google svarar "This browser or app may not be secure" i en inbäddad
    // webbläsare. Både popup-vägen och navigeringsvägen skall gå till QR-dörren.
    const calls = code.match(/routeToSignInDoor\(win\)/g) || [];
    assert.strictEqual(calls.length, 3, `routeToSignInDoor anropas ${calls.length} gånger (förväntat: definitionen + popup + navigering)`);
    assert.match(code, /setWindowOpenHandler[\s\S]{0,400}isGoogleSignIn\(url\)/, 'popup-vägen fångas inte');
    assert.match(code, /did-navigate[\s\S]{0,200}isGoogleSignIn\(url\)/, 'navigeringsvägen fångas inte');
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
