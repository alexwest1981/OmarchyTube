// Vaktar densiteten i TV-läget (Level 9) och att spelaren lämnas ifred.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const css = readFileSync(join(__dirname, '..', 'src', 'styles.css'), 'utf8');
const js = readFileSync(join(__dirname, '..', 'src', 'injector.js'), 'utf8');

test('Level 9 halverar rotstorleken och gör det med !important', () => {
    // Appen sätter rotstorleken inline (font-size: 100%), så utan !important
    // vinner den och korten förblir 528x501 px vid 1920 — en rad i bild.
    const rule = css.match(/html\.omarchy-leanback\s*\{[^}]*\}/);
    assert.ok(rule, 'Level 9-regeln html.omarchy-leanback saknas i styles.css');
    // Procent fungerar inte på rot-elementet (den räknas mot initiala 16 px, inte
    // mot appens 1.25vw och gav 8 px i stället för 12 vid 1920). Därför vw.
    const size = rule[0].match(/font-size:\s*([\d.]+)vw\s*!important/);
    assert.ok(size, 'rotstorleken måste sättas i vw med !important');
    const vw = Number(size[1]);
    assert.ok(vw >= 0.45 && vw <= 0.9, `orimlig densitet: ${vw}vw (appen sätter 1.25vw)`);
});

test('densiteten gäller bläddring och sökning, men inte spelaren', () => {
    assert.match(js, /omarchy-leanback/, 'injector.js sätter aldrig klassen');
    const guard = js.match(/function isTvBrowse\(\)\s*\{[\s\S]{0,200}?\n    \}/);
    assert.ok(guard, 'isTvBrowse() saknas');
    assert.match(guard[0], /pathname\.startsWith\('\/tv'\)/, 'TV-läget känns inte igen på /tv');
    assert.match(guard[0], /#\/watch/, 'spelaren (#/watch) undantas inte');
});

test('tangenthjälpen visas en gång och kan stängas', () => {
    assert.match(js, /omarchy-hints-shown/, 'första-gången-flaggan saknas');
    assert.match(js, /addEventListener\('keydown', hide\)/, 'tipset stängs inte av en tangent');
});

test('ingen innerHTML i det som injiceras i YouTubes sidor', () => {
    // YouTubes CSP kräver TrustedHTML: `el.innerHTML = ...` kastar och koden
    // dör tyst. Tangenthjälpen uteblev i den byggda appen av just det skälet.
    const files = ['injector.js', 'main.js'];
    for (const f of files) {
        const src = readFileSync(join(__dirname, '..', 'src', f), 'utf8');
        assert.doesNotMatch(src, /\.innerHTML\s*=/, `${f} sätter innerHTML`);
        assert.doesNotMatch(src, /insertAdjacentHTML/, `${f} använder insertAdjacentHTML`);
    }
});
