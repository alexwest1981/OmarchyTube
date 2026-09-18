// Prov för vad rutnätet gör när YouTube inte ger det något.
//
// Mätt 2026-09-18: inloggad? nej → YouTubes eget hemflöde (FEwhat_to_watch) svarar
// med noll videor och texten "Your YouTube history is off". Det är inte ett fel
// att visa som ett fel — men ett svart fönster är inte heller ett svar. Sökningen
// svarar utan konto (musik 31 träffar, trending 15), så rutnätet fyller sig med
// en sökning och säger varför ovanför.
//
//     npm test        (node --test, inga beroenden behövs)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { FALLBACK_QUERY, FALLBACK_NOTE, fallbackQuery } = require('../src/signed-out');

const ROOT = path.join(__dirname, '..');

test('ett tomt hemflöde faller tillbaka på en sökning', () => {
    assert.strictEqual(fallbackQuery('home', []), FALLBACK_QUERY);
    assert.ok(FALLBACK_QUERY.length > 0);
});

test('en tom sökning förblir "No results" — den har inget att falla tillbaka på', () => {
    assert.strictEqual(fallbackQuery('search', []), null);
});

test('ett hemflöde med innehåll rörs inte', () => {
    assert.strictEqual(fallbackQuery('home', [{ videoId: 'x' }]), null);
});

test('saknad lista kraschar inte, utan behandlas som tom', () => {
    assert.strictEqual(fallbackQuery('home', null), FALLBACK_QUERY);
    assert.strictEqual(fallbackQuery('home', undefined), FALLBACK_QUERY);
});

test('notisen förklarar båda vägarna ut', () => {
    assert.match(FALLBACK_NOTE, /youtube\.com\/activate/, 'inloggningsvägen ska stå i notisen');
    assert.match(FALLBACK_NOTE, /F1/, 'tangenten som öppnar TV-vyn ska stå i notisen');
});

test('sidan läser modulen i stället för att ha en egen kopia', () => {
    const html = fs.readFileSync(path.join(ROOT, 'src/browse.html'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'src/browse.js'), 'utf8');
    assert.ok(html.includes('id="notice"'), 'banderollen saknas i browse.html');
    assert.ok(
        html.indexOf('src="signed-out.js"') < html.indexOf('src="browse.js"'),
        'signed-out.js måste laddas före browse.js'
    );
    assert.ok(js.includes('window.OmarchySignedOut'), 'browse.js läser inte modulen');
    assert.ok(!js.includes("'music'"), 'fallback-frågan ska bara finnas i signed-out.js');
    assert.ok(js.includes('notice.textContent'), 'notisen får aldrig någon text');
});

// Mätt 2026-09-18: browse.html laddar signed-out.js och browse.js som två
// klassiska skript, alltså en gemensam global skopa för const/let på toppnivå.
// När signed-out.js deklarerade FALLBACK_QUERY på toppnivå dog browse.js med
// "Identifier 'FALLBACK_QUERY' has already been declared" och rutnätet ritade
// ingenting alls. Provet nedan laddar båda filerna i en och samma kontext, som
// sidan gör: allt utom SyntaxError är väntat (browse.js vill ha DOM).
test('båda skripten kan laddas i samma globala skopa', () => {
    const context = vm.createContext({ window: {}, console });
    const load = (file) => vm.runInContext(
        fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });

    load('src/signed-out.js');
    try {
        load('src/browse.js');
    } catch (err) {
        assert.notStrictEqual(err.constructor.name, 'SyntaxError',
            'toppnamn krockar mellan skripten: ' + err.message);
    }
    assert.ok(context.window.OmarchySignedOut, 'signed-out.js exponerade inget på window');
});
