/**
 * OmarchyTube (ReVanced for Omarchy) - Injected Client Script
 * Implements: Ad-skipping, SponsorBlock, Return YouTube Dislike & UI enhancements
 */

(function () {
    if (window.__omarchy_revanced_loaded) return;
    window.__omarchy_revanced_loaded = true;

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
            undoBtn.innerText = 'Undo';
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
        selfpromo: 'Self Promotion',
        interaction: 'Interaction Reminder',
        music_offtopic: 'Non-Music Section'
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
                showToast(`⚡ Skipped ${catName} (${formatTime(start)} - ${formatTime(end)})`, () => {
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
            console.warn('[OmarchyTube] Could not fetch dislikes:', err);
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

    // --- Module 4: 100% Window Fit (Responsive Full Canvas) ---
    function enforce100PercentFit() {
        const c = document.getElementById('container');
        const bg = document.getElementById('app-background');
        if (c) {
            c.style.setProperty('width', '100vw', 'important');
            c.style.setProperty('height', '100vh', 'important');
            c.style.setProperty('margin', '0', 'important');
            c.style.setProperty('left', '0', 'important');
            c.style.setProperty('top', '0', 'important');
        }
        if (bg) {
            bg.style.setProperty('width', '100vw', 'important');
            bg.style.setProperty('height', '100vh', 'important');
            bg.style.setProperty('margin', '0', 'important');
            bg.style.setProperty('left', '0', 'important');
            bg.style.setProperty('top', '0', 'important');
        }
    }

    window.addEventListener('resize', enforce100PercentFit);
    setInterval(enforce100PercentFit, 500);
    enforce100PercentFit();

    // --- Module 5: Quick-Back Button & Video Exit ---
    function isWatchingVideo() {
        // TV mode watch page
        if (document.querySelector('ytlr-watch-page')) return true;

        // Desktop mode watch page
        if (window.location.href.includes('/watch') || document.querySelector('ytd-watch-flexy')) return true;

        // Active video playback with visible dimensions
        const v = document.querySelector('video');
        if (!v) return false;
        const rect = v.getBoundingClientRect();
        const hasSize = rect.width > 50 && rect.height > 50;
        const isPlaying = !v.paused || v.currentTime > 0 || (v.duration && v.duration > 0);
        return hasSize && isPlaying;
    }

    function exitCurrentVideo() {
        console.log('[OmarchyTube] Exiting current video and returning to feed...');
        try {
            const p = document.querySelector('.html5-video-player');
            if (p && typeof p.stopVideo === 'function') p.stopVideo();
            const v = document.querySelector('video');
            if (v) { v.pause(); v.currentTime = 0; }
        } catch (e) {}

        // 1. Call Electron main process bridge if available
        if (window.omarchyBridge && typeof window.omarchyBridge.exitVideo === 'function') {
            window.omarchyBridge.exitVideo();
            return;
        }

        // 2. Direct browser navigation fallback
        if (window.location.href.includes('/tv')) {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'https://www.youtube.com/tv';
            }
        } else {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'https://www.youtube.com';
            }
        }
    }

    // Expose globally for Electron main process
    window.exitCurrentVideo = exitCurrentVideo;

    let backButtonTimeout = null;

    function ensureBackButton() {
        let btn = document.getElementById('omarchy-back-button');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'omarchy-back-button';
            btn.type = 'button';
            btn.title = 'Backa ur video (Escape / Backspace)';

            // TrustedHTML-compliant SVG creation
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z');
            svg.appendChild(path);

            const span = document.createElement('span');
            span.textContent = 'Back';

            btn.appendChild(svg);
            btn.appendChild(span);

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                exitCurrentVideo();
            };
            btn.onpointerdown = (e) => {
                e.stopPropagation();
            };
            document.body.appendChild(btn);
        }
        return btn;
    }

    function onMouseMove() {
        const btn = ensureBackButton();
        if (!btn) return;

        if (isWatchingVideo()) {
            btn.classList.add('visible');
            clearTimeout(backButtonTimeout);
            backButtonTimeout = setTimeout(() => {
                const v = document.querySelector('video');
                // Hide after 3s of mouse inactivity unless video is paused
                if (v && !v.paused) {
                    btn.classList.remove('visible');
                }
            }, 3000);
        } else {
            btn.classList.remove('visible');
        }
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true });

    // Periodic check ONLY maintains DOM presence and cleans up if video ended
    setInterval(() => {
        ensureBackButton();
        if (!isWatchingVideo()) {
            const btn = document.getElementById('omarchy-back-button');
            if (btn) btn.classList.remove('visible');
        }
    }, 1000);

    // --- Module 6: Leanback Density ---
    // TV-läget ritar i rem från <html> och appen sätter rotstorleken efter
    // skärmbredden. Klassen gör browse- och söksidorna tätare (se Level 9 i
    // styles.css), men lämnar spelaren ifred: dess kontroller sitter i samma
    // rem-skala och blir oläsliga om de krymper med.
    function isTvBrowse() {
        return window.location.pathname.startsWith('/tv')
            && !window.location.hash.startsWith('#/watch');
    }

    function applyLeanbackDensity() {
        document.documentElement.classList.toggle('omarchy-leanback', isTvBrowse());
    }

    window.addEventListener('yt-navigate-finish', applyLeanbackDensity);
    setInterval(applyLeanbackDensity, 1000);
    applyLeanbackDensity();

    // --- Module 7: Key Hints on First Run ---
    // En TV-app har inga menyer att upptäcka tangenterna i. Visas en gång, och
    // försvinner vid första tangenttryck eller efter tolv sekunder.
    const KEY_HINTS = [
        ['\u2190 \u2192 \u2191 \u2193', 'Move'],
        ['Enter', 'Select'],
        ['Esc / Q', 'Back'],
        ['F2', 'Desktop mode'],
        ['F11', 'Fullscreen'],
    ];

    function showKeyHints() {
        if (localStorage.getItem('omarchy-hints-shown') === '1') return;
        if (document.getElementById('omarchy-key-hints')) return;
        if (!document.body) return;
        const box = document.createElement('div');
        box.id = 'omarchy-key-hints';
        // Element för element: YouTubes Trusted Types-CSP kastar på innerHTML
        // ("This document requires 'TrustedHTML' assignment"), och tipset
        // uteblev därför tyst i den byggda appen.
        for (const [keys, label] of KEY_HINTS) {
            const row = document.createElement('div');
            row.className = 'omarchy-hint-row';
            const kbd = document.createElement('kbd');
            kbd.textContent = keys;
            const span = document.createElement('span');
            span.textContent = label;
            row.append(kbd, span);
            box.append(row);
        }
        document.body.appendChild(box);
        requestAnimationFrame(() => box.classList.add('show'));

        const hide = () => {
            box.classList.remove('show');
            localStorage.setItem('omarchy-hints-shown', '1');
            window.removeEventListener('keydown', hide);
            setTimeout(() => box.remove(), 400);
        };
        window.addEventListener('keydown', hide);
        setTimeout(hide, 12000);
    }

    setTimeout(showKeyHints, 1500);

    // In-page keyboard handler for Escape, Backspace, and 'q'
    window.addEventListener('keydown', (e) => {
        const isInput = document.activeElement && (
            document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.isContentEditable
        );

        if (isInput && e.key !== 'Escape') return;

        if (e.key === 'Escape' || e.key === 'Backspace' || (e.key.toLowerCase() === 'q' && !isInput)) {
            if (isWatchingVideo()) {
                exitCurrentVideo();
                e.preventDefault();
            }
        }
    }, true);

    // Initial check
    setTimeout(checkUrlChange, 500);
})();
