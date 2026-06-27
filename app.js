// ==========================================
// Guitar Practice Video Looper
// ==========================================

(function () {
    'use strict';

    // State
    let playerType = null; // 'youtube' or 'local'
    let ytPlayer = null;
    let localVideo = null;
    let duration = 0;
    let loopStart = null;
    let loopEnd = null;
    let loopEnabled = true;
    let isPlaying = false;
    let animFrameId = null;
    let ytReady = false;
    let ytAPILoaded = false;

    // DOM elements
    const youtubeUrlInput = document.getElementById('youtube-url');
    const loadYoutubeBtn = document.getElementById('load-youtube');
    const fileInput = document.getElementById('file-input');
    const filePickerBtn = document.getElementById('file-picker-btn');
    const dropZone = document.getElementById('drop-zone');
    const playerContainer = document.getElementById('player-container');
    const youtubePlayerWrapper = document.getElementById('youtube-player-wrapper');
    const localPlayer = document.getElementById('local-player');
    const timeline = document.getElementById('timeline');
    const timelineProgress = document.getElementById('timeline-progress');
    const loopRegion = document.getElementById('loop-region');
    const markerA = document.getElementById('marker-a');
    const markerB = document.getElementById('marker-b');
    const playhead = document.getElementById('playhead');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const setABtn = document.getElementById('set-a-btn');
    const setBBtn = document.getElementById('set-b-btn');
    const clearLoopBtn = document.getElementById('clear-loop-btn');
    const toggleLoopBtn = document.getElementById('toggle-loop-btn');
    const loopStartDisplay = document.getElementById('loop-start-display');
    const loopEndDisplay = document.getElementById('loop-end-display');
    const tabs = document.querySelectorAll('.tab');
    const youtubeInput = document.getElementById('youtube-input');
    const localInput = document.getElementById('local-input');
    const speedBtns = document.querySelectorAll('.speed-btn');

    // ==========================================
    // Tab switching
    // ==========================================
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (tab.dataset.source === 'youtube') {
                youtubeInput.classList.remove('hidden');
                localInput.classList.add('hidden');
            } else {
                youtubeInput.classList.add('hidden');
                localInput.classList.remove('hidden');
            }
        });
    });

    // ==========================================
    // YouTube loading
    // ==========================================
    function extractYouTubeId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    function loadYouTubeAPI() {
        return new Promise((resolve, reject) => {
            // Check if opened from file:// protocol
            if (window.location.protocol === 'file:') {
                reject(new Error('file-protocol'));
                return;
            }

            if (window.YT && window.YT.Player) {
                resolve();
                return;
            }

            if (ytAPILoaded) {
                // Script already added, wait for it
                const check = setInterval(() => {
                    if (window.YT && window.YT.Player) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
                return;
            }

            ytAPILoaded = true;
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            tag.onerror = () => reject(new Error('Failed to load YouTube API'));
            document.head.appendChild(tag);
            window.onYouTubeIframeAPIReady = resolve;
        });
    }

    async function loadYouTubeVideo(videoId) {
        try {
            await loadYouTubeAPI();
        } catch (err) {
            if (err.message === 'file-protocol') {
                showError(
                    'YouTube videos require a local server. ' +
                    'Run "npx serve" or "python -m http.server" in this folder, ' +
                    'then open http://localhost:3000 (or :8000) in your browser.'
                );
                return;
            }
            showError('Failed to load YouTube API. Check your internet connection.');
            return;
        }

        resetState();
        playerType = 'youtube';
        playerContainer.classList.remove('hidden');
        youtubePlayerWrapper.classList.remove('hidden');
        localPlayer.classList.add('hidden');

        // The YT API replaces the target element, so we need a fresh div each time
        const wrapper = document.getElementById('youtube-player-wrapper');
        const oldPlayer = document.getElementById('youtube-player');
        if (oldPlayer) oldPlayer.remove();
        const newDiv = document.createElement('div');
        newDiv.id = 'youtube-player';
        wrapper.appendChild(newDiv);

        if (ytPlayer && typeof ytPlayer.destroy === 'function') {
            try { ytPlayer.destroy(); } catch (e) { /* ignore */ }
        }

        ytPlayer = new YT.Player('youtube-player', {
            videoId: videoId,
            playerVars: {
                controls: 0,
                disablekb: 1,
                modestbranding: 1,
                rel: 0,
                origin: window.location.origin
            },
            events: {
                onReady: onYTReady,
                onStateChange: onYTStateChange,
                onError: onYTError
            }
        });
    }

    function onYTReady() {
        ytReady = true;
        duration = ytPlayer.getDuration();
        totalTimeEl.textContent = formatTime(duration);
        startUpdateLoop();
    }

    function onYTStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            isPlaying = true;
        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            isPlaying = false;
        }
        updatePlayButton();
    }

    function onYTError(event) {
        const code = event.data;
        const messages = {
            2: 'Invalid video ID.',
            5: 'This video cannot be played in an embedded player.',
            100: 'Video not found or has been removed.',
            101: 'This video is restricted from embedded playback by the owner.',
            150: 'This video is restricted from embedded playback by the owner.'
        };
        showError(messages[code] || `YouTube error ${code}. Try a different video.`);
    }

    function showError(msg) {
        // Show error message to user
        let errorEl = document.getElementById('error-message');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'error-message';
            errorEl.style.cssText = 'background:#4a1525;color:#ff6b8a;padding:12px 16px;border-radius:8px;margin:10px 0;font-size:0.9rem;border:1px solid #6b2040;';
            playerContainer.parentElement.insertBefore(errorEl, playerContainer);
        }
        errorEl.textContent = '⚠️ ' + msg;
        errorEl.style.display = 'block';

        // Auto-hide after 10 seconds
        setTimeout(() => { if (errorEl) errorEl.style.display = 'none'; }, 10000);
    }

    loadYoutubeBtn.addEventListener('click', () => {
        const url = youtubeUrlInput.value.trim();
        const videoId = extractYouTubeId(url);
        if (videoId) {
            // Clear any existing error
            const errorEl = document.getElementById('error-message');
            if (errorEl) errorEl.style.display = 'none';
            loadYouTubeVideo(videoId);
        } else {
            alert('Please enter a valid YouTube URL');
        }
    });

    youtubeUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loadYoutubeBtn.click();
        }
    });

    // ==========================================
    // Local file loading
    // ==========================================
    function loadLocalFile(file) {
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file');
            return;
        }

        resetState();
        playerType = 'local';
        playerContainer.classList.remove('hidden');
        youtubePlayerWrapper.classList.add('hidden');
        localPlayer.classList.remove('hidden');

        const url = URL.createObjectURL(file);
        localPlayer.src = url;
        localVideo = localPlayer;

        localPlayer.addEventListener('loadedmetadata', () => {
            duration = localPlayer.duration;
            totalTimeEl.textContent = formatTime(duration);
            startUpdateLoop();
        }, { once: true });
    }

    filePickerBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) loadLocalFile(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadLocalFile(e.dataTransfer.files[0]);
    });

    // ==========================================
    // Playback controls
    // ==========================================
    function getCurrentTime() {
        if (playerType === 'youtube' && ytPlayer && ytReady) {
            return ytPlayer.getCurrentTime();
        } else if (playerType === 'local' && localVideo) {
            return localVideo.currentTime;
        }
        return 0;
    }

    function seekTo(time) {
        if (playerType === 'youtube' && ytPlayer && ytReady) {
            ytPlayer.seekTo(time, true);
        } else if (playerType === 'local' && localVideo) {
            localVideo.currentTime = time;
        }
    }

    function play() {
        if (playerType === 'youtube' && ytPlayer && ytReady) {
            ytPlayer.playVideo();
        } else if (playerType === 'local' && localVideo) {
            localVideo.play();
        }
        isPlaying = true;
        updatePlayButton();
    }

    function pause() {
        if (playerType === 'youtube' && ytPlayer && ytReady) {
            ytPlayer.pauseVideo();
        } else if (playerType === 'local' && localVideo) {
            localVideo.pause();
        }
        isPlaying = false;
        updatePlayButton();
    }

    function stop() {
        pause();
        seekTo(loopStart !== null ? loopStart : 0);
    }

    function togglePlay() {
        if (isPlaying) pause();
        else play();
    }

    function setPlaybackRate(rate) {
        if (playerType === 'youtube' && ytPlayer && ytReady) {
            ytPlayer.setPlaybackRate(rate);
        } else if (playerType === 'local' && localVideo) {
            localVideo.playbackRate = rate;
        }

        speedBtns.forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.speed) === rate);
        });
    }

    function updatePlayButton() {
        playBtn.textContent = isPlaying ? '⏸️' : '▶️';
    }

    playBtn.addEventListener('click', togglePlay);
    stopBtn.addEventListener('click', stop);

    speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setPlaybackRate(parseFloat(btn.dataset.speed));
        });
    });

    // ==========================================
    // Loop controls
    // ==========================================
    function setLoopStart() {
        loopStart = getCurrentTime();
        if (loopEnd !== null && loopStart >= loopEnd) {
            loopEnd = null;
        }
        updateLoopDisplay();
    }

    function setLoopEnd() {
        loopEnd = getCurrentTime();
        if (loopStart !== null && loopEnd <= loopStart) {
            loopStart = null;
        }
        updateLoopDisplay();
    }

    function clearLoop() {
        loopStart = null;
        loopEnd = null;
        updateLoopDisplay();
    }

    function toggleLoop() {
        loopEnabled = !loopEnabled;
        toggleLoopBtn.classList.toggle('active', loopEnabled);
        toggleLoopBtn.textContent = loopEnabled ? '🔁 Loop On' : '🔁 Loop Off';
    }

    function updateLoopDisplay() {
        loopStartDisplay.textContent = loopStart !== null ? formatTime(loopStart) : '--';
        loopEndDisplay.textContent = loopEnd !== null ? formatTime(loopEnd) : '--';

        if (loopStart !== null && loopEnd !== null && duration > 0) {
            const leftPercent = (loopStart / duration) * 100;
            const widthPercent = ((loopEnd - loopStart) / duration) * 100;
            loopRegion.style.left = leftPercent + '%';
            loopRegion.style.width = widthPercent + '%';
            loopRegion.style.display = 'block';
            markerA.style.left = leftPercent + '%';
            markerA.style.display = 'block';
            markerB.style.left = (leftPercent + widthPercent) + '%';
            markerB.style.display = 'block';
        } else if (loopStart !== null && duration > 0) {
            const leftPercent = (loopStart / duration) * 100;
            markerA.style.left = leftPercent + '%';
            markerA.style.display = 'block';
            markerB.style.display = 'none';
            loopRegion.style.display = 'none';
        } else if (loopEnd !== null && duration > 0) {
            const leftPercent = (loopEnd / duration) * 100;
            markerB.style.left = leftPercent + '%';
            markerB.style.display = 'block';
            markerA.style.display = 'none';
            loopRegion.style.display = 'none';
        } else {
            loopRegion.style.display = 'none';
            markerA.style.display = 'none';
            markerB.style.display = 'none';
        }
    }

    setABtn.addEventListener('click', setLoopStart);
    setBBtn.addEventListener('click', setLoopEnd);
    clearLoopBtn.addEventListener('click', clearLoop);
    toggleLoopBtn.addEventListener('click', toggleLoop);

    // ==========================================
    // Timeline interaction
    // ==========================================
    timeline.addEventListener('click', (e) => {
        const rect = timeline.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const time = percent * duration;
        seekTo(time);
    });

    // ==========================================
    // Update loop (animation frame)
    // ==========================================
    function startUpdateLoop() {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        updateFrame();
    }

    function updateFrame() {
        const currentTime = getCurrentTime();

        // Update playhead and time display
        if (duration > 0) {
            const percent = (currentTime / duration) * 100;
            playhead.style.left = percent + '%';
            timelineProgress.style.width = percent + '%';
        }
        currentTimeEl.textContent = formatTime(currentTime);

        // Loop enforcement
        if (loopEnabled && loopStart !== null && loopEnd !== null && isPlaying) {
            if (currentTime >= loopEnd) {
                seekTo(loopStart);
            }
        }

        animFrameId = requestAnimationFrame(updateFrame);
    }

    // ==========================================
    // Keyboard shortcuts
    // ==========================================
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                togglePlay();
                break;
            case 'a':
                setLoopStart();
                break;
            case 'b':
                setLoopEnd();
                break;
            case 'c':
                clearLoop();
                break;
            case 'l':
                toggleLoop();
                break;
            case 'arrowleft':
                seekTo(Math.max(0, getCurrentTime() - 5));
                break;
            case 'arrowright':
                seekTo(Math.min(duration, getCurrentTime() + 5));
                break;
            case '-':
            case '_':
                adjustSpeed(-1);
                break;
            case '=':
            case '+':
                adjustSpeed(1);
                break;
        }
    });

    function adjustSpeed(direction) {
        const speeds = [0.25, 0.5, 0.75, 1, 1.25];
        const currentActive = document.querySelector('.speed-btn.active');
        const currentSpeed = currentActive ? parseFloat(currentActive.dataset.speed) : 1;
        const currentIndex = speeds.indexOf(currentSpeed);
        const newIndex = Math.max(0, Math.min(speeds.length - 1, currentIndex + direction));
        setPlaybackRate(speeds[newIndex]);
    }

    // ==========================================
    // Helpers
    // ==========================================
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === null) return '--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function resetState() {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        loopStart = null;
        loopEnd = null;
        duration = 0;
        isPlaying = false;
        ytReady = false;
        updateLoopDisplay();
        updatePlayButton();
        currentTimeEl.textContent = '0:00';
        totalTimeEl.textContent = '0:00';
        playhead.style.left = '0%';
        timelineProgress.style.width = '0%';
    }

    // ==========================================
    // Startup check
    // ==========================================
    if (window.location.protocol === 'file:') {
        showError(
            'Opened from file://. YouTube videos won\'t work. ' +
            'Run "npx serve" in this folder and open http://localhost:3000 instead. ' +
            'Local video files will still work fine.'
        );
    }

})();
