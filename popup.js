const ext = globalThis.browser || globalThis.chrome;

const DEFAULTS = {
  enabled: true, threshold: 3, expiryDays: 7, hideWatched: true,
  home: true, sidebar: true, shorts: true, mode: 'hide',
};

const fields = Object.keys(DEFAULTS).map((k) => document.getElementById(k));

async function load() {
  const { settings } = await ext.storage.local.get('settings');
  const s = { ...DEFAULTS, ...settings };
  for (const f of fields) {
    if (f.type === 'checkbox') f.checked = s[f.id];
    else f.value = s[f.id];
  }
}

function save() {
  const s = {};
  for (const f of fields) {
    if (f.type === 'checkbox') s[f.id] = f.checked;
    else if (f.type === 'number') s[f.id] = Math.max(1, parseInt(f.value, 10) || DEFAULTS[f.id]);
    else s[f.id] = f.value;
  }
  ext.storage.local.set({ settings: s });
}

async function stats() {
  const el = document.getElementById('stats');
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    const r = await ext.tabs.sendMessage(tab.id, { type: 'yrf-stats' });
    el.textContent = `${r.hidden} hidden on this page · ${r.tracked} videos tracked · ${r.blocked} hidden by you`;
  } catch (_) {
    el.textContent = 'Open YouTube to see stats.';
  }
}

fields.forEach((f) => f.addEventListener('change', save));
document.getElementById('reset').addEventListener('click', async () => {
  await ext.storage.local.set({ seen: {} });
  stats();
});
// Firefox popups can't show confirm(), so ask for a second click instead.
const unblock = document.getElementById('unblock');
unblock.addEventListener('click', async () => {
  if (!unblock.dataset.armed) {
    unblock.dataset.armed = '1';
    unblock.textContent = 'Click again to confirm';
    return;
  }
  delete unblock.dataset.armed;
  unblock.textContent = 'Unhide videos I hid';
  await ext.storage.local.set({ blocked: {} });
  stats();
});

document.getElementById('privacy').addEventListener('click', (ev) => {
  ev.preventDefault();
  ext.tabs.create({ url: ext.runtime.getURL('privacy.html') });
  window.close();
});

load();
stats();
