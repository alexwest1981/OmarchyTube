// What the grid shows when YouTube has nothing to give it.
//
// Signed out, YouTube answers its own home feed with nothing at all: the reply
// carries "Your YouTube history is off" and zero items (measured 2026-09-18).
// That is not a failure to report as one — it is the answer — so the grid says
// so and offers the two ways out.
//
// Wrapped in an IIFE for a measured reason: browse.html loads this file and
// browse.js as two classic scripts, which share one global lexical scope for
// top-level const/let. Declaring FALLBACK_QUERY at the top level here made
// browse.js die with "Identifier 'FALLBACK_QUERY' has already been declared" —
// the grid rendered nothing at all. Keep every name inside the function, and
// expose the API on window instead (test/signed-out.test.js guards it).
//
// Pure otherwise: no DOM, no electron, so `npm test` can reach it.
(function () {
    const FALLBACK_QUERY = 'music';

    const FALLBACK_NOTE = 'Signed out: YouTube has no home feed without an account (its own answer is "Your YouTube history is off"). Press / to search — that works without an account — or F3 and pick a profile: it opens the TV app sign-in (scan the QR code, or type the code at yt.be/activate).';

    // The query to search for instead, or null when there is nothing to fall
    // back to. Only an empty home feed has somewhere to go; an empty search is
    // an answer in itself and stays "No results".
    function fallbackQuery(kind, items) {
        if (items && items.length) return null;
        return kind === 'home' ? FALLBACK_QUERY : null;
    }

    const api = { FALLBACK_QUERY, FALLBACK_NOTE, fallbackQuery };

    if (typeof window !== 'undefined') {
        window.OmarchySignedOut = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
