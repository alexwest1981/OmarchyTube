// Prov för det som domargranskningen 2026-09-18 hittade, så att det inte
// kommer tillbaka: döda npm-beroenden, en licens som inte stämmer med
// metadata, och SponsorBlock-etiketter som inte är deras egna.
//
//     npm test        (node --test, inga beroenden behövs)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function sourceFiles(dir = path.join(ROOT, 'src')) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...sourceFiles(full));
        else if (/\.(js|html)$/.test(entry.name)) out.push(full);
    }
    return out;
}

test('every declared dependency is imported somewhere', () => {
    const sources = sourceFiles().map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const names = Object.keys(declared);
    assert.ok(names.length > 0, 'package.json ska deklarera sina beroenden');
    for (const name of names) {
        // electron används via binären, inte via require i src/
        if (name === 'electron') continue;
        assert.ok(
            sources.includes(`require('${name}')`) || sources.includes(`from '${name}'`),
            `${name} står i package.json men importeras ingenstans — ta bort det eller använd det`
        );
    }
});

test('the licence in package.json is the one the project ships', () => {
    assert.strictEqual(pkg.license, 'MIT', 'package.json ska säga MIT som README och appstream gör');
    assert.ok(fs.existsSync(path.join(ROOT, 'LICENSE')), 'LICENSE-filen saknas');
    assert.ok(
        fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8').includes('MIT License'),
        'LICENSE ska vara MIT-licensen'
    );
});

test('sponsorblock category labels are the ones the API names', () => {
    const injector = fs.readFileSync(path.join(ROOT, 'src/injector.js'), 'utf8');
    const block = injector.match(/const categoryLabels = \{([\s\S]*?)\};/);
    assert.ok(block, 'categoryLabels hittades inte i injector.js');

    const labels = Object.fromEntries(
        [...block[1].matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1], m[2]])
    );
    // SponsorBlock:s egna kategorier och deras engelska namn
    assert.deepStrictEqual(labels, {
        sponsor: 'Sponsor',
        intro: 'Intro',
        outro: 'Outro',
        selfpromo: 'Self Promotion',
        interaction: 'Interaction Reminder',
        music_offtopic: 'Non-Music Section',
    });
});

test('user-facing chrome has no Swedish left', () => {
    const injector = fs.readFileSync(path.join(ROOT, 'src/injector.js'), 'utf8');
    const svenska = ['Ångra', 'Hoppade', 'Tillbaka', 'Prenumerera', 'Egen reklam', 'Icke-musik'];
    const kvar = svenska.filter((ord) => injector.includes(ord));
    assert.deepStrictEqual(
        kvar, [],
        `svenska kvar i gränssnittet: ${kvar.join(', ')} — README och metadata är engelska`
    );
});
