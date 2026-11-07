const esc = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
async function load() {
  const r = await fetch('/api/servers'); if (!r.ok) return;
  const { servers } = await r.json();
  document.querySelector('#bot-count').textContent = `${servers.length} bot${servers.length === 1 ? '' : 's'}`;
  const list = document.querySelector('#bot-list');
  if (!servers.length) { list.innerHTML = '<span class="empty-route">You have no bots yet. Redeem an access code, or ask the admin on Discord.</span>'; return; }
  list.innerHTML = servers.map(s => {
    const left = s.until ? Math.max(0, Math.ceil((new Date(s.until) - Date.now()) / 864e5)) : null;
    return `<div class="route-point user-row"><div class="urow"><div><strong>${esc(s.name)}</strong><span>${esc(s.label)} · ${s.until ? left + ' days left' : 'no expiry'}${s.node ? ' · ' + esc(s.node) : ''}</span></div></div>
      <div class="badges"><span class="badge ${s.active ? 'new' : ''}">${s.suspended ? 'suspended' : s.active ? 'active' : 'expired'}</span><button class="point-go open-bot" data-id="${s.id}">Open</button></div></div>`;
  }).join('');
}
document.querySelector('#bot-list').addEventListener('click', async e => {
  const b = e.target.closest('.open-bot'); if (!b) return;
  const r = await fetch(`/api/servers/${b.dataset.id}/select`, { method: 'POST' });
  if (r.ok) location.href = '/';
});
document.querySelector('#redeem-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.querySelector('#redeem-message');
  const r = await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: document.querySelector('#redeem-code').value }) });
  const d = await r.json().catch(() => ({}));
  msg.textContent = r.ok ? `Added "${d.server.name}" to your account.` : d.error || 'Could not redeem code.';
  msg.className = 'form-message ' + (r.ok ? 'success' : 'error');
  if (r.ok) { document.querySelector('#redeem-code').value = ''; load(); }
});
load();
