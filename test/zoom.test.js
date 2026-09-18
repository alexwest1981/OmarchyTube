const test = require('node:test');
const assert = require('node:assert');

const { DEFAULT, MAX, MIN, clampZoom, nextZoom } = require('../src/zoom');

test('zoomen håller sig inom ramen', () => {
    assert.strictEqual(clampZoom(0.8), 0.8);
    assert.strictEqual(clampZoom(0.01), MIN);
    assert.strictEqual(clampZoom(9), MAX);
    assert.strictEqual(clampZoom('0.7'), 0.7);
    // Skräp i state-filen får inte ge en trasig ruta.
    assert.strictEqual(clampZoom('nej'), DEFAULT);
    assert.strictEqual(clampZoom(undefined), DEFAULT);
    assert.strictEqual(clampZoom(-1), DEFAULT);
});

test('stegen går ett snäpp i taget och stannar vid ändarna', () => {
    assert.strictEqual(nextZoom(0.8, 'out'), 0.7);
    assert.strictEqual(nextZoom(0.8, 'in'), 0.9);
    assert.strictEqual(nextZoom(MIN, 'out'), MIN);
    assert.strictEqual(nextZoom(MAX, 'in'), MAX);
    assert.strictEqual(nextZoom(0.8, 'reset'), DEFAULT);
});

test('standardzoomen visar fler kort än 100 %', () => {
    // 1920 px vid 0,8 ⇒ 2400 CSS-px, där skrivbordslayouten ger 5–6 kolumner mot 4.
    assert.ok(DEFAULT < 1, 'standardzoomen skall vara utzoomad');
    assert.ok(2400 / 1920 > 1.2);
});
