// Prov för UA-valet. getUserAgentForMode var den enda säkerhetsgrenen i
// main.js utan vakt: TV-inloggningen (Googles TV-flöde) öppnar bara om
// förfrågan verkligen ser ut som en TV-app, och en felvänd gren hade tyst
// skickat en desktop-UA dit — eller en TV-UA till en sida som lovar X11-Chrome.
//
//     npm test        (node --test, inga beroenden behövs)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { TV_USER_AGENT, DESKTOP_USER_AGENT, getUserAgentForMode } = require('../src/user-agent');

const ROOT = path.join(__dirname, '..');

test('tv-läget skickar TV-agenten', () => {
    assert.strictEqual(getUserAgentForMode('tv'), TV_USER_AGENT);
    assert.match(TV_USER_AGENT, /Web0S|SmartTV/, 'TV-agenten ska vara en TV-agent');
});

test('allt som inte är exakt "tv" blir desktop, aldrig TV-agenten', () => {
    assert.strictEqual(getUserAgentForMode('desktop'), DESKTOP_USER_AGENT);
    assert.match(DESKTOP_USER_AGENT, /X11; Linux x86_64/, 'desktop-agenten ska vara X11-Chrome');
    for (const mode of ['TV', 'Desktop', 'leanback', '', null, undefined]) {
        assert.strictEqual(
            getUserAgentForMode(mode),
            DESKTOP_USER_AGENT,
            `${String(mode)} ska ge desktop-agenten — fallbacken får inte råka bli TV-agenten`
        );
    }
});

test('ingen av identiteterna utger sig för att vara den andra', () => {
    assert.notStrictEqual(TV_USER_AGENT, DESKTOP_USER_AGENT);
    assert.ok(!TV_USER_AGENT.includes('X11'), 'TV-agenten får inte låtsas vara X11');
    assert.ok(!DESKTOP_USER_AGENT.includes('SmartTV'), 'desktop-agenten får inte låtsas vara en TV');
});

test('main.js hämtar agenten från user-agent.js, och sätter den där den sätter en', () => {
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    assert.ok(main.includes("require('./user-agent')"), 'main.js ska importera UA-valet');
    assert.ok(!main.includes('Mozilla/5.0'), 'UA-strängarna ska bara finnas i src/user-agent.js');
    // de två ställena som måste finnas kvar: standardagenten och sessionshuvudet
    assert.ok(
        main.includes('app.userAgentFallback = getUserAgentForMode(currentMode)'),
        'standardagenten (app.userAgentFallback) sätts inte längre via getUserAgentForMode'
    );
    assert.ok(
        main.includes("details.requestHeaders['User-Agent'] = getUserAgentForMode(currentMode)"),
        'sessionshuvudet sätts inte längre via getUserAgentForMode'
    );
});
