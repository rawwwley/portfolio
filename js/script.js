document.addEventListener('DOMContentLoaded', () => {
  const buttons  = document.querySelectorAll('.filter-nav button');
  const projects = document.querySelectorAll('.project');

  // Checked once at load — used throughout to skip animations for users
  // who have requested reduced motion in their OS accessibility settings.
  // Affects: stagger delays, text scramble, oscilloscope draw loop.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Filtering Logic
  // Out-animation duration must match the CSS .filtered-out transition (240ms).
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
        proj.getBoundingClientRect(); // force reflow so transition fires
        proj.classList.add('filtered-out');
      });

      // Step 2 — collapse hidden cards and reveal incoming ones.
      setTimeout(() => {
        toHide.forEach(proj => {
          proj.classList.add('filtered-hidden');
        });

        toShow.forEach(proj => {
          proj.classList.remove('filtered-out', 'filtered-hidden', 'is-visible');
          // filtered-in gives incoming cards their own transition timing
          proj.classList.add('filtered-in');
          observer.observe(proj);
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

  // 80ms stagger — perceptible but the last card in a 9-card batch is only
  // 640ms delayed, well within the 0.9s transition so cards overlap in motion.
  const STAGGER_MS = 80;

  const observer = new IntersectionObserver((entries) => {
    // Sort top-to-bottom — IntersectionObserver doesn't guarantee delivery order.
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

    visible.forEach((entry, batchIndex) => {
      const el = entry.target;
      // Skip stagger for reduced-motion users — all cards appear instantly
      const delay = prefersReducedMotion ? 0 : batchIndex * STAGGER_MS;

      el.style.transitionDelay = `${delay}ms`;
      el.classList.add('is-visible');
      observer.unobserve(el);

      // Clear inline delay once transition finishes so it doesn't
      // affect elements that get re-observed later (e.g. after filtering).
      setTimeout(() => {
        el.style.transitionDelay = '';
      }, 900 + delay);
    });
  }, observerOptions);

  projects.forEach(p => observer.observe(p));

  // 3. Dynamic System Header
  // Force Seattle time regardless of viewer's locale.
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
  // Resolves random chars to target string left-to-right.
  // SCRAMBLE_DEPTH controls how many ticks a char stays noisy before locking.
  const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_/.';
  const TICK_MS        = 25;
  const SCRAMBLE_DEPTH = 6;

  // Global interval for the header scramble — one at a time.
  let scrambleInterval = null;

  function scrambleText(element, targetText) {
    // Skip animation for reduced-motion users — set text directly
    if (prefersReducedMotion) {
      element.textContent = targetText;
      return;
    }

    if (scrambleInterval) clearInterval(scrambleInterval);

    let tick = 0;
    const totalTicks = SCRAMBLE_DEPTH + targetText.length;

    scrambleInterval = setInterval(() => {
      let out = '';
      for (let i = 0; i < targetText.length; i++) {
        if (targetText[i] === ' ') {
          out += ' ';
        } else if (i <= tick - SCRAMBLE_DEPTH) {
          out += targetText[i]; // locked — real char visible
        } else {
          out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      }
      element.textContent = out;
      tick++;

      if (tick > totalTicks) {
        clearInterval(scrambleInterval);
        scrambleInterval = null;
        element.textContent = targetText; // guarantee exact final string
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
  // Text row is the play/pause control — no button element.
  // Label scrambles between PLAY and PAUSE on every toggle.
  // Multiple players are mutually exclusive — playing one pauses others.
  // AudioContext is initialised on first play (browser gesture gate).
  // Safari fix: resume() called before every play — Safari can suspend
  // the context even after a user gesture has been registered.

  const audioContainers = document.querySelectorAll('.media-container.type-audio');
  const allPlayers      = [];

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Flat idle line — dashed at rest, replaced by live waveform when playing
  function drawFlatLine(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const ctx  = canvas.getContext('2d');
    const w    = canvas.width / dpr;
    const h    = canvas.height / dpr;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(134, 134, 139, 0.5)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 6]);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Size canvas to physical pixels for crisp retina rendering.
  // Called once on init and on window resize.
  function sizeCanvas(canvas) {
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    canvas.getContext('2d').scale(dpr, dpr);
  }

  audioContainers.forEach(container => {
    const audio    = container.querySelector('audio');
    const titleEl  = container.querySelector('.audio-title');
    const fill     = container.querySelector('.audio-fill');
    const progress = container.querySelector('.audio-progress');
    const timeEl   = container.querySelector('.audio-time');
    const canvas   = container.querySelector('.audio-visualizer');
    const controls = container.querySelector('.audio-controls');
    const src      = container.dataset.src;

    let audioCtx    = null;
    let analyser    = null;
    let animFrame   = null;
    // Per-player scramble interval — isolated from the global header scramble
    let labelScramble = null;

    sizeCanvas(canvas);
    drawFlatLine(canvas);

    if (src) {
      audio.src = src;
      controls.style.cursor = 'pointer';
    }

    // Scramble the audio label to a target string.
    // Uses the same SCRAMBLE_CHARS/TICK_MS/DEPTH as the header scramble
    // but runs its own interval so they never stomp each other.
    function scrambleLabel(target) {
      // Skip animation for reduced-motion users
      if (prefersReducedMotion) {
        titleEl.textContent = target;
        return;
      }

      if (labelScramble) clearInterval(labelScramble);
      let tick = 0;
      const totalTicks = SCRAMBLE_DEPTH + target.length;

      labelScramble = setInterval(() => {
        let out = '';
        for (let i = 0; i < target.length; i++) {
          if (target[i] === ' ') {
            out += ' ';
          } else if (i <= tick - SCRAMBLE_DEPTH) {
            out += target[i];
          } else {
            out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          }
        }
        titleEl.textContent = out;
        tick++;
        if (tick > totalTicks) {
          clearInterval(labelScramble);
          labelScramble = null;
          titleEl.textContent = target;
        }
      }, TICK_MS);
    }

    // Reset to idle — scrambles back to PLAY, stops visualiser
    function setIdle() {
      titleEl.classList.remove('is-playing');
      scrambleLabel('PLAY');
      stopViz();
    }

    allPlayers.push({ audio, setIdle, canvas });

    function initAudioContext() {
      if (audioCtx) {
        // Safari can suspend the context even after a user gesture —
        // always attempt to resume before playing
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
      }
      audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      analyser  = audioCtx.createAnalyser();
      analyser.fftSize               = 2048;
      analyser.smoothingTimeConstant = 0.92;
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
    }

    // Live oscilloscope — runs only while playing.
    // Skipped for reduced-motion users (flat line stays visible instead).
    function startViz() {
      if (prefersReducedMotion) return;

      const dpr          = window.devicePixelRatio || 1;
      const ctx          = canvas.getContext('2d');
      const bufferLength = analyser.frequencyBinCount;
      const dataArray    = new Uint8Array(bufferLength);
      const w            = canvas.width  / dpr;
      const h            = canvas.height / dpr;

      function draw() {
        animFrame = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Baseline — drawn first so waveform renders on top
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(134, 134, 139, 0.2)';
        ctx.lineWidth   = 1;
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = '#5b8266'; // direct hex — var() not available in canvas 2D
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';

        const sliceWidth = w / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          // dataArray values are 0–255; 128 = zero crossing (flat line)
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

    // Text row is the play/pause control
    controls.addEventListener('click', () => {
      if (!src) return;

      if (audio.paused) {
        // Pause all other players before starting this one
        allPlayers.forEach(p => {
          if (p.audio !== audio && !p.audio.paused) {
            p.audio.pause();
            p.setIdle();
          }
        });

        initAudioContext();

        // audio.play() returns a Promise — catch rejects to handle
        // autoplay policy blocks or missing files gracefully
        audio.play().catch(err => {
          console.warn('Audio playback failed:', err.message);
          setIdle(); // reset label and visualiser on failure
        });

        titleEl.classList.add('is-playing');
        scrambleLabel('PAUSE');
        startViz();
      } else {
        audio.pause();
        setIdle();
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
      fill.style.width   = '0%';
      timeEl.textContent = `00:00 / ${formatTime(audio.duration)}`;
      setIdle();
    });

    // Scrub bar is a separate click target from the controls row
    progress.addEventListener('click', e => {
      if (!audio.duration) return;
      const rect = progress.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
  });

  // Single debounced resize handler — registering inside forEach creates N listeners
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      allPlayers.forEach(({ audio, canvas }) => {
        sizeCanvas(canvas);
        // If paused, redraw idle line at new dimensions.
        // If playing, the draw loop redraws on the next rAF tick naturally.
        if (audio.paused) drawFlatLine(canvas);
      });
    }, 100);
  });

  // 6. Platform Tab Switcher (podcast embeds)
  // Finds the iframe in the immediately following .media-container sibling.
  document.querySelectorAll('.platform-tabs').forEach(tabGroup => {
    const iframe = tabGroup.nextElementSibling?.querySelector('iframe');

    tabGroup.querySelectorAll('.platform-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.disabled || !tab.dataset.embed) return;

        tabGroup.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (iframe) iframe.src = tab.dataset.embed;
      });
    });
  });

  // 7. Code Block Tab Switcher
  // Each .code-tabs group controls pre elements inside its immediately
  // following .media-container.type-code sibling.
  // Inactive pres get .code-hidden (visibility: hidden, still in layout)
  // rather than display: none (removes from layout).
  // This keeps the container height stable — always sized by the tallest tab.
  document.querySelectorAll('.code-tabs').forEach(tabGroup => {
    const codeBlock = tabGroup.nextElementSibling;

    tabGroup.querySelectorAll('.code-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.target;

        tabGroup.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        codeBlock.querySelectorAll('pre').forEach(pre => {
          pre.classList.toggle('code-hidden', pre.id !== targetId);
        });
      });
    });
  });

  // 7b. Copy Button
  // Clipboard API requires HTTPS or localhost — works on GitHub Pages, not file://.
  document.querySelectorAll('.code-copy-btn').forEach(btn => {
    let resetTimeout;

    btn.addEventListener('click', async () => {
      const codeBlock  = btn.closest('.code-tabs').nextElementSibling;
      const visiblePre = codeBlock.querySelector('pre:not(.code-hidden)');
      if (!visiblePre || !navigator.clipboard) return;

      try {
        await navigator.clipboard.writeText(visiblePre.textContent);
        btn.textContent = 'COPIED';
        btn.classList.add('is-copied');
        clearTimeout(resetTimeout);
        resetTimeout = setTimeout(() => {
          btn.textContent = 'COPY';
          btn.classList.remove('is-copied');
        }, 2000);
      } catch {
        // Clipboard write failed (permissions denied, etc.) — fail silently
      }
    });
  });

  // 8. Twitch Live Status
  // Client credentials flow: app access token cached in memory, re-fetched on expiry.
  // Polls every 60s. Badge appears/disappears based on live state.
  //
  // SECURITY NOTE: client_secret is readable by anyone who views source.
  // Risk is limited (public read-only stream status data), but architecturally wrong.
  // [ACTION] Rotate the secret at https://dev.twitch.tv/console/apps — especially
  // if this repo is or ever was public. Rotating resets the clock but doesn't fix
  // the underlying exposure. Real fix: serverless proxy (Netlify/Vercel functions)
  // at the Astro migration when a deployment pipeline is added.

  const TWITCH_CLIENT_ID     = 'nzwdzxpnnkga4qhh1h6a543ekj204z';
  const TWITCH_CLIENT_SECRET = 'j2q6nru1cqc4xexwgakhibwv5h5myx';
  const TWITCH_CHANNEL       = 'rawwwley';
  const POLL_INTERVAL_MS     = 60000;

  // [SWAP] Set youtube.active: false on sessions where you're not simulcasting.
  const STREAM_PLATFORMS = {
    twitch:  { label: 'TWITCH',  url: 'https://www.twitch.tv/rawwwley' },
    youtube: { label: 'YOUTUBE', url: 'https://www.youtube.com/@rawwwleyy/live', active: true }
  };

  function buildLiveLinks() {
    const container = document.getElementById('liveLinks');
    if (!container) return;
    container.innerHTML = '';

    const activePlatforms = [
      STREAM_PLATFORMS.twitch,
      ...(STREAM_PLATFORMS.youtube.active ? [STREAM_PLATFORMS.youtube] : [])
    ];

    activePlatforms.forEach((platform, i) => {
      const a   = document.createElement('a');
      a.href    = platform.url;
      a.textContent = platform.label;
      a.target  = '_blank';
      // noreferrer prevents destination from reading referrer URL; implies noopener
      a.rel     = 'noopener noreferrer';
      container.appendChild(a);

      if (i < activePlatforms.length - 1) {
        const sep       = document.createElement('span');
        sep.className   = 'live-sep';
        sep.textContent = '/';
        container.appendChild(sep);
      }
    });
  }

  buildLiveLinks();

  let twitchToken    = null;
  let twitchTokenExp = 0;

  async function fetchTwitchToken() {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
    const data     = await res.json();
    twitchToken    = data.access_token;
    // expires_in is in seconds — store as ms with 60s buffer
    twitchTokenExp = Date.now() + (data.expires_in - 60) * 1000;
  }

  async function checkLiveStatus() {
    const badge = document.getElementById('liveBadge');
    if (!badge) return;

    try {
      if (!twitchToken || Date.now() >= twitchTokenExp) {
        await fetchTwitchToken();
      }

      const res = await fetch(
        `https://api.twitch.tv/helix/streams?user_login=${TWITCH_CHANNEL}`,
        {
          headers: {
            'Client-ID':     TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${twitchToken}`
          }
        }
      );

      if (!res.ok) {
        // 401 = token expired early — clear so next poll re-fetches
        if (res.status === 401) twitchToken = null;
        throw new Error(`Stream check failed: ${res.status}`);
      }

      const data   = await res.json();
      const isLive = data.data && data.data.length > 0;
      badge.classList.toggle('is-live', isLive);

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