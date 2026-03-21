document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.filter-nav button');
  const projects = document.querySelectorAll('.project');

  // 1. Filtering Logic
  // Out-animation duration must match the CSS .filtered-out transition (300ms).
  const FILTER_OUT_MS = 240;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const toShow = [];
      const toHide = [];

      projects.forEach(proj => {
        const tags = proj.dataset.tags.split(' ');
        if (filter === 'all' || tags.includes(filter)) {
          toShow.push(proj);
        } else {
          toHide.push(proj);
        }
      });

      // Step 1 — fade out cards that don't match.
      // Remove filtered-hidden first so they're in layout and have
      // something to animate from (can't fade what's display:none).
      toHide.forEach(proj => {
        proj.classList.remove('filtered-hidden');
        // Force a reflow so the browser registers the unhidden state
        // before we add filtered-out — otherwise the transition won't fire.
        proj.getBoundingClientRect();
        proj.classList.add('filtered-out');
      });

      // Step 2 — after out-animation completes, collapse hidden cards
      // and reveal incoming ones via the observer (which handles stagger).
      setTimeout(() => {
        toHide.forEach(proj => {
          proj.classList.add('filtered-hidden');
        });

        toShow.forEach(proj => {
          proj.classList.remove('filtered-out', 'filtered-hidden', 'is-visible');
          // filtered-in gives incoming cards their own transition timing
          proj.classList.add('filtered-in');
          observer.observe(proj);
          // Clean up helper class once it's done its job
          setTimeout(() => proj.classList.remove('filtered-in'), 320);
        });

        if (window.innerWidth < 1024) {
          window.scrollTo({
            top: document.querySelector('.timeline').offsetTop - 120,
            behavior: 'smooth'
          });
        }
      }, FILTER_OUT_MS);
    });
  });

  // 2. Intersection Observer (Scroll Reveal + Stagger)
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -10% 0px',
    threshold: 0.05
  };

  // Stagger interval between cards in the same batch (ms).
  // 80ms is perceptible but doesn't make the last card feel late —
  // at 9 cards max that's 640ms of total offset, well within the
  // 0.9s transition duration so cards are still overlapping in motion.
  const STAGGER_MS = 80;

  const observer = new IntersectionObserver((entries) => {
    // Filter to only newly-intersecting entries and sort top-to-bottom.
    // Sorting matters because IntersectionObserver doesn't guarantee
    // delivery order — without this, stagger direction would be random.
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

    visible.forEach((entry, batchIndex) => {
      const el = entry.target;
      const delay = batchIndex * STAGGER_MS;

      el.style.transitionDelay = `${delay}ms`;
      el.classList.add('is-visible');
      observer.unobserve(el);

      // Clear the inline delay once the transition finishes so it
      // doesn't affect anything that re-observes this element later.
      // Timeout = transition duration (900ms) + this card's delay.
      setTimeout(() => {
        el.style.transitionDelay = '';
      }, 900 + delay);
    });
  }, observerOptions);

  projects.forEach(p => observer.observe(p));

  // 3. Dynamic System Header
  // Force Seattle time regardless of viewer's locale
  function getSeattleHour() {
    return parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      hour12: false
    }));
  }

  function getStatus() {
    const h = getSeattleHour();
    return (h >= 8 && h < 18) ? 'STATUS_ACTIVE' : 'STATUS_STANDBY';
  }

  // 4. Text Scramble
  const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_/.';
  const TICK_MS = 25;
  const SCRAMBLE_DEPTH = 6;

  let scrambleInterval = null;

  function scrambleText(element, targetText) {
    if (scrambleInterval) clearInterval(scrambleInterval);

    let tick = 0;
    const totalTicks = SCRAMBLE_DEPTH + targetText.length;

    scrambleInterval = setInterval(() => {
      let out = '';
      for (let i = 0; i < targetText.length; i++) {
        if (targetText[i] === ' ') {
          out += ' ';
        } else if (i <= tick - SCRAMBLE_DEPTH) {
          out += targetText[i];
        } else {
          out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      element.textContent = out;
      tick++;

      if (tick > totalTicks) {
        clearInterval(scrambleInterval);
        scrambleInterval = null;
        element.textContent = targetText;
      }
    }, TICK_MS);
  }

  function updateSystemStatus() {
    const statusText = document.querySelector('.status-text');
    if (!statusText) return;

    const timeStr = new Date().toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    const status = getStatus();

    const targetString = window.innerWidth < 768
      ? `${timeStr} // ${status}`
      : `SEATTLE, WA // SYS_T_MIN_${timeStr} // ${status}`;

    scrambleText(statusText, targetString);
  }

  updateSystemStatus();
  setInterval(updateSystemStatus, 10000);



  // 5. Custom Audio Players + Oscilloscope Visualizer
  // Each player gets its own AudioContext initialized on first play
  // (browsers block AudioContext creation before a user gesture).
  // Multiple players are mutually exclusive — playing one pauses others.

  const audioContainers = document.querySelectorAll('.media-container.type-audio');
  const allPlayers = [];

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Draw a flat idle line on the canvas — called before AudioContext init
  // and after pause so there's always something visible.
  function drawFlatLine(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Idle baseline — opacity matches card border weight so it reads
    // as instrumentation rather than empty space
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(134, 134, 139, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]); // dashed at idle — solid when playing
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash for any subsequent draws
  }

  // Size canvas to physical pixels for crisp retina rendering.
  // Called once on init and again if the window resizes.
  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.getContext('2d').scale(dpr, dpr);
  }

  audioContainers.forEach(container => {
    const audio    = container.querySelector('audio');
    const playBtn  = container.querySelector('.audio-play-btn');
    const playIcon = container.querySelector('.audio-play-icon');
    const fill     = container.querySelector('.audio-fill');
    const progress = container.querySelector('.audio-progress');
    const timeEl   = container.querySelector('.audio-time');
    const canvas   = container.querySelector('.audio-visualizer');
    const src      = container.dataset.src;

    let audioCtx   = null;
    let analyser   = null;
    let animFrame  = null;

    // Size canvas and draw idle line immediately
    sizeCanvas(canvas);
    drawFlatLine(canvas);

    if (src) {
      audio.src = src;
      playBtn.disabled = false;
    }

    allPlayers.push({ audio, playBtn, playIcon, canvas, stopViz });

    // Initialize Web Audio API on first play — must be after user gesture
    function initAudioContext() {
      if (audioCtx) return;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      // fftSize 2048 gives 1024 data points — smooth line without excess noise
      analyser.fftSize = 2048;
      // Higher smoothing = cleaner oscilloscope trace, less chaotic noise
      analyser.smoothingTimeConstant = 0.92;
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
    }

    // Live oscilloscope draw loop — runs only while playing
    function startViz() {
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d');
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      function draw() {
        animFrame = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Baseline — drawn first so waveform renders on top
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(134, 134, 139, 0.2)';
        ctx.lineWidth = 1;
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#5b8266';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';

        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          // dataArray values are 0–255, 128 = zero crossing (flat line)
          const v = dataArray[i] / 128.0;
          const y = (v * h) / 2;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          x += sliceWidth;
        }

        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      draw();
    }

    function stopViz() {
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
      drawFlatLine(canvas);
    }

    // Play / pause toggle
    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        // Pause all other players
        allPlayers.forEach(p => {
          if (p.audio !== audio && !p.audio.paused) {
            p.audio.pause();
            p.playBtn.classList.remove('is-playing');
            p.playIcon.textContent = '▶';
            p.stopViz();
          }
        });
        initAudioContext();
        audio.play();
        playBtn.classList.add('is-playing');
        playIcon.textContent = '⏸';
        startViz();
      } else {
        audio.pause();
        playBtn.classList.remove('is-playing');
        playIcon.textContent = '▶';
        stopViz();
      }
    });

    audio.addEventListener('timeupdate', () => {
      if (!audio.duration) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      fill.style.width = `${pct}%`;
      timeEl.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
      progress.setAttribute('aria-valuenow', Math.round(pct));
    });

    audio.addEventListener('loadedmetadata', () => {
      timeEl.textContent = `00:00 / ${formatTime(audio.duration)}`;
    });

    audio.addEventListener('ended', () => {
      playBtn.classList.remove('is-playing');
      playIcon.textContent = '▶';
      fill.style.width = '0%';
      timeEl.textContent = `00:00 / ${formatTime(audio.duration)}`;
      stopViz();
    });

    // Scrub on click
    progress.addEventListener('click', e => {
      if (!audio.duration) return;
      const rect = progress.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });

    // Re-size canvas on window resize so the waveform doesn't stretch
    window.addEventListener('resize', () => {
      sizeCanvas(canvas);
      if (audio.paused) drawFlatLine(canvas);
      // If playing, the draw loop will naturally redraw next frame
    });
  });

  // 6. Platform Tab Switcher (podcast embeds)

  // 7. Twitch Live Status
  // Client credentials flow: fetch app access token, then poll stream status.
  // Token is cached in memory for the session — re-fetched only on expiry.
  // Polls every 60 seconds. Badge appears/disappears based on live state.

  const TWITCH_CLIENT_ID     = 'nzwdzxpnnkga4qhh1h6a543ekj204z';
  const TWITCH_CLIENT_SECRET = 'j2q6nru1cqc4xexwgakhibwv5h5myx';
  const TWITCH_CHANNEL       = 'rawwwley';
  const POLL_INTERVAL_MS     = 60000;

  // Platform config — Twitch is auto-detected via API and always present.
  // Set youtube: false on sessions where you're not simulcasting.
  const STREAM_PLATFORMS = {
    twitch:  { label: 'TWITCH',  url: 'https://www.twitch.tv/rawwwley' },
    youtube: { label: 'YOUTUBE', url: 'https://www.youtube.com/@rawwwleyy/live', active: true }
  };

  // Build the links row from STREAM_PLATFORMS config.
  // Called once — re-runs if config changes at runtime.
  function buildLiveLinks() {
    const container = document.getElementById('liveLinks');
    if (!container) return;
    container.innerHTML = '';

    const activePlatforms = [
      STREAM_PLATFORMS.twitch,
      ...(STREAM_PLATFORMS.youtube.active ? [STREAM_PLATFORMS.youtube] : [])
    ];

    activePlatforms.forEach((platform, i) => {
      const a = document.createElement('a');
      a.href = platform.url;
      a.textContent = platform.label;
      a.target = '_blank';
      a.rel = 'noopener';
      container.appendChild(a);

      // Add separator between links, not after the last one
      if (i < activePlatforms.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'live-sep';
        sep.textContent = '/';
        container.appendChild(sep);
      }
    });
  }

  buildLiveLinks();

  let twitchToken    = null;
  let twitchTokenExp = 0; // unix ms timestamp of expiry

  async function fetchTwitchToken() {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
    const data = await res.json();
    twitchToken    = data.access_token;
    // expires_in is in seconds — store as ms with 60s buffer
    twitchTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  }

  async function checkLiveStatus() {
    const badge = document.getElementById('liveBadge');
    if (!badge) return;

    try {
      // Re-fetch token if missing or within 60s of expiry
      if (!twitchToken || Date.now() >= twitchTokenExp) {
        await fetchTwitchToken();
      }

      const res = await fetch(
        `https://api.twitch.tv/helix/streams?user_login=${TWITCH_CHANNEL}`,
        {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${twitchToken}`
          }
        }
      );

      if (!res.ok) {
        // 401 means token expired early — clear and retry next poll
        if (res.status === 401) twitchToken = null;
        throw new Error(`Stream check failed: ${res.status}`);
      }

      const data = await res.json();
      // data.data is non-empty when channel is live
      const isLive = data.data && data.data.length > 0;
      badge.classList.toggle('is-live', isLive);

      // Also toggle the compact header indicator for mobile/tablet
      const headerLive = document.getElementById('headerLive');
      if (headerLive) headerLive.classList.toggle('is-live', isLive);

    } catch (err) {
      // Fail silently — badge stays hidden on network errors
      console.warn('Twitch status check failed:', err.message);
    }
  }

  checkLiveStatus();
  setInterval(checkLiveStatus, POLL_INTERVAL_MS);

});