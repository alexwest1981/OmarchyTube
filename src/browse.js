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
    card.className = item.kind === 'channel' ? 'card channel' : 'card';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (item.thumbnail) {
        const img = document.createElement('img');
        // 1280x720 i stället för träfflistans 720x404 (mätt 2026-09-19).
        // Kanaler har en avatar i stället för en miniatyr.
        img.src = item.kind === 'channel' ? item.thumbnail : `https://i.ytimg.com/vi/${item.videoId}/hq720.jpg`;
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
    if (!item) return;
    // Ett kanalkort öppnar kanalen; ett videokort spelar.
    if (item.kind === 'channel') return loadChannelVideos(item);
    window.omarchyBridge.play(item.videoId);
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
        if (!loginPanel.hidden) { loginPanel.hidden = true; event.preventDefault(); return; }
        state.items = [];
        render();
        showNotice('');
        status.textContent = '';
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
        case 'l':
        case 'L': openLogin(); break;
        default: return;
    }
    event.preventDefault();
}, true);

window.addEventListener('DOMContentLoaded', start);

// ---- flikar, feed och inloggning ------------------------------------------
const tabs = document.getElementById('tabs');
const loginPanel = document.getElementById('login');
const loginStatusText = document.getElementById('login-status');
const loginCode = document.getElementById('login-code');
const logoutButton = document.getElementById('logout');
let pollTimer = null;

function showNotice(text) {
    notice.hidden = !text;
    notice.textContent = text || '';
}

function setTab(name) {
    for (const button of tabs.querySelectorAll('button[data-tab]')) button.classList.toggle('active', button.dataset.tab === name);
}

// Flikarna som kräver ett konto säger ifrån i klartext i stället för att visa en
// tom ruta — och öppnar inloggningen, som är enda vägen dit.
async function feed(name) {
    const label = { recommended: 'Rekommenderat', latest: 'Senaste från din feed', subscriptions: 'Mina kanaler' }[name] || name;
    status.textContent = `Hämtar ${label}…`;
    setTab(name);
    try {
        const items = await withTimeout(window.omarchyBridge.feed(name));
        state.items = items;
        state.index = 0;
        render();
        grid.focus();
        showNotice(items.length ? '' : `${label} är tomt.`);
        status.textContent = `${items.length} stycken`;
    } catch (err) {
        state.items = [];
        render();
        status.textContent = '';
        showNotice(`Kunde inte hämta ${label.toLowerCase()}: ${err.message}`);
        if (/inlogg|token|401|403/i.test(String(err.message))) openLogin();
    }
}

async function loadChannelVideos(item) {
    status.textContent = `Hämtar ${item.title}…`;
    try {
        const items = await withTimeout(window.omarchyBridge.channelVideos(item.channelId));
        state.items = items;
        state.index = 0;
        render();
        grid.focus();
        showNotice(`${item.title}: ${items.length} videor. Esc rensar.`);
        status.textContent = `${items.length} videor`;
    } catch (err) {
        showNotice(`Kunde inte hämta kanalen: ${err.message}`);
    }
}

function openLogin() {
    loginPanel.hidden = false;
    if (!loginStatusText.textContent) loginStatusText.textContent = 'Klistra in klient-id och hemlighet. Sedan visas en kod du bekräftar på mobilen eller i en webbläsare.';
    document.getElementById('client-id').focus();
}

function showCode(started) {
    loginCode.hidden = false;
    loginCode.textContent = started.userCode;
    loginStatusText.textContent = `Öppna ${started.url} och skriv in koden ovan. Appen väntar.`;
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        try {
            const result = await window.omarchyBridge.loginStatus();
            if (result.state === 'väntar') return;
            clearInterval(pollTimer);
            if (result.state === 'klar') {
                loginPanel.hidden = true;
                loginCode.hidden = true;
                logoutButton.hidden = false;
                showNotice('Inloggad.');
                feed('latest');
            } else {
                loginStatusText.textContent = `Inloggningen: ${result.state}${result.message ? ' — ' + result.message : ''}`;
            }
        } catch (err) {
            clearInterval(pollTimer);
            loginStatusText.textContent = `Fel: ${err.message}`;
        }
    }, 2000);
}

async function start() {
    const account = await window.omarchyBridge.account().catch(() => ({ signedIn: false }));
    logoutButton.hidden = !account.signedIn;
    if (account.signedIn) {
        setTab('recommended');
        feed('recommended');
    } else {
        setTab('search');
        openLogin();
        showNotice('Sök fungerar utan konto. För din lista, din feed och rekommendationerna: logga in nedan.');
    }
}

tabs.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'login-button') { openLogin(); return; }
    if (button.dataset.tab === 'search') { setTab('search'); query.focus(); return; }
    if (button.dataset.tab) feed(button.dataset.tab);
});

document.getElementById('save-client').addEventListener('click', async () => {
    const id = document.getElementById('client-id').value.trim();
    const secret = document.getElementById('client-secret').value.trim();
    if (!id || !secret) { loginStatusText.textContent = 'Både klient-id och hemlighet behövs.'; return; }
    try {
        await window.omarchyBridge.saveClient(id, secret);
        showCode(await window.omarchyBridge.startLogin());
    } catch (err) {
        loginStatusText.textContent = `Google svarade: ${err.message}`;
    }
});

logoutButton.addEventListener('click', async () => {
    await window.omarchyBridge.loggedOut();
    logoutButton.hidden = true;
    openLogin();
});
