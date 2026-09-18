// Prov för att appen är en väljare och inget mer.
//
// Mätt skäl: 2026-09-18 byggdes YouTube inuti appen (eget rutnät, injicerad CSS,
// TV-läge, UA-spoofning, egen inloggning) och det gick inte att få bra. Provet
// pinnar att det lagret inte smyger tillbaka: en ruta, ingen injektion, ingen
// egen webbläsaridentitet — och att varje profil startas genom browser-launch,
// som ger den sin egen --user-data-dir.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');

test('en ruta, och bara en', () => {
    const created = main.match(/new BrowserWindow\(/g) || [];
    assert.strictEqual(created.length, 1, 'fler än en plats skapar fönster');
});

test('ingen injektion och ingen egen webbläsaridentitet', () => {
    for (const forbidden of ['insertCSS', 'executeJavaScript', 'setUserAgent', 'injector', 'userAgentFallback', 'fromPartition']) {
        assert.ok(!main.includes(forbidden), `main.js innehåller "${forbidden}" — det lagret skulle vara rivet`);
    }
    const sources = fs.readdirSync(path.join(ROOT, 'src'));
    for (const gone of ['injector.js', 'styles.css', 'browse.js', 'innertube.js', 'signed-out.js', 'sign-in.js', 'user-agent.js']) {
        assert.ok(!sources.includes(gone), `${gone} finns kvar i src/`);
    }
});

test('varje profil startas genom browser-launch', () => {
    assert.match(main, /browserCommand\(/, 'kommandot byggs inte av browser-launch');
    assert.match(main, /spawn\(command\.command, command\.args/, 'webbläsaren startas inte med kommandots argument');
    assert.match(main, /detached: true/, 'webbläsaren måste överleva att appen stänger sig');
    assert.match(main, /child\.unref\(\)/, 'utan unref dör webbläsaren med appen');
});

test("'closed' läser aldrig webContents, som redan är förstörd", () => {
    const closed = main.match(/on\('closed',[\s\S]{0,200}?\}\);/);
    assert.ok(closed, 'hittade ingen closed-hanterare');
    assert.ok(!closed[0].includes('win.webContents.id'), 'webContents läses efter stängning');
});

test('paketeringen hittar fortfarande sin ingång', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.main, 'src/main.js');
});
