// Fångar den bugg som small 2026-09-19: en namnändring skrev om DEFINITIONEN till
// ett självanrop — `const sessionOfWindow = (win) => sessionOfWindow(win);` — och
// varje anrop small på stacken.
//
// Provet fäller bara den formen: en definition vars hela kropp är ett enda
// självanrop. Äkta rekursion (en trädvandring som anropar sig i en loop) är
// tillåten och skall passera — första versionen av provet fällde den också.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const ARROW = /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*/g;
const FUNC = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;

// ponytail: naiv klammerräkning, inte en parser. Räcker för att se om kroppen är
// ett enda anrop; byt mot en riktig parser om koden börjar innehålla klamrar i
// strängar.
function bodyOf(src, start) {
    let i = start;
    while (/\s/.test(src[i])) i += 1;
    if (src[i] === '{') {
        let depth = 0;
        for (let j = i; j < src.length; j += 1) {
            if (src[j] === '{') depth += 1;
            else if (src[j] === '}') {
                depth -= 1;
                if (depth === 0) return src.slice(i + 1, j);
            }
        }
        return src.slice(i + 1);
    }
    const end = src.indexOf(';', i);
    return src.slice(i, end === -1 ? undefined : end);
}

function definitions(src) {
    const found = [];
    for (const re of [ARROW, FUNC]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) found.push({ name: m[1], body: bodyOf(src, m.index + m[0].length) });
    }
    return found;
}

const selfCallOnly = (name, body) => new RegExp(`^\\s*${name}\\s*\\([^;]*\\)\\s*;?\\s*$`).test(body);

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
let total = 0;

for (const file of files) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    const defs = definitions(src);
    total += defs.length;
    test(`${file}: ingen definition är ett självanrop`, () => {
        const bad = defs.filter((d) => selfCallOnly(d.name, d.body)).map((d) => d.name);
        assert.deepStrictEqual(bad, [], `${bad.join(', ')} i ${file} anropar sig själv som hela sin kropp`);
    });
}

test('skannern hittar definitionerna (annars vore provet teater)', () => {
    assert.ok(total >= 10, `skannern hittade bara ${total} definitioner i src/`);
    const main = definitions(fs.readFileSync(path.join(SRC, 'main.js'), 'utf8')).map((d) => d.name);
    assert.ok(main.includes('createWindow'), `createWindow saknas i skannerns träfflista: ${main.join(', ')}`);
    const extract = definitions(fs.readFileSync(path.join(SRC, 'innertube-extract.js'), 'utf8')).map((d) => d.name);
    assert.ok(extract.includes('extractItems'), `extractItems saknas i skannerns träfflista: ${extract.join(', ')}`);
    const browse = definitions(fs.readFileSync(path.join(SRC, 'browse.js'), 'utf8')).map((d) => d.name);
    assert.ok(browse.includes('makeCard'), `makeCard saknas i skannerns träfflista: ${browse.join(', ')}`);
});
