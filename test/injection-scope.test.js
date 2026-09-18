// Prov för att utvidgningsreglerna håller sig till TV-appen.
//
// Mätt 2026-09-18 på YouTubes skrivbordssida: sju element har id="container"
// (masthead, spelare, spellista, kanalnamn ...). Den oskopade regeln tvingade
// dem alla till 100vw x 100vh med position: absolute, och overflow: hidden på
// html/body klippte bort allt utom första skärmen — sidan hamnade i ett band
// högst upp. Det här provet fäller om regeln blir oskopad igen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

test('geometrireglerna är avgränsade till TV-appen', () => {
    const css = read('styles.css');
    assert.ok(css.includes('html:has(ytlr-app) #container'), 'TV-regeln är inte avgränsad med :has(ytlr-app)');

    const unscoped = css.split('\n').filter((line) => /^\s*#(container|app-background|app)\s*[,{]/.test(line));
    assert.deepStrictEqual(unscoped, [], 'oskopade regler: ' + unscoped.join(' | '));

    const unscopedHtml = css.split('\n').filter((line) => /^\s*html\s*,\s*body\s*\{/.test(line));
    assert.deepStrictEqual(unscopedHtml, [], 'html/body-regeln är oskopad: ' + unscopedHtml.join(' | '));
});

test('injektorn rör bara TV-appens containrar', () => {
    const js = read('injector.js');
    const start = js.indexOf('function enforce100PercentFit');
    assert.ok(start > 0, 'enforce100PercentFit saknas');
    const body = js.slice(start, js.indexOf("window.addEventListener('resize'", start));
    assert.match(body, /ytlr-app/, 'guarden mot skrivbordssidan saknas i enforce100PercentFit');
});
