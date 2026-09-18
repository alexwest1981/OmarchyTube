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
    const size = rule[0].match(/font-size:\s*(\d+)%\s*!important/);
    assert.ok(size, 'rotstorleken måste sättas i procent med !important');
    const percent = Number(size[1]);
    assert.ok(percent >= 35 && percent <= 70, `orimlig densitet: ${percent}%`);
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
