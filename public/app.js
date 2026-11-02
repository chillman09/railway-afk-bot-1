const socket = io();
const consoleElement = document.querySelector('#console');
const eventCount = document.querySelector('#event-count');
let eventTotal = 0;
let versionOptions = [];

function renderVersionOptions(versions) {
  if (!versions?.length || versions.join(',') === versionOptions.join(',')) return;
  versionOptions = versions;
  const select = document.querySelector('#config-version');
  select.innerHTML = '<option value="auto">Auto detect server version</option>';
  versions.slice().reverse().forEach(version => {
    const option = document.createElement('option');
    option.value = version;
    option.textContent = `Java ${version}`;
    select.appendChild(option);
  });
}

function pips(id, v, c) {
  const el = document.querySelector(id).closest('.spec'); let box = el.querySelector('.pips');
  if (!box) { box = document.createElement('div'); box.className = 'pips'; el.appendChild(box); }
  box.style.setProperty('--c', c);
  box.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="pip ${v >= (i + 1) * 2 ? 'on' : v === i * 2 + 1 ? 'half' : ''}"></i>`).join('');
}

function updateState(state) {
  const status = document.querySelector('#status');
  status.textContent = state.status[0].toUpperCase() + state.status.slice(1);
  const statusMark = document.querySelector('#status-mark');
  statusMark.style.background = state.status === 'online' ? 'var(--ok)' : state.status === 'connecting' ? 'var(--warn)' : 'var(--text-faint)';
  statusMark.style.boxShadow = state.status === 'online' ? 'var(--glow-ok)' : state.status === 'connecting' ? 'var(--glow-warn)' : 'none';
  document.querySelector('#endpoint').textContent = `${state.host}:${state.port} · Java ${state.version}`;
  document.querySelector('#username').textContent = state.username;
  document.querySelector('#last-event').textContent = state.lastEvent;
  document.querySelector('#navigation-mode').textContent = state.navigation[0].toUpperCase() + state.navigation.slice(1);
  document.querySelector('#health').textContent = state.health ?? '--';
  document.querySelector('#food').textContent = state.food ?? '--';
  pips('#health', Number(state.health) || 0, '#ff5a7a');
  pips('#food', Number(state.food) || 0, '#ffb04d');
  document.querySelector('#position').textContent = state.position ?? '--';
  document.querySelector('#ping').textContent = state.ping ?? '--';
  const viewerButton = document.querySelector('#toggle-viewer');
  viewerButton.disabled = !state.viewerAvailable;
  if (!state.viewerAvailable) closeViewer();
  setIfClean('#config-host', state.host);
  setIfClean('#config-port', state.port);
  setIfClean('#config-username', state.username);
  renderVersionOptions(state.supportedVersions);
  setIfClean('#config-version', state.version);
  setIfClean('#config-use-proxy', Boolean(state.useProxy));
}

const dirtyFields = new Set();
const configFieldIds = ['#config-host', '#config-port', '#config-username', '#config-version', '#config-use-proxy'];

configFieldIds.forEach(selector => {
  const el = document.querySelector(selector);
  const eventName = el.type === 'checkbox' ? 'change' : el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(eventName, () => dirtyFields.add(selector));
});

function setIfClean(selector, value) {
  if (dirtyFields.has(selector)) return;
  const el = document.querySelector(selector);
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = value;
}

function addLog(entry) {
  const line = document.createElement('div');
  const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  line.className = `log-line ${entry.level}`;
  line.innerHTML = `<span class="log-time">${time}</span><span>${entry.message.replaceAll('<', '&lt;')}</span>`;
  consoleElement.appendChild(line);
  consoleElement.scrollTop = consoleElement.scrollHeight;
  eventTotal += 1;
  eventCount.textContent = `${eventTotal} event${eventTotal === 1 ? '' : 's'}`;
}

function updateRoute(route) {
  document.querySelector('#route-status').textContent = route.recording ? 'Recording active' : 'Not recording';
  document.querySelector('#route-indicator').classList.toggle('active', route.recording);
  document.querySelector('#route-count').textContent = `${route.points.length} point${route.points.length === 1 ? '' : 's'}`;
  const list = document.querySelector('#route-list');
  list.innerHTML = route.points.length ? route.points.map((point, index) => `<div class="route-point"><div><strong>${point.label.replaceAll('<', '&lt;')}</strong><span>${point.x}, ${point.y}, ${point.z}</span></div><button class="point-go" data-goto="${index}">Go</button></div>`).join('') : '<span class="empty-route">No checkpoints saved</span>';
  list.querySelectorAll('[data-goto]').forEach(button => {
    button.addEventListener('click', () => fetch('/api/route/goto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: button.dataset.goto }) }));
  });
}

socket.on('state', updateState);
socket.on('log', addLog);
socket.on('history', entries => entries.forEach(addLog));
socket.on('versions', renderVersionOptions);
socket.on('route', updateRoute);

socket.on('connect_error', err => {
  if (err.message === 'unauthorized') window.location.href = '/login';
});

function withLoading(button, fn) {
  return async event => {
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      await fn(event);
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  };
}

document.querySelector('#command-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#command');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
});

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', withLoading(button, async () => {
    if (button.dataset.action === 'stop') {
      const confirmed = await window.confirmAction('Stop the bot? It will disconnect until you start it again.');
      if (!confirmed) return;
    }
    await fetch(`/api/action/${button.dataset.action}`, { method: 'POST' });
  }));
});

document.querySelector('#config-form').addEventListener('submit', async event => {
  event.preventDefault();
  const formMessage = document.querySelector('#form-message');
  const payload = {
    host: document.querySelector('#config-host').value,
    port: document.querySelector('#config-port').value,
    username: document.querySelector('#config-username').value,
    version: document.querySelector('#config-version').value,
    password: document.querySelector('#config-password').value,
    useProxy: document.querySelector('#config-use-proxy').checked
  };
  const response = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  formMessage.textContent = response.ok ? 'Saved. Reconnect to apply.' : 'Check the connection values.';
  formMessage.className = `form-message ${response.ok ? 'success' : 'error'}`;
  if (response.ok) {
    document.querySelector('#config-password').value = '';
    dirtyFields.clear();
  }
});

document.querySelectorAll('[data-route]').forEach(button => {
  button.addEventListener('click', withLoading(button, async () => {
    const action = button.dataset.route;
    if (action === 'clear') {
      const confirmed = await window.confirmAction('Clear all saved checkpoints? This cannot be undone.');
      if (!confirmed) return;
    }
    const label = document.querySelector('#checkpoint-label').value.trim();
    const response = await fetch(`/api/route/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) });
    if (response.ok && action === 'checkpoint') document.querySelector('#checkpoint-label').value = '';
  }));
});

function closeViewer() {
  const wrap = document.querySelector('#viewer-frame-wrap');
  const frame = document.querySelector('#viewer-frame');
  const button = document.querySelector('#toggle-viewer');
  wrap.hidden = true;
  frame.src = 'about:blank';
  if (button) button.innerHTML = 'Open 3D view <span>▶</span>';
}

document.querySelector('#toggle-viewer').addEventListener('click', withLoading(document.querySelector('#toggle-viewer'), async () => {
  const wrap = document.querySelector('#viewer-frame-wrap');
  const frame = document.querySelector('#viewer-frame');
  const button = document.querySelector('#toggle-viewer');
  const opening = wrap.hidden;
  if (opening) {
    const response = await fetch('/api/viewer/start', { method: 'POST' });
    if (!response.ok) return; // bot state/log already explains why
    frame.src = '/viewer/';
    wrap.hidden = false;
    button.innerHTML = 'Close 3D view <span>▼</span>';
  } else {
    await fetch('/api/viewer/stop', { method: 'POST' });
    closeViewer();
  }
}));

setInterval(() => { document.querySelector('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 1000);
const tabBtns = [...document.querySelectorAll('[data-tab]')], tabViews = [...document.querySelectorAll('[data-view]')];
function showTab(name) {
  if (!tabViews.some(v => v.dataset.view === name)) name = 'console';
  tabBtns.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  tabViews.forEach(v => v.classList.toggle('active', v.dataset.view === name));
  history.replaceState(null, '', '#' + name);
  window.scrollTo(0, 0);
  if (name === 'console') consoleElement.scrollTop = consoleElement.scrollHeight;
}
tabBtns.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
showTab(location.hash.slice(1) || 'console');

// ---- extras: toasts, uptime graph, bot map ----
let prevStatus = null, onlineSince = null, routePts = [];
const pings = [], trail = [], lastSaid = {};
function say(msg, kind) { const n = Date.now(); if (lastSaid[msg] > n - 2500) return; lastSaid[msg] = n; window.toast?.(msg, kind); }
socket.on('state', s => {
  document.body.removeAttribute('data-loading');
  if (s.status !== prevStatus) {
    if (prevStatus !== null) {
      if (s.status === 'online') { say('Bot is online', 'ok'); window.sfx?.('join'); }
      else if (s.status === 'connecting') say('Connecting to the server...', 'warn');
      else if (prevStatus === 'online') { say('Bot went offline', 'error'); window.sfx?.('warn'); }
    }
    prevStatus = s.status;
  }
  onlineSince = s.status === 'online' ? (onlineSince || Date.now()) : null;
  if (s.status === 'online' && Number.isFinite(Number(s.ping)) && s.ping !== null) { pings.push(Number(s.ping)); if (pings.length > 60) pings.shift(); }
  const m = String(s.position || '').match(/(-?\d+),\s*(-?\d+),\s*(-?\d+)/);
  if (m) { const p = [Number(m[1]), Number(m[3])], l = trail[trail.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) { trail.push(p); if (trail.length > 80) trail.shift(); } }
  else if (s.status !== 'online') trail.length = 0;
});
socket.on('route', r => { routePts = r.points || []; });
socket.on('log', e => { if (e.level === 'error') say(e.message.slice(0, 90), 'error'); else if (e.level === 'warning') say(e.message.slice(0, 90), 'warn'); });

const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function fit(cv) {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); return [c, r.width, r.height];
}
function drawGraph() {
  const cv = document.querySelector('#ping-graph'); if (!cv || !cv.offsetParent) return;
  const [c, w, h] = fit(cv); c.clearRect(0, 0, w, h);
  c.strokeStyle = cssVar('--line'); c.lineWidth = 1;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke(); }
  if (pings.length < 2) { c.fillStyle = cssVar('--text-faint'); c.font = '13px Manrope'; c.textAlign = 'center'; c.fillText('Latency appears when the bot is online', w / 2, h / 2); return; }
  const max = Math.max(100, ...pings) * 1.15, st = w / 59, x0 = w - (pings.length - 1) * st;
  c.beginPath(); pings.forEach((v, i) => { const x = x0 + i * st, y = h - (v / max) * h * .9 - 4; i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.strokeStyle = cssVar('--aur'); c.lineWidth = 2; c.stroke();
  c.lineTo(w, h); c.lineTo(x0, h); c.fillStyle = 'rgba(93,255,180,.12)'; c.fill();
}
function drawMap() {
  const cv = document.querySelector('#bot-map'); if (!cv || !cv.offsetParent) return;
  const [c, w, h] = fit(cv); c.clearRect(0, 0, w, h);
  const pts = [...trail, ...routePts.map(p => [Math.round(p.x), Math.round(p.z)])];
  if (!pts.length) { c.fillStyle = cssVar('--text-faint'); c.font = '13px Manrope'; c.textAlign = 'center'; c.fillText('The map appears when the bot is online', w / 2, h / 2); return; }
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  const span = Math.max(24, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2, k = Math.min(w, h) / (span * 1.35);
  const X = x => w / 2 + (x - cx) * k, Z = z => h / 2 + (z - cz) * k, step = 8 * k, off = v => ((v % step) + step) % step;
  c.strokeStyle = cssVar('--line'); c.lineWidth = 1;
  for (let x = off(w / 2 - cx * k); x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = off(h / 2 - cz * k); y < h; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  if (routePts.length > 1) { c.setLineDash([5, 5]); c.strokeStyle = cssVar('--aur'); c.beginPath(); routePts.forEach((p, i) => i ? c.lineTo(X(p.x), Z(p.z)) : c.moveTo(X(p.x), Z(p.z))); c.stroke(); c.setLineDash([]); }
  routePts.forEach(p => { c.fillStyle = cssVar('--aur'); c.fillRect(X(p.x) - 4, Z(p.z) - 4, 8, 8); c.fillStyle = cssVar('--muted'); c.font = '11px Manrope'; c.textAlign = 'left'; c.fillText(p.label, X(p.x) + 8, Z(p.z) + 4); });
  if (trail.length > 1) { c.strokeStyle = cssVar('--accent'); c.lineWidth = 2; c.beginPath(); trail.forEach((p, i) => i ? c.lineTo(X(p[0]), Z(p[1])) : c.moveTo(X(p[0]), Z(p[1]))); c.stroke(); }
  const b = trail[trail.length - 1];
  if (b) { const pulse = 9 + Math.sin(Date.now() / 250) * 2; c.fillStyle = cssVar('--accent'); c.shadowColor = cssVar('--accent'); c.shadowBlur = 14; c.fillRect(X(b[0]) - pulse / 2, Z(b[1]) - pulse / 2, pulse, pulse); c.shadowBlur = 0; }
  document.querySelector('#map-pos').textContent = b ? `${b[0]}, ${b[1]}` : '--';
}
setInterval(() => {
  const up = document.querySelector('#uptime');
  if (up) { const s = onlineSince ? Math.floor((Date.now() - onlineSince) / 1000) : -1; up.textContent = s < 0 ? 'Offline' : `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m ${s % 60}s`; }
  drawGraph(); drawMap();
}, 1000);
tabBtns.forEach(t => t.addEventListener('click', () => setTimeout(() => { drawGraph(); drawMap(); }, 80)));
