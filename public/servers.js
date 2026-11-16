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
  $('#list').innerHTML = n ? `<table class="tbl"><thead><tr><th>Bot</th><th>Status</th><th>Plan</th><th>Time left</th><th></th></tr></thead><tbody>${servers.map(s => {
    const [c, t] = pill(s), d = left(s);
    return `<tr><td><span class="name">${esc(s.name)}</span><span class="sub">${esc(s.node || '')}</span></td><td><span class="pill ${c}">${t}</span></td><td>${esc(s.label)}</td><td class="${d !== null && d <= 3 ? 'warn-text' : ''}">${d === null ? 'No expiry' : d < 0 ? 'Expired' : d + ' day' + (d === 1 ? '' : 's')}</td><td class="act"><button class="button btn-sm" data-open="${s.id}">Open</button></td></tr>`;
  }).join('')}</tbody></table>` : '<div class="empty"><strong>You have no bots yet</strong>Redeem an access code above, or ask the admin on Discord.</div>';
}
async function refresh() { const r = await fetch('/api/servers'); if (r.ok) render(await r.json()); }
$('#list').addEventListener('click', async e => {
  const b = e.target.closest('[data-open]'); if (!b) return;
  b.disabled = true;
  const r = await fetch(`/api/servers/${b.dataset.open}/select`, { method: 'POST' });
  if (r.ok) location.href = '/'; else b.disabled = false;
});
$('#redeem-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('#redeem-message'), btn = e.submitter; btn.disabled = true;
  const r = await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('#redeem-code').value }) });
  const d = await r.json().catch(() => ({}));
  msg.textContent = r.ok ? `Added "${d.server.name}" to your account.` : d.error || 'Could not redeem that code.';
  msg.className = 'msg ' + (r.ok ? 'ok' : 'err'); btn.disabled = false;
  if (r.ok) { $('#redeem-code').value = ''; refresh(); }
});
if (window.__BOOT) render(window.__BOOT); else refresh();
