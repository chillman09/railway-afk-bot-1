const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const left = s => (s.until ? Math.ceil((new Date(s.until) - Date.now()) / 864e5) : null);
function pill(s) {
  if (s.suspended) return ['bad', 'Suspended'];
  if (!s.active) return ['bad', 'Expired'];
  if (s.status === 'online') return ['ok', 'Online'];
  if (s.status === 'offline') return ['', 'Offline'];
  if (s.status === 'node offline') return ['bad', 'Node offline'];
  return ['warn', s.status.charAt(0).toUpperCase() + s.status.slice(1)];
}
function render({ servers }) {
  const n = servers.length, online = servers.filter(s => s.status === 'online').length;
  const soon = servers.filter(s => !s.active || s.suspended || (left(s) !== null && left(s) <= 3)).length;
  const next = servers.map(left).filter(d => d !== null && d >= 0).sort((a, b) => a - b)[0];
  $('#title').textContent = n ? `${n} bot${n === 1 ? '' : 's'}, ${online} online` : 'No bots yet';
  $('#sub').textContent = !n ? 'Redeem an access code, or ask the admin to assign you a bot.' : soon ? `${soon} need${soon === 1 ? 's' : ''} attention.` : 'Everything is running normally.';
  $('#kpis').innerHTML = n ? [
    ['Bots', n, 'on your account', ''],
    ['Online now', online, `${n - online} offline`, online === n ? 'good' : ''],
    ['Need attention', soon, soon ? 'Expired, suspended or ending soon' : 'None', soon ? 'bad' : 'good'],
    ['Next expiry', next === undefined ? 'None' : `${next} day${next === 1 ? '' : 's'}`, 'Redeem a code to extend', next !== undefined && next <= 3 ? 'warn' : '']
  ].map(([l, v, sub, c]) => `<div class="kpi ${c}"><span>${l}</span><strong>${esc(v)}</strong><small>${esc(sub)}</small></div>`).join('') : '';
  const PLAN = { basic: '56,189,248', pro: '139,108,255', premium: '251,191,36' };
  const cards = servers.map(s => {
    const [c, t] = pill(s), d = left(s), pct = d === null ? 100 : Math.max(4, Math.min(100, Math.round(d / 30 * 100)));
    const time = d === null ? 'No expiry' : d < 0 ? 'Expired' : d + ' day' + (d === 1 ? '' : 's') + ' left';
    return `<article class="bot" style="--c:${PLAN[s.plan] || PLAN.pro}"><div class="bot-banner"><span class="plan-tag">${esc(s.label)}</span></div><div class="bot-body"><div class="avatar">${esc((s.name || '?').charAt(0).toUpperCase())}</div><h3>${esc(s.name)}</h3><p class="sub">${esc(s.node || '')}</p><div class="bot-row"><span class="pill ${c}">${t}</span><span class="time ${d !== null && d <= 3 ? 'warn-text' : ''}">${time}</span></div><div class="bar"><i style="width:${pct}%"></i></div><button class="button button-primary bot-open" data-open="${s.id}">Open bot</button></div></article>`;
  }).join('');
  const add = '<form class="bot add" id="redeem-form"><div class="plus">+</div><h3>Add a bot</h3><p class="sub">Redeem an access code</p><input id="redeem-code" placeholder="AUR-XXXX-XXXX" required autocomplete="off" aria-label="Access code"><button class="button button-primary" type="submit">Redeem code</button></form>';
  $('#list').innerHTML = cards + add;
}
async function refresh() { const r = await fetch('/api/servers'); if (r.ok) render(await r.json()); }
$('#list').addEventListener('click', async e => {
  const b = e.target.closest('[data-open]'); if (!b) return;
  b.disabled = true;
  const r = await fetch(`/api/servers/${b.dataset.open}/select`, { method: 'POST' });
  if (r.ok) location.href = '/'; else b.disabled = false;
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'redeem-form') return;
  e.preventDefault();
  const msg = $('#redeem-message'), btn = e.submitter; btn.disabled = true;
  const r = await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#redeem-code').value }) });
  const d = await r.json().catch(() => ({}));
  msg.textContent = r.ok ? `Added "${d.server.name}" to your account.` : d.error || 'Could not redeem that code.';
  msg.className = 'msg ' + (r.ok ? 'ok' : 'err'); btn.disabled = false;
  if (r.ok) { $('#redeem-code').value = ''; refresh(); }
});
if (window.__BOOT) render(window.__BOOT); else refresh();
