// The extractor is the one piece of ours that reads YouTube's undocumented
// shapes; the fixture is a real (trimmed) /search response, captured live
// 2026-09-18 — 45 items came back from it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { extractItems } = require('../src/innertube-extract');

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'innertube-search.json'), 'utf8'));

test('hittar videon i ett riktigt svar, och bara dem', () => {
    const items = extractItems(fixture);
    assert.equal(items.length, 1, 'fixturen har ett videokort och en lockbete-renderare');
    assert.equal(items[0].videoId, 'r1TGWAIoWy0');
    assert.equal(items[0].title, 'Omarchy - The Agentic Linux Desktop');
    assert.equal(items[0].channel, 'Mental Outlaw');
    assert.equal(items[0].duration, '29:54');
    assert.match(items[0].thumbnail, /^https:\/\/i\.ytimg\.com\//);
});

test('matchar formen, inte namnet', () => {
    // YouTube byter namn på renderarna; en okänd behållare med videoId + titel
    // ska ändå plockas upp, och samma video bara en gång.
    const unknownShape = {
        someFutureRenderer: {
            videoId: 'abcdefghijk',
            headline: { runs: [{ text: 'A title from a shape nobody documented' }] },
            thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', width: 480, height: 360 }] },
        },
        sameVideoAgain: { videoId: 'abcdefghijk', title: { simpleText: 'duplicate' } },
    };
    const items = extractItems(unknownShape);
    assert.equal(items.length, 1, 'dubbletter ska bort');
    assert.equal(items[0].title, 'A title from a shape nobody documented');
});

test('en renderare utan videoId läcker inte igenom', () => {
    assert.deepEqual(extractItems({ aRenderer: { title: { simpleText: 'no id here' } } }), []);
    assert.deepEqual(extractItems(null), []);
});
