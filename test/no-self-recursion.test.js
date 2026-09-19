// Prov för FELKLASSEN, inte bara för kvällens instans.
//
// 2026-09-19 small appen på `const sessionOfWindow = (win) => sessionOfWindow(win);`
// — en namnändring som råkade skriva om definitionen till ett självanrop. Felet
// landade som "RangeError: Maximum call stack size exceeded" i huvudprocessen, och
// appen stod still. Det här provet letar efter samma sak i alla källfiler: en
// definition vars kropp nämner sitt eget namn.
//
// ponytail: provet tillåter ingen självreferens alls. Behöver appen en riktig
// rekursiv algoritm får den ett undantag i listan här — det är billigare än att
// felsöka nästa "Maximum call stack size exceeded" i en app utan skärm.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter((name) => name.endsWith('.js'));

// Tar bort kommentarer och strängar, så att ett omnämnande i prosa inte ger utslag.
//
// RAD FÖR RAD, med flit: en global regex för strängar kan spänna över hur många
// rader som helst, och en enda obalanserad apostrof åt då upp resten av filen — då
// hade provet varit teater (0 definitioner kvar, allt "grönt").
function strip(text) {
    return text.split('\n').map((line) => line
        .replace(/\s*\/\/.*$/, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    ).join('\n');
}

function definitions(code) {
    const found = [];
    // const namn = (...) => ...
    for (const match of code.matchAll(/const\s+(\w+)\s*=\s*(\([^)]*\)\s*=>[^;\n]*|[^;\n]*=>)/g)) {
        found.push({ name: match[1], body: match[2] });
    }
    // function namn(...) { ... } — med klammerbalans
    for (const match of code.matchAll(/function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
        let depth = 0;
        let i = match.index + match[0].length - 1;
        const start = i;
        for (; i < code.length; i += 1) {
            if (code[i] === '{') depth += 1;
            if (code[i] === '}') { depth -= 1; if (depth === 0) break; }
        }
        found.push({ name: match[1], body: code.slice(start, i + 1) });
    }
    return found;
}

for (const file of files) {
    const code = strip(fs.readFileSync(path.join(SRC, file), 'utf8'));
    test(`${file}: ingen definition anropar sig själv`, () => {
        for (const { name, body } of definitions(code)) {
            const callsItself = new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(body);
            assert.ok(!callsItself, `${name} anropar sig själv i ${file} — det blir "Maximum call stack size exceeded"`);
        }
    });
}

test('skannern hittar definitionerna (annars vore provet teater)', () => {
    // Första versionen av det här provet åt hela filen med sin kommentarstädning och
    // såg 0 definitioner — alltså grönt utan att mäta någonting. Nu mäts det.
    const per = files.map((file) => ({
        file,
        count: definitions(strip(fs.readFileSync(path.join(SRC, file), 'utf8'))).length
    }));
    const total = per.reduce((sum, entry) => sum + entry.count, 0);
    assert.ok(total >= 15, `hittade bara ${total} definitioner totalt: ${JSON.stringify(per)}`);
    const mainCount = (per.find((entry) => entry.file === 'main.js') || {}).count || 0;
    assert.ok(mainCount >= 8, `main.js gav bara ${mainCount} definitioner — städningen har ätit filen`);
});

test('provet biter på det som small', () => {
    const broken = strip('const f = (x) => f(x);');
    const { name, body } = definitions(broken)[0];
    assert.strictEqual(name, 'f');
    assert.match(body, /f\s*\(/, 'provet känner inte igen ett självanrop');
});
