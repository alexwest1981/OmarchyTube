/**
 * OmarchyTube (ReVanced for Omarchy) - Injected Client Script
 * Implements: Ad-skipping, SponsorBlock, Return YouTube Dislike & UI enhancements
 */

(function () {
    console.log('[OmarchyTube] Injected ReVanced engine loaded.');

    let currentVideoId = null;
    let sponsorSegments = [];
    let ignoredSegmentUUID = null;
    let markersRendered = false;

    // Default configuration
    const config = {
        hideShorts: true,
        sponsorBlock: true,
        skipCategories: ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction', 'music_offtopic'],
        returnDislike: true,
        aggressiveAdSkip: true,
    };

    if (config.hideShorts) {
        document.documentElement.classList.add('hide-shorts');
    }

    // --- Utility: Format seconds to M:SS ---
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // --- Utility: Format numbers (e.g. 14200 -> 14.2k) ---
    function formatCount(num) {
        if (!num && num !== 0) return '';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return num.toString();
    }

    // --- Toast Notifications ---
    function ensureToastContainer() {
        let container = document.getElementById('omarchy-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'omarchy-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    function showToast(message, onUndo) {
        const container = ensureToastContainer();
        const toast = document.createElement('div');
        toast.className = 'omarchy-toast';

        const msgSpan = document.createElement('span');
        msgSpan.innerText = message;
        toast.appendChild(msgSpan);

        if (onUndo) {
            const undoBtn = document.createElement('button');
            undoBtn.className = 'omarchy-toast-undo';
            undoBtn.innerText = 'Ångra';
            undoBtn.onclick = (e) => {
                e.stopPropagation();
                onUndo();
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 250);
            };
            toast.appendChild(undoBtn);
        }

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 250);
            }
        }, 4000);
    }

    // --- Module 1: In-player Ad Skipping ---
    let adWasMuted = false;

    function handleInPlayerAds() {
        if (!config.aggressiveAdSkip) return;

        const video = document.querySelector('video');
        if (!video) return;

        const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
        const adContainer = document.querySelector('.video-ads .ad-container');

        if (adShowing || adContainer) {
            if (!video.muted) {
                video.muted = true;
                adWasMuted = true;
            }
            video.playbackRate = 16.0;
            if (Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = video.duration;
            }

            // Click modern skip buttons
            const skipButtonSelectors = [
                '.ytp-ad-skip-button',
                '.ytp-ad-skip-button-modern',
                '.ytp-skip-ad-button',
                'button.ytp-ad-skip-button-modern',
                '.ytp-ad-overlay-close-button'
            ];

            for (const selector of skipButtonSelectors) {
                const btn = document.querySelector(selector);
                if (btn) {
                    btn.click();
                    break;
                }
            }
        } else if (adWasMuted) {
            video.muted = false;
            video.playbackRate = 1.0;
            adWasMuted = false;
        }
    }

    // Run ad skipper loop at high frequency for instant reaction
    setInterval(handleInPlayerAds, 200);

    // --- Module 2: SponsorBlock ---
    const categoryLabels = {
        sponsor: 'Sponsor',
        intro: 'Intro',
        outro: 'Outro',
        selfpromo: 'Egen reklam',
        interaction: 'Prenumerera-påminnelse',
        music_offtopic: 'Icke-musik'
    };

    async function loadSponsorSegments(videoId) {
        if (!config.sponsorBlock || !videoId) return;

        sponsorSegments = [];
        markersRendered = false;
        clearSegmentMarkers();

        try {
            const categoriesParam = encodeURIComponent(JSON.stringify(config.skipCategories));
            const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${categoriesParam}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                sponsorSegments = data;
                console.log(`[OmarchyTube] Laddade ${data.length} SponsorBlock-segment.`);
                renderSegmentMarkers();
            }
        } catch (err) {
            // Video might have no segments or network error
        }
    }

    function clearSegmentMarkers() {
        document.querySelectorAll('.sb-segment-marker').forEach(m => m.remove());
    }

    function renderSegmentMarkers() {
        const video = document.querySelector('video');
        const progressBar = document.querySelector('.ytp-progress-bar');
        if (!video || !progressBar || !Number.isFinite(video.duration) || video.duration <= 0) return;
        if (sponsorSegments.length === 0) return;

        clearSegmentMarkers();

        for (const seg of sponsorSegments) {
            const [start, end] = seg.segment;
            const leftPct = (start / video.duration) * 100;
            const widthPct = Math.max(((end - start) / video.duration) * 100, 0.4);

            const marker = document.createElement('div');
            marker.className = `sb-segment-marker sb-segment-${seg.category}`;
            marker.style.left = `${leftPct}%`;
            marker.style.width = `${widthPct}%`;
            marker.title = `${categoryLabels[seg.category] || seg.category}: ${formatTime(start)} - ${formatTime(end)}`;

            progressBar.appendChild(marker);
        }
        markersRendered = true;
    }

    function checkSponsorBlock() {
        if (!config.sponsorBlock || sponsorSegments.length === 0) return;
        const video = document.querySelector('video');
        if (!video || video.paused) return;

        if (!markersRendered && Number.isFinite(video.duration) && video.duration > 0) {
            renderSegmentMarkers();
        }

        const currentTime = video.currentTime;
        for (const seg of sponsorSegments) {
            if (seg.UUID === ignoredSegmentUUID) continue;

            const [start, end] = seg.segment;
            // Trigger skip if within segment window
            if (currentTime >= start && currentTime < end - 0.25) {
                const prevTime = currentTime;
                video.currentTime = end;
                const catName = categoryLabels[seg.category] || seg.category;
                showToast(`⚡ Hoppade över ${catName} (${formatTime(start)} - ${formatTime(end)})`, () => {
                    ignoredSegmentUUID = seg.UUID;
                    video.currentTime = Math.max(start, prevTime);
                });
                break;
            }
        }
    }

    // Check sponsor block on time update and fast ticker
    setInterval(checkSponsorBlock, 250);

    // --- Module 3: Return YouTube Dislike (RYD) ---
    async function loadDislikes(videoId) {
        if (!config.returnDislike || !videoId) return;

        try {
            const url = `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                applyDislikesUI(data);
            }
        } catch (err) {
            console.warn('[OmarchyTube] Kunde inte hämta ogillanden:', err);
        }
    }

    function applyDislikesUI(data) {
        const dislikeButton = document.querySelector(
            'dislike-button-view-model button, .yt-spec-button-shape-next--segmented-dislike, #segmented-dislike-button button'
        );
        if (!dislikeButton) return;

        let dislikeCountSpan = dislikeButton.querySelector('.ryd-dislike-count');
        if (!dislikeCountSpan) {
            dislikeCountSpan = document.createElement('span');
            dislikeCountSpan.className = 'ryd-dislike-count';
            dislikeButton.appendChild(dislikeCountSpan);
        }

        const formatted = formatCount(data.dislikes);
        dislikeCountSpan.innerText = formatted;
        dislikeButton.setAttribute('aria-label', `Gillar inte (${data.dislikes.toLocaleString()} personer)`);
        dislikeButton.title = `Ogillanden: ${data.dislikes.toLocaleString()} (Betyg: ${data.rating.toFixed(2)}/5)`;

        // Add like/dislike ratio bar under button container
        const buttonRenderer = document.querySelector('like-button-view-model, ytd-segmented-like-dislike-button-renderer');
        if (buttonRenderer && data.likes + data.dislikes > 0) {
            let ratioBar = document.querySelector('.ryd-ratio-bar');
            if (!ratioBar) {
                ratioBar = document.createElement('div');
                ratioBar.className = 'ryd-ratio-bar';
                const likesFill = document.createElement('div');
                likesFill.className = 'ryd-ratio-likes';
                ratioBar.appendChild(likesFill);
                buttonRenderer.parentElement?.appendChild(ratioBar);
            }
            const likesFill = ratioBar.querySelector('.ryd-ratio-likes');
            const likePct = (data.likes / (data.likes + data.dislikes)) * 100;
            if (likesFill) {
                likesFill.style.width = `${likePct}%`;
            }
        }
    }

    // --- Navigation Watcher ---
    function checkUrlChange() {
        const match = window.location.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        const videoId = match ? match[1] : null;

        if (videoId && videoId !== currentVideoId) {
            console.log(`[OmarchyTube] Ny video upptäckt: ${videoId}`);
            currentVideoId = videoId;
            ignoredSegmentUUID = null;
            loadSponsorSegments(videoId);
            loadDislikes(videoId);
        } else if (!videoId && currentVideoId) {
            currentVideoId = null;
            sponsorSegments = [];
            clearSegmentMarkers();
        }
    }

    window.addEventListener('yt-navigate-finish', checkUrlChange);
    window.addEventListener('popstate', checkUrlChange);
    setInterval(checkUrlChange, 1000);

    // Initial check
    setTimeout(checkUrlChange, 500);
})();
