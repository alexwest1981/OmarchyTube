// The grid: our own browsing surface.
//
// Data comes over the preload bridge (main process, no CORS), playback is handed
// back the same way — Enter loads YouTube's own watch page, so ad blocking,
// SponsorBlock, Return YouTube Dislike and the floating back button keep working
// untouched. This file owns nothing but the grid and the keys.
const grid = document.getElementById('grid');
const status = document.getElementById('status');
const query = document.getElementById('query');

const notice = document.getElementById('notice');

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
        // 1280x720 i stället för träfflistans 720x404 (mätt 2026-09-19)
        img.src = `https://i.ytimg.com/vi/${item.videoId}/hq720.jpg`;
        img.addEventListener('error', () => { img.src = item.thumbnail; });
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

// Mätt 2026-09-18: rutnätet stod på "Searching ..." och ingen — varken Alex
// eller jag — kunde se om YouTube svarade, svarade tomt eller inte svarade alls.
// En förfrågan som aldrig kommer tillbaka får säga det själv i stället.
const TIMEOUT_MS = 20000;

function withTimeout(promise) {
    return Promise.race([
        promise,
        new Promise((resolve, reject) => setTimeout(
            () => reject(new Error(`no answer within ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS))
    ]);
}

async function load(kind, text) {
    status.textContent = kind === 'search' ? `Searching “${text}”…` : 'Loading…';
    try {
        const items = await withTimeout(
            kind === 'search' ? window.omarchyBridge.search(text) : Promise.resolve([])
        );
        state.items = items;
        state.index = 0;
        render();
        // The search field keeps the caret until we take it away; a leanback
        // grid is useless until the arrows reach it (measured: the selection
        // never moved because the input still had focus).
        grid.focus();
        if (!items.length) {
            // YouTubes egna startflöden svarar 400 eller tomt utan konto (mätt
            // 2026-09-19), så appens ingång är sökningen: en tangenttryckning
            // från innehåll, och inget påhittat "rekommenderat" att bläddra i.
            const fallback = '';
            notice.hidden = false;
            if (fallback) {
                query.value = fallback;
                
            }
            notice.textContent = 'Sök ovan (tryck /) — ↑↓ väljer, Enter spelar i mpv.';
            status.textContent = 'Sök för att börja';
        } else {
            notice.hidden = true;
            notice.textContent = '';
        }
    } catch (err) {
        state.items = [];
        render();
        status.textContent = `YouTube svarade inte (${err.message})`;
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
