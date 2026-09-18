// Prov för profillistan. Reglerna bor här och inte i sidan, så de går att mäta
// utan fönster: main-processen är den enda som skriver filen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PALETTE, addProfile, findProfile, initialOf, partitionFor, readProfiles, removeProfile, slug, writeProfiles } = require('../src/profiles');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'omarchy-profiles-')), 'profiles.json');

test('saknad fil betyder inga profiler, inte ett fel', () => {
    assert.deepStrictEqual(readProfiles(tmpFile()), []);
});

test('trasig fil ger också en tom lista', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ inte json');
    assert.deepStrictEqual(readProfiles(file), []);
});

test('skriv och läs tillbaka', () => {
    const file = tmpFile();
    const { list } = addProfile([], 'Alex');
    writeProfiles(file, list);
    assert.deepStrictEqual(readProfiles(file), list);
});

test('tomt namn avvisas', () => {
    assert.strictEqual(addProfile([], '   '), null);
    assert.strictEqual(addProfile([], ''), null);
});

test('namnet trimmas och id:t blir ett partitionståligt namn', () => {
    const { profile } = addProfile([], '  Alex   West  ');
    assert.strictEqual(profile.name, 'Alex West');
    assert.strictEqual(profile.id, 'alex-west');
    assert.match(partitionFor(profile.id), /^persist:omarchy-tube-[a-z0-9-]+$/);
});

test('ett namn utan bokstäver får ett id i stället för en tom sträng', () => {
    const { profile } = addProfile([], '★★★');
    assert.strictEqual(profile.id, 'tittare');
});

test('två profiler med samma namn får olika id', () => {
    const first = addProfile([], 'Alex');
    const second = addProfile(first.list, 'Alex');
    assert.strictEqual(second.profile.id, 'alex-2');
    assert.notStrictEqual(partitionFor(second.profile.id), partitionFor(first.profile.id));
});

test('färgen vandrar genom paletten', () => {
    let list = [];
    for (let i = 0; i < PALETTE.length + 1; i += 1) {
        const result = addProfile(list, `Tittare ${i}`);
        list = result.list;
    }
    assert.deepStrictEqual(list.map((p) => p.colour), [...PALETTE, PALETTE[0]]);
});

test('borttagning och uppslag', () => {
    const { list } = addProfile(addProfile([], 'Alex').list, 'Någon annan');
    const [alex] = list.filter((p) => p.id === 'alex');
    const left = removeProfile(list, 'alex');
    assert.strictEqual(left.length, 1);
    assert.strictEqual(findProfile(left, 'alex'), null);
    assert.strictEqual(findProfile(list, 'alex'), alex);
    assert.strictEqual(findProfile(list, 'finns-inte'), null);
});

test('slug och initial', () => {
    assert.strictEqual(slug('Alex West'), 'alex-west');
    assert.strictEqual(initialOf('alex'), 'A');
    assert.strictEqual(initialOf(''), '?');
});
