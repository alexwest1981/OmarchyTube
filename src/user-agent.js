// The app's two identities, in one place.
//
// TV mode signs in through Google's TV flow, which only opens if the request
// really looks like a TV app; desktop mode plays from YouTube's ordinary watch
// page and must look like the Chrome it claims to be. A request that carries
// one agent in the header and another in the Client Hints is a contradiction,
// so both live here and main.js only ever asks this module.
//
// No electron import on purpose: this file is what `npm test` can reach.
const TV_USER_AGENT = 'Mozilla/5.0 (Web0S; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36 WebAppManager';
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Anything that is not exactly 'tv' is desktop. The fallback is deliberate and
// pinned by the test: a typo'd mode must not send a desktop request in TV
// clothing, and this is the branch the TV sign-in depends on.
function getUserAgentForMode(mode) {
    return mode === 'tv' ? TV_USER_AGENT : DESKTOP_USER_AGENT;
}

module.exports = { TV_USER_AGENT, DESKTOP_USER_AGENT, getUserAgentForMode };
