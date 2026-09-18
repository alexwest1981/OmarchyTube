// The grid: our own browsing surface.
//
// Data comes over the preload bridge (main process, no CORS), playback is handed
// back the same way — Enter loads YouTube's own watch page, so ad blocking,
// SponsorBlock, Return YouTube Dislike and the floating back button keep working
// untouched. This file owns nothing but the grid and the keys.
const grid = document.getElementById('grid');
const status = document.getElementById('status');
const query = document.getElementById('query');

const state = { items: [], index: 0 };

// The column count is whatever the CSS produced, read back from the layout
// instead of being duplicated here — one source of truth for the grid shape.
const columns = () => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;

function makeCard(item) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (item.thumbnail) {
        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = '';
        img.loading = 'lazy';
        thumb.append(img);
    }
    if (item.duration) {
        const badge = document.createElement('span');
        badge.className = 'duration';
        badge.textContent = item.duration;
        thumb.append(badge);
    }

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = item.title;

    const channel = document.createElement('span');
    channel.className = 'channel';
    channel.textContent = item.channel || '';

    card.append(thumb, title, channel);
    card.addEventListener('click', () => play(state.items.indexOf(item)));
    return card;
}

function render() {
    grid.replaceChildren(...state.items.map(makeCard));
    markSelected();
}

function markSelected() {
    for (const [index, card] of [...grid.children].entries()) {
        card.classList.toggle('selected', index === state.index);
    }
    const card = grid.children[state.index];
    if (card) card.scrollIntoView({ block: 'nearest' });
    status.textContent = state.items.length ? `${state.index + 1} / ${state.items.length}` : status.textContent;
}

function move(delta) {
    if (!state.items.length) return;
    const next = Math.min(Math.max(state.index + delta, 0), state.items.length - 1);
    if (next !== state.index) {
        state.index = next;
        markSelected();
    }
}

function play(index) {
    const item = state.items[index];
    if (item) window.omarchyBridge.play(item.videoId);
}

async function load(kind, text) {
    status.textContent = kind === 'search' ? `Searching “${text}”…` : 'Loading…';
    try {
        const items = kind === 'search'
            ? await window.omarchyBridge.browseSearch(text)
            : await window.omarchyBridge.browseHome();
        state.items = items;
        state.index = 0;
        render();
        // The search field keeps the caret until we take it away; a leanback
        // grid is useless until the arrows reach it (measured: the selection
        // never moved because the input still had focus).
        grid.focus();
        if (!items.length) {
            status.textContent = kind === 'search'
                ? 'No results'
                : 'Signed out — search above, or press F1 for YouTube TV and sign in';
        }
    } catch (err) {
        state.items = [];
        render();
        // No dead end: the key that reaches YouTube's own view is in the footer.
        status.textContent = `YouTube did not answer (${err.message}) — press F1 for the TV view`;
    }
}

document.addEventListener('keydown', (event) => {
    const typing = document.activeElement === query;

    if (event.key === '/' && !typing) {
        query.focus();
        event.preventDefault();
        return;
    }
    if (event.key === 'Escape') {
        query.blur();
        query.value = '';
        load('home');
        event.preventDefault();
        return;
    }
    if (typing) {
        if (event.key === 'Enter' && query.value.trim()) {
            load('search', query.value.trim());
        }
        return;
    }

    switch (event.key) {
        case 'ArrowLeft': move(-1); break;
        case 'ArrowRight': move(1); break;
        case 'ArrowUp': move(-columns()); break;
        case 'ArrowDown': move(columns()); break;
        case 'PageUp': move(-columns() * 4); break;
        case 'PageDown': move(columns() * 4); break;
        case 'Home': move(-state.items.length); break;
        case 'End': move(state.items.length); break;
        case 'Enter': play(state.index); break;
        default: return;
    }
    event.preventDefault();
}, true);

window.addEventListener('DOMContentLoaded', () => load('home'));
