// What the grid shows when YouTube has nothing to give it.
//
// Signed out, YouTube answers its own home feed with nothing at all: the reply
// carries "Your YouTube history is off" and zero items (measured 2026-09-18).
// That is not a failure to report as one — it is the answer — so the grid fills
// itself with a search instead, which YouTube does answer without an account
// (measured signed out: "music" 31 items, "trending" 15, "popular right now" 8),
// and says why above it.
//
// Pure on purpose: no DOM, no electron, so `npm test` can reach it. Both doors
// are wired below — the page reads window.OmarchySignedOut, the tests require() it.
const FALLBACK_QUERY = 'music';

const FALLBACK_NOTE = 'Signed out: YouTube has no home feed without an account (its own answer is "Your YouTube history is off"), so the grid shows search results for QUERY. Press / to search for anything, or F1 and sign in with the code from youtube.com/activate.';

// The query to search for instead, or null when there is nothing to fall back
// to. Only an empty home feed has somewhere to go; an empty search is an answer
// in itself and stays "No results".
function fallbackQuery(kind, items) {
    if (items && items.length) return null;
    return kind === 'home' ? FALLBACK_QUERY : null;
}

const api = { FALLBACK_QUERY, FALLBACK_NOTE, fallbackQuery };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
if (typeof window !== 'undefined') {
    window.OmarchySignedOut = api;
}
