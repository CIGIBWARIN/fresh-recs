(() => {
  'use strict';

  const ext = globalThis.browser || globalThis.chrome;

  const DEFAULTS = {
    enabled: true,
    threshold: 3,      // hide a video after it has been shown this many times
    expiryDays: 7,     // forget impressions after this many days without being shown
    hideWatched: true, // hide videos you've opened or that show a watch-progress bar
    home: true,
    sidebar: true,
    shorts: true,
    mode: 'hide',      // 'hide' or 'dim'
  };
  const WATCHED_KEEP_DAYS = 180;
  const DAY = 864e5;

  // Outermost first: a home grid cell wraps a lockup, and we want to hide the whole cell.
  const CONTAINERS = [
    'ytd-rich-item-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytm-shorts-lockup-view-model-v2',
    'ytm-shorts-lockup-view-model',
    'yt-lockup-view-model',
  ];
  const CONTAINER_SEL = CONTAINERS.join(',');
  const LINK_SEL = 'a[href*="/watch?v="], a[href*="/shorts/"]';
  const PROGRESS_SEL = [
    'ytd-thumbnail-overlay-resume-playback-renderer',
    'yt-thumbnail-overlay-progress-bar-view-model',
    '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
  ].join(',');

  let settings = { ...DEFAULTS };
  let seen = {};       // videoId -> { c: impressions, t: last shown, w: watched at }
  let blocked = {};    // videoId -> time you hid it with the ✕ button (kept until cleared)
  let pending = [];    // ops not yet written to storage
  let shownThisView = new Set();
  let flushTimer = null;
  let scanTimer = null;
  let lastUrl = '';

  // ---------- storage ----------

  function applyOp(map, op) {
    const e = map[op.id] || { c: 0, t: 0 };
    if (op.type === 'imp') {
      if (op.t - e.t > settings.expiryDays * DAY) e.c = 0;
      e.c++;
      e.t = op.t;
    } else {
      e.w = op.t;
    }
    map[op.id] = e;
  }

  function prune(map) {
    const now = Date.now();
    for (const id in map) {
      const e = map[id];
      const impStale = now - e.t > settings.expiryDays * DAY;
      const watchStale = !e.w || now - e.w > WATCHED_KEEP_DAYS * DAY;
      if (impStale && watchStale) delete map[id];
    }
  }

  function record(op) {
    applyOp(seen, op);
    pending.push(op);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 1000);
  }

  async function flush() {
    if (!pending.length) return;
    const ops = pending;
    pending = [];
    // Re-read so writes from other YouTube tabs aren't clobbered.
    const { seen: stored = {} } = await ext.storage.local.get('seen');
    ops.forEach((op) => applyOp(stored, op));
    prune(stored);
    await ext.storage.local.set({ seen: stored });
  }

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) settings = { ...DEFAULTS, ...changes.settings.newValue };
    if (changes.seen) {
      seen = changes.seen.newValue || {};
      pending.forEach((op) => applyOp(seen, op));
    }
    if (changes.blocked) blocked = changes.blocked.newValue || {};
    scheduleScan();
  });

  async function setBlocked(id, on) {
    const { blocked: stored = {} } = await ext.storage.local.get('blocked');
    if (on) stored[id] = Date.now();
    else delete stored[id];
    blocked = stored;
    await ext.storage.local.set({ blocked: stored });
  }

  window.addEventListener('pagehide', flush);

  // ---------- DOM ----------

  function parseLink(href) {
    try {
      const u = new URL(href, location.origin);
      if (u.pathname === '/watch') return { id: u.searchParams.get('v'), short: false };
      const m = u.pathname.match(/^\/shorts\/([\w-]+)/);
      if (m) return { id: m[1], short: true };
    } catch (_) {}
    return null;
  }

  function scopeOf(el) {
    if (el.closest('ytd-browse[page-subtype="home"]')) return 'home';
    if (el.closest('ytd-watch-flexy')) return 'sidebar';
    return null; // search, subscriptions, channels, etc. are left alone
  }

  function setState(el, reason) {
    if (reason) {
      el.setAttribute('data-yrf', settings.mode === 'dim' ? 'dim' : 'hide');
      el.title = {
        blocked: 'Fresh Recs: hidden by you',
        watched: 'Fresh Recs: already watched',
        repeat: 'Fresh Recs: shown too many times',
      }[reason];
    } else if (el.hasAttribute('data-yrf')) {
      el.removeAttribute('data-yrf');
      el.removeAttribute('title');
    }
  }

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const id = en.target.dataset.yrfId;
      if (!id || shownThisView.has(id)) continue;
      shownThisView.add(id);
      record({ type: 'imp', id, t: Date.now() });
    }
  }, { threshold: 0.5 });

  let toastTimer = null;
  function showToast(id) {
    let toast = document.getElementById('yrf-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'yrf-toast';
      const text = document.createElement('span');
      text.textContent = 'Video hidden';
      const undo = document.createElement('button');
      undo.textContent = 'Undo';
      undo.addEventListener('click', () => {
        setBlocked(toast.dataset.id, false);
        toast.hidden = true;
      });
      toast.append(text, undo);
      document.body.append(toast);
    }
    toast.dataset.id = id;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
  }

  function addHideButton(el) {
    if (el.querySelector(':scope > .yrf-x')) return;
    const btn = document.createElement('button');
    btn.className = 'yrf-x';
    btn.title = 'Hide this video (Fresh Recs)';
    btn.textContent = '✕';
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = el.dataset.yrfId; // read at click time: YouTube recycles elements
      if (!id) return;
      setBlocked(id, true);
      setState(el, 'blocked');
      io.unobserve(el);
      showToast(id);
    }, true);
    el.classList.add('yrf-host');
    el.append(btn);
  }

  function evaluate(el) {
    const link = el.querySelector(LINK_SEL);
    const info = link && parseLink(link.getAttribute('href'));
    if (!info || !info.id) return;

    // YouTube recycles elements; re-observe when one gets a new video.
    if (el.dataset.yrfId !== info.id) {
      el.dataset.yrfId = info.id;
      io.unobserve(el);
    }

    const scope = scopeOf(el);
    const active = settings.enabled && scope && settings[scope] && (!info.short || settings.shorts);
    if (!active) {
      setState(el, null);
      io.unobserve(el);
      return;
    }

    addHideButton(el);

    const e = seen[info.id];
    const fresh = e && Date.now() - e.t <= settings.expiryDays * DAY;
    let reason = null;
    if (blocked[info.id]) {
      reason = 'blocked';
    } else if (settings.hideWatched && ((e && e.w) || el.querySelector(PROGRESS_SEL))) {
      reason = 'watched';
    } else if (!shownThisView.has(info.id) && fresh && e.c >= settings.threshold) {
      reason = 'repeat';
    }

    setState(el, reason);
    if (reason) io.unobserve(el);
    else io.observe(el);
  }

  function scan() {
    scanTimer = null;
    for (const el of document.querySelectorAll(CONTAINER_SEL)) {
      if (el.parentElement && el.parentElement.closest(CONTAINER_SEL)) continue; // nested
      evaluate(el);
    }
  }

  function scheduleScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, 200);
  }

  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    shownThisView = new Set(); // each page view counts as a new "refresh"
    const info = parseLink(location.href);
    if (info && info.id) record({ type: 'watch', id: info.id, t: Date.now() });
    scheduleScan();
  }

  // ---------- popup stats ----------

  // sendResponse rather than a returned Promise: Chrome doesn't support the latter.
  ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'yrf-stats') {
      sendResponse({
        hidden: document.querySelectorAll('[data-yrf]').length,
        tracked: Object.keys(seen).length,
        blocked: Object.keys(blocked).length,
      });
    }
  });

  // ---------- init ----------

  ext.storage.local.get(['settings', 'seen', 'blocked']).then((data) => {
    settings = { ...DEFAULTS, ...data.settings };
    seen = data.seen || {};
    blocked = data.blocked || {};
    pending.forEach((op) => applyOp(seen, op));

    new MutationObserver(scheduleScan).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
    document.addEventListener('yt-navigate-finish', onUrlChange);
    setInterval(onUrlChange, 1000); // Shorts swiping doesn't always fire navigate events
    onUrlChange();
    scheduleScan();
  });
})();
