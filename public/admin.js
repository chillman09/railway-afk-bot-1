const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const api = (url, method = 'GET', body) => fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const D = { users: [], servers: [], nodes: [], codes: [], reg: true };
const days = iso => (iso ? Math.ceil((new Date(iso) - Date.now()) / 864e5) : null);
const date = iso => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'None');
const pill = (c, t) => `<span class="pill ${c}">${esc(t)}</span>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function botPill(s) {
  if (s.suspended) return pill('bad', 'Suspended');
  if (!s.active) return pill('bad', 'Expired');
  if (s.status === 'online') return pill('ok', 'Online');
  if (s.status === 'offline') return pill('', 'Offline');
  if (s.status === 'node offline') return pill('bad', 'Node offline');
  return pill('warn', s.status);
}
const table = (head, rows, empty) => rows.length ? `<table class="tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<div class="empty"><strong>${empty[0]}</strong>${empty[1] || ''}</div>`;

async function loadAll() {
  const [u, s, n, c, g] = await Promise.all([api('/api/admin/users'), api('/api/admin/servers'), api('/api/admin/nodes'), api('/api/admin/codes'), api('/api/admin/settings')]);
  if (u.ok) D.users = u.data.users; if (s.ok) D.servers = s.data.servers; if (n.ok) D.nodes = n.data.nodes; if (c.ok) D.codes = c.data.codes; if (g.ok) D.reg = g.data.registrationOpen;
  render();
}

function render() {
  const online = D.servers.filter(s => s.status === 'online').length, nodesUp = D.nodes.filter(n => n.online).length;
  const liveCodes = D.codes.filter(c => !c.disabled && (!c.expiresAt || new Date(c.expiresAt) > new Date()) && (c.maxUses === null || c.uses < c.maxUses)).length;
  const issues = [];
  D.nodes.filter(n => !n.online).forEach(n => issues.push(['bad', 'Node offline', `${n.name} is not connected. Its bots are not running.`, '#nodes']));
  D.nodes.filter(n => n.online && n.used / n.maxBots >= .9).forEach(n => issues.push(['warn', 'Node nearly full', `${n.name} holds ${n.used} of ${n.maxBots} bots.`, '#nodes']));
  D.servers.forEach(s => {
    const d = days(s.until);
    if (s.suspended) issues.push(['warn', 'Bot suspended', `${s.name} (${s.owner})`, '#bots']);
    else if (d !== null && d < 0) issues.push(['bad', 'Bot expired', `${s.name} (${s.owner}) ended ${date(s.until)}`, '#bots']);
    else if (d !== null && d <= 3) issues.push(['warn', 'Bot ending soon', `${s.name} (${s.owner}) ends in ${plural(d, 'day')}`, '#bots']);
  });
  $('#title').textContent = issues.length ? `${plural(issues.length, 'thing')} need${issues.length === 1 ? 's' : ''} attention` : 'Everything is running';
  $('#sub').textContent = `${plural(D.servers.length, 'bot')} on ${plural(D.nodes.length, 'node')}, ${plural(D.users.length, 'user')}.`;
  $('#kpis').innerHTML = [
    ['Bots online', `${online} / ${D.servers.length}`, `${D.servers.length - online} not running`, D.servers.length && online === D.servers.length ? 'good' : ''],
    ['Nodes online', `${nodesUp} / ${D.nodes.length}`, nodesUp === D.nodes.length ? 'All connected' : `${D.nodes.length - nodesUp} offline`, nodesUp === D.nodes.length ? 'good' : 'bad'],
    ['Users', D.users.length, D.reg ? 'Registration open' : 'Registration closed', ''],
    ['Live codes', liveCodes, `${D.codes.length} created in total`, '']
  ].map(([l, v, s, c]) => `<div class="kpi ${c}"><span>${l}</span><strong>${esc(v)}</strong><small>${esc(s)}</small></div>`).join('');
  $('#attention').innerHTML = table(['Issue', 'Details', ''], issues.map(([c, t, d, h]) => `<tr><td>${pill(c, t)}</td><td>${esc(d)}</td><td class="act"><a class="button btn-sm" href="${h}">View</a></td></tr>`), ['Nothing needs attention', 'All nodes are connected and no bot is expiring soon.']);

  const ownerBots = {}; D.servers.forEach(s => ownerBots[s.owner] = (ownerBots[s.owner] || 0) + 1);
  $('#bots').innerHTML = table(['Bot', 'Owner', 'Node', 'Type', 'Status', 'Expires', ''], D.servers.map(s => `<tr><td><span class="name">${esc(s.name)}</span><span class="sub mono">${esc(s.id)}</span></td><td>${esc(s.owner)}</td><td>${esc(s.node || '?')}</td><td>${esc(s.label)}</td><td>${botPill(s)}</td><td class="${days(s.until) !== null && days(s.until) <= 3 ? 'warn-text' : ''}">${date(s.until)}</td><td class="act"><button class="button btn-sm" data-act="renew" data-id="${s.id}">+30 days</button><button class="button btn-sm" data-act="suspend" data-id="${s.id}">${s.suspended ? 'Unsuspend' : 'Suspend'}</button><button class="button btn-sm button-danger" data-act="delete-bot" data-id="${s.id}">Delete</button></td></tr>`), ['No bots yet', 'Create one for a user.']);

  const q = $('#user-search').value.trim().toLowerCase();
  const users = D.users.filter(u => u.username.toLowerCase().includes(q));
  $('#users').innerHTML = table(['User', 'Bots', 'Joined', ''], users.map(u => `<tr><td><span class="name">${esc(u.username)}</span></td><td>${ownerBots[u.username] || 0}</td><td>${date(u.createdAt)}</td><td class="act"><button class="button btn-sm button-danger" data-act="delete-user" data-id="${esc(u.username)}">Remove</button></td></tr>`), [q ? 'No matching users' : 'No users yet', q ? 'Try another name.' : 'People can register themselves, or you can add them.']);

  $('#nodes').innerHTML = table(['Node', 'Status', 'Capacity', 'Load', ''], D.nodes.map(n => {
    const pct = Math.min(100, Math.round(100 * n.used / n.maxBots));
    return `<tr><td><span class="name">${esc(n.name)}</span><span class="sub">${n.remote ? 'Remote agent' : 'Runs on the panel'}</span></td><td>${n.online ? pill('ok', 'Online') : pill('bad', 'Offline')}</td><td>${n.used} / ${n.maxBots} bots<div class="bar ${pct >= 100 ? 'full' : pct >= 90 ? 'hot' : ''}"><i style="width:${pct}%"></i></div></td><td>${n.stats ? `${n.stats.load.toFixed(2)} · ${n.stats.freeMb} MB free` : '<span class="sub">No data</span>'}</td><td class="act">${n.remote ? `<button class="button btn-sm button-danger" data-act="delete-node" data-id="${esc(n.id)}">Delete</button>` : ''}</td></tr>`;
  }), ['No nodes']);

  $('#codes').innerHTML = table(['Code', 'Grants', 'Used', 'Expires', 'Note', 'Status', ''], D.codes.map(c => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date(), full = c.maxUses !== null && c.uses >= c.maxUses;
    const st = c.disabled ? pill('', 'Disabled') : expired ? pill('bad', 'Expired') : full ? pill('warn', 'Used up') : pill('ok', 'Active');
    return `<tr><td class="mono">${esc(c._id)}</td><td>${esc(c.plan)}, ${c.days} days</td><td>${c.uses} / ${c.maxUses === null ? '∞' : c.maxUses}</td><td>${date(c.expiresAt)}</td><td>${esc(c.note || '')}</td><td>${st}</td><td class="act"><button class="button btn-sm" data-act="copy" data-id="${esc(c._id)}">Copy</button><button class="button btn-sm" data-act="toggle-code" data-id="${esc(c._id)}">${c.disabled ? 'Enable' : 'Disable'}</button></td></tr>`;
  }), ['No codes yet', 'Generate some to sell or give away.']);
  $('#reg-open').checked = D.reg;
}

// ---- tabs ----
function showTab() {
  const t = location.hash.slice(1) || 'overview';
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + t));
  $$('main > section').forEach(s => s.hidden = s.id !== 's-' + t);
}
addEventListener('hashchange', showTab); showTab();

// ---- dialogs ----
const msg = (id, text, ok) => { const m = $(id); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
document.addEventListener('click', async e => {
  const open = e.target.closest('[data-open-dlg]');
  if (open) {
    const d = $('#' + open.dataset.openDlg);
    if (d.id === 'dlg-bot') {
      const me = $('#user-chip').textContent.split(' · ')[0];
      $('#b-owner').innerHTML = [...new Set([me, ...D.users.map(u => u.username)])].filter(x => x && x !== '--').map(n => `<option>${esc(n)}</option>`).join('');
      $('#b-node').innerHTML = '<option value="auto">Auto (best node)</option>' + D.nodes.map(n => `<option value="${esc(n.id)}" ${n.enabled && n.online && n.used < n.maxBots ? '' : 'disabled'}>${esc(n.name)}: ${n.used}/${n.maxBots}${n.online ? '' : ' (offline)'}</option>`).join('');
    }
    $$('#' + d.id + ' .msg').forEach(m => m.textContent = ''); $$('#' + d.id + ' pre').forEach(p => p.hidden = true);
    d.showModal(); return;
  }
  if (e.target.closest('[data-close]')) { e.target.closest('dialog').close(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  if (act === 'copy') { navigator.clipboard?.writeText(id); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1200); return; }
  if (act === 'delete-bot' && !(await window.confirmAction('Delete this bot? Its saved settings and route are removed.'))) return;
  if (act === 'delete-user' && !(await window.confirmAction(`Remove "${id}"? Their bots are deleted and they lose access.`))) return;
  if (act === 'delete-node' && !(await window.confirmAction('Delete this node? Its agent will be disconnected.'))) return;
  const calls = { renew: () => api(`/api/admin/servers/${id}/renew`, 'POST', { days: 30 }), suspend: () => api(`/api/admin/servers/${id}/suspend`, 'POST'), 'delete-bot': () => api(`/api/admin/servers/${id}`, 'DELETE'), 'delete-user': () => api(`/api/admin/users/${encodeURIComponent(id)}`, 'DELETE'), 'delete-node': () => api(`/api/admin/nodes/${id}`, 'DELETE'), 'toggle-code': () => api(`/api/admin/codes/${id}/toggle`, 'POST') };
  b.disabled = true; const r = await calls[act](); b.disabled = false;
  if (!r.ok) alert(r.data.error || 'That did not work.');
  loadAll();
});
$('#user-search').addEventListener('input', render);
$('#reg-open').addEventListener('change', e => api('/api/admin/settings', 'POST', { registrationOpen: e.target.checked }).then(loadAll));

const submit = (form, msgId, call, done) => $(form).addEventListener('submit', async e => {
  e.preventDefault(); const btn = e.submitter; btn.disabled = true;
  const { ok, data } = await call(); btn.disabled = false;
  if (!ok) return msg(msgId, data.error || 'That did not work.', false);
  done(data); loadAll();
});
submit('#f-bot', '#m-bot', () => api('/api/admin/servers', 'POST', { owner: $('#b-owner').value, name: $('#b-name').value, nodeId: $('#b-node').value, plan: $('#b-plan').value, days: $('#b-days').value }), () => $('#dlg-bot').close());
submit('#f-user', '#m-user', () => api('/api/admin/users', 'POST', { username: $('#u-name').value, password: $('#u-pass').value }), () => { $('#f-user').reset(); $('#dlg-user').close(); });
submit('#f-node', '#m-node', () => api('/api/admin/nodes', 'POST', { name: $('#n-name').value, maxBots: $('#n-max').value }), d => {
  const p = $('#n-token'); p.hidden = false; p.textContent = `PANEL_URL=${location.origin}\nNODE_TOKEN=${d.token}`;
  msg('#m-node', 'Node created. Copy these two lines now; the token is shown once.', true);
});
submit('#f-code', '#m-code', () => { const x = $('#c-exp').value, m = $('#c-max').value; return api('/api/admin/codes', 'POST', { plan: $('#c-plan').value, days: $('#c-days').value, maxUses: m === '' ? null : m, expiresAt: x ? new Date(x + 'T23:59:59').toISOString() : null, count: $('#c-count').value, note: $('#c-note').value }); }, d => {
  const p = $('#c-out'); p.hidden = false; p.textContent = d.codes.map(c => c._id).join('\n'); msg('#m-code', `Created ${d.codes.length}.`, true);
});

loadAll(); setInterval(() => { if (!document.hidden && !$$('dialog[open]').length) loadAll(); }, 15000);
