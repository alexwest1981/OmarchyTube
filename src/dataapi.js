// Din lista och din feed, från YouTubes officiella Data API v3.
//
// Kvoten är 10 000 enheter per dygn. En sida prenumerationer (50 kanaler) kostar
// 1 enhet, varje kanals uppladdningslista 1 enhet — 50 kanaler kostar alltså 51,
// och varje uppdatering lika mycket. Det räcker till ~190 uppdateringar per dygn.
const { net } = require('electron');
const { accessToken } = require('./auth');

const BASE = 'https://www.googleapis.com/youtube/v3';

async function api(pathname, params) {
    const url = new URL(BASE + pathname);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const res = await net.fetch(url.toString(), { headers: { Authorization: `Bearer ${await accessToken()}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = (body.error && body.error.message) || String(res.status);
        throw new Error(`${pathname} svarade ${res.status}: ${message}`);
    }
    return body;
}

// ISO 8601-varaktighet (PT1H2M3S) till samma form YouTube visar (1:02:03).
function isoDuration(text) {
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text || '');
    if (!m) return '';
    const [days, hours, minutes, seconds] = [m[1], m[2], m[3], m[4]].map((v) => parseInt(v || '0', 10));
    const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    const h = Math.floor(total / 3600);
    const min = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return (h ? `${h}:${String(min).padStart(2, '0')}` : String(min)) + `:${String(sec).padStart(2, '0')}`;
}

// Rutnätets form: { videoId, title, channel, duration, thumbnail }.
function itemOf(snippet, duration) {
    const videoId = (snippet.resourceId && snippet.resourceId.videoId) || snippet.videoId || '';
    return {
        videoId,
        title: snippet.title || '',
        channel: snippet.videoOwnerChannelTitle || snippet.channelTitle || '',
        duration: duration || '',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hq720.jpg`,
    };
}

async function mySubscriptions(max = 50) {
    const body = await api('/subscriptions', { part: 'snippet,contentDetails', mine: 'true', maxResults: max, order: 'alphabetical' });
    return (body.items || []).map((entry) => ({
        channelId: entry.snippet.resourceId.channelId,
        title: entry.snippet.title,
        avatar: (((entry.snippet.thumbnails || {}).default || {}).url) || '',
        uploads: entry.contentDetails && entry.contentDetails.relatedPlaylists && entry.contentDetails.relatedPlaylists.uploads,
    })).filter((c) => c.uploads);
}

// Senaste från din feed: nyaste uppladdningen från varje kanal du följer,
// nyast först. Varaktigheterna hämtas i en klump (1 enhet per 50 videor).
async function latestFromSubscriptions(perChannel = 2) {
    const channels = await mySubscriptions();
    console.log(`[OmarchyTube] feed: ${channels.length} prenumerationer`);
    const lists = [];
    for (const channel of channels) {
        const body = await api('/playlistItems', { part: 'snippet', playlistId: channel.uploads, maxResults: perChannel });
        for (const entry of body.items || []) lists.push({ entry, channel });
    }
    const ids = lists.map((l) => l.entry.snippet.resourceId.videoId).filter(Boolean);
    const durations = new Map();
    for (let i = 0; i < ids.length; i += 50) {
        const body = await api('/videos', { part: 'contentDetails', id: ids.slice(i, i + 50).join(',') });
        for (const video of body.items || []) durations.set(video.id, isoDuration(video.contentDetails.duration));
    }
    return lists
        .map((l) => ({ ...itemOf(l.entry.snippet, durations.get(l.entry.snippet.resourceId.videoId)), published: l.entry.snippet.publishedAt }))
        .sort((a, b) => String(b.published).localeCompare(String(a.published)));
}

// En kanals senaste videor (2 enheter: kanalens uppladdningslista + listan).
async function channelVideos(channelId, max = 20) {
    const channel = await api('/channels', { part: 'contentDetails', id: channelId });
    const uploads = channel.items && channel.items[0] && channel.items[0].contentDetails.relatedPlaylists.uploads;
    if (!uploads) throw new Error(`kanalen ${channelId} har ingen uppladdningslista`);
    const body = await api('/playlistItems', { part: 'snippet', playlistId: uploads, maxResults: max });
    return (body.items || []).map((entry) => itemOf(entry.snippet, ''));
}

module.exports = { mySubscriptions, latestFromSubscriptions, channelVideos, isoDuration, itemOf };
