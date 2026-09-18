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
    for (const forbidden of ['insertCSS', 'executeJavaScript', 'injector', 'setZoomFactor', 'setZoomLevel']) {
        assert.ok(!code.includes(forbidden), `main.js innehåller "${forbidden}" — det lagret skulle vara rivet`);
    }
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

test('TV-läget tar bredden när rutan är smal', () => {
    // Mätt: 941 px gav rotfont 5,88 px mot 24 px vid 1920 — TV-appen är oläslig
    // i en smal ruta, så läget maximerar i stället för att appen skalar om.
    assert.match(main, /newMode === 'tv'[\s\S]{0,300}maximize\(\)/, 'TV-läget maximerar inte');
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
