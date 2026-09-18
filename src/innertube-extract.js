// Pull video items out of a YouTube InnerTube response.
//
// YouTube renames its renderers regularly (videoRenderer, gridVideoRenderer,
// richItemRenderer, lockupViewModel, reelItemRenderer ...). Walking the tree and
// matching on the *shape* — a videoId plus some title field — instead of on the
// names survives those renames and costs ten lines. The shapes are undocumented;
// this was measured against a live /search response (45 items), whose fixture
// sits in test/fixtures/innertube-search.json.
const MAX_ITEMS = 120;

function textOf(node) {
    if (typeof node === 'string') return node;
    if (!node || typeof node !== 'object') return '';
    if (typeof node.simpleText === 'string') return node.simpleText;
    if (Array.isArray(node.runs)) return node.runs.map((run) => run.text || '').join('');
    if (typeof node.content === 'string') return node.content;
    return '';
}

function thumbnailOf(node) {
    const sizes = node && node.thumbnail && Array.isArray(node.thumbnail.thumbnails)
        ? node.thumbnail.thumbnails
        : [];
    if (!sizes.length) return '';
    // The card is ~240-320 px wide; take the smallest size that is still bigger
    // than that, otherwise the biggest one on offer.
    const sorted = [...sizes].sort((a, b) => (a.width || 0) - (b.width || 0));
    return (sorted.find((size) => (size.width || 0) >= 336) || sorted[sorted.length - 1]).url || '';
}

function extractItems(payload) {
    const items = [];
    const seen = new Set();

    (function walk(node) {
        if (!node || typeof node !== 'object' || items.length >= MAX_ITEMS) return;
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        const id = node.videoId;
        if (typeof id === 'string' && /^[\w-]{11}$/.test(id) && !seen.has(id)) {
            const title = textOf(node.title) || textOf(node.headline);
            if (title) {
                seen.add(id);
                items.push({
                    videoId: id,
                    title,
                    channel: textOf(node.ownerText) || textOf(node.longBylineText) || textOf(node.shortBylineText),
                    duration: textOf(node.lengthText) || textOf(node.thumbnailOverlays && node.thumbnailOverlays[0] && node.thumbnailOverlays[0].thumbnailOverlayTimeStatusRenderer && node.thumbnailOverlays[0].thumbnailOverlayTimeStatusRenderer.text),
                    thumbnail: thumbnailOf(node),
                });
            }
        }
        for (const child of Object.values(node)) walk(child);
    })(payload);

    return items;
}

module.exports = { extractItems, textOf, thumbnailOf, MAX_ITEMS };
