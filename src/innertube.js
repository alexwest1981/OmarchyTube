// YouTube's own data, without its pages.
//
// The grid is ours; the data is YouTube's. These calls run in the main process,
// where there is no CORS to satisfy: they go through Electron's net stack with
// the app's own session, so the cookies from the QR sign-in travel with them —
// that is what makes the home feed personal. Search works signed out as well
// (measured: a signed-out search returned 45 items).
const { net, session } = require('electron');
const { extractItems } = require('./innertube-extract');

// The public web key youtube.com itself hands to its own pages via ytcfg; it is
// not a secret and not tied to an account.
const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const PARTITION = 'persist:omarchy-tube';
const CONTEXT = {
    client: {
        clientName: 'WEB',
        clientVersion: '2.20260916.00.00',
        hl: 'en',
        gl: 'US',
    },
};

async function post(endpoint, body) {
    const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${API_KEY}&prettyPrint=false`;
    const response = await net.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        session: session.fromPartition(PARTITION),
        body: JSON.stringify({ context: CONTEXT, ...body }),
    });
    if (!response.ok) throw new Error(`${endpoint} answered ${response.status}`);
    return response.json();
}

const home = () => post('browse', { browseId: 'FEwhat_to_watch' }).then(extractItems);
const search = (query) => post('search', { query }).then(extractItems);

module.exports = { home, search, API_KEY };
