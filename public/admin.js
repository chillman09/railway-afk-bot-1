async function loadUsers() {
  const response = await fetch('/api/admin/users');
  if (!response.ok) return;
  const { users } = await response.json();
  renderUsers(users);
}

let allUsers = [];
const esc = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const planActive = u => u.plan && u.plan !== 'free' && u.planUntil && new Date(u.planUntil) > new Date();
function renderUsers(users) { allUsers = users; paintUsers(); }
function paintUsers() {
  const q = (document.querySelector('#user-search')?.value || '').trim().toLowerCase();
  const me = document.querySelector('#user-chip')?.textContent.trim();
  const shown = allUsers.filter(u => u.username.toLowerCase().includes(q));
  document.querySelector('#user-count').textContent = `${shown.length} user${shown.length === 1 ? '' : 's'}`;
  const list = document.querySelector('#user-list');
  if (!shown.length) { list.innerHTML = `<span class="empty-route">${allUsers.length ? 'No users match your search.' : 'No users yet. Create the first one →'}</span>`; return; }
  list.innerHTML = shown.map(user => {
    const hue = [...user.username].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
    const isNew = Date.now() - new Date(user.createdAt) < 7 * 864e5;
    return `<div class="route-point user-row">
      <div class="urow"><span class="avatar" style="background:hsl(${hue} 75% 62%)">${esc(user.username[0] || '?').toUpperCase()}</span>
        <div><strong>${esc(user.username)}</strong><span>added ${new Date(user.createdAt).toLocaleDateString()}</span></div></div>
      <div class="badges">
        <span class="badge ${user.role === 'admin' ? 'admin' : ''}">${esc(user.role)}</span>
        ${isNew ? '<span class="badge new">new</span>' : ''}${user.username === me ? '<span class="badge you">you</span>' : ''}
        <span class="badge ${planActive(user) ? 'new' : ''}">${planActive(user) ? esc(user.plan) + ' · ' + Math.ceil((new Date(user.planUntil) - Date.now()) / 864e5) + 'd' : 'free'}</span>
        ${user.role === 'admin' ? '' : `<select class="plan-sel" aria-label="Plan">${['free', 'basic', 'pro', 'premium'].map(p => `<option value="${p}">${p}</option>`).join('')}</select><input class="plan-days" type="number" min="1" max="3650" value="30" aria-label="Days"><button class="point-go set-plan" data-username="${esc(user.username)}">Set</button>`}
        <button class="point-go delete-user" data-username="${esc(user.username)}">Remove</button>
      </div></div>`;
  }).join('');
  list.querySelectorAll('.delete-user').forEach(button => {
    button.addEventListener('click', async () => {
      const username = button.dataset.username;
      const confirmed = await window.confirmAction(`Remove "${username}"? Their bot will be stopped and they'll lose access immediately.`);
      if (!confirmed) return;
      await fetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      window.toast?.(`Removed ${username}`, 'warn');
      loadUsers();
    });
  });
}
document.querySelector('#user-search').addEventListener('input', paintUsers);

document.querySelector('#create-user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#create-message');
  const button = event.target.querySelector('button[type="submit"]');
  const payload = {
    username: document.querySelector('#new-username').value.trim(),
    password: document.querySelector('#new-password').value
  };

  button.disabled = true;
  button.classList.add('is-loading');
  try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      message.textContent = data.error || 'Could not create user.';
      message.className = 'form-message error';
      return;
    }
    message.textContent = `Created "${data.user.username}".`;
    message.className = 'form-message success';
    document.querySelector('#new-username').value = '';
    document.querySelector('#new-password').value = '';
    loadUsers();
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
  }
});

setInterval(() => { document.querySelector('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 1000);

loadUsers();

// ---- plans, codes, registration ----
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

document.querySelector('#user-list').addEventListener('click', async event => {
  const button = event.target.closest('.set-plan'); if (!button) return;
  const row = button.closest('.user-row');
  const { ok, data } = await post(`/api/admin/users/${encodeURIComponent(button.dataset.username)}/plan`, { plan: row.querySelector('.plan-sel').value, days: row.querySelector('.plan-days').value });
  window.toast?.(ok ? `Updated ${button.dataset.username}` : data.error || 'Could not update plan', ok ? 'ok' : 'warn');
  if (ok) loadUsers();
});

async function loadCodes() {
  const response = await fetch('/api/admin/codes'); if (!response.ok) return;
  const { codes } = await response.json();
  document.querySelector('#code-count').textContent = `${codes.length} code${codes.length === 1 ? '' : 's'}`;
  const list = document.querySelector('#code-list');
  if (!codes.length) { list.innerHTML = '<span class="empty-route">No codes yet. Generate some →</span>'; return; }
  list.innerHTML = codes.map(c => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date(), full = c.maxUses !== null && c.uses >= c.maxUses;
    const state = c.disabled ? 'disabled' : expired ? 'expired' : full ? 'used up' : 'active';
    return `<div class="route-point user-row"><div class="urow"><div><strong>${esc(c._id)}</strong><span>${esc(c.plan)} · ${c.days}d · ${c.uses}/${c.maxUses === null ? '∞' : c.maxUses} used${c.expiresAt ? ' · until ' + new Date(c.expiresAt).toLocaleDateString() : ''}${c.note ? ' · ' + esc(c.note) : ''}</span></div></div>
      <div class="badges"><span class="badge ${state === 'active' ? 'new' : ''}">${state}</span><button class="point-go copy-code" data-code="${esc(c._id)}">Copy</button><button class="point-go toggle-code" data-code="${esc(c._id)}">${c.disabled ? 'Enable' : 'Disable'}</button></div></div>`;
  }).join('');
}
document.querySelector('#code-list').addEventListener('click', async event => {
  const copy = event.target.closest('.copy-code'), toggle = event.target.closest('.toggle-code');
  if (copy) { navigator.clipboard?.writeText(copy.dataset.code); window.toast?.('Code copied', 'ok'); }
  if (toggle) { await post(`/api/admin/codes/${encodeURIComponent(toggle.dataset.code)}/toggle`); loadCodes(); }
});
document.querySelector('#code-form').addEventListener('submit', async event => {
  event.preventDefault();
  const msg = document.querySelector('#code-message'), v = id => document.querySelector(id).value;
  const exp = v('#code-exp');
  const { ok, data } = await post('/api/admin/codes', { plan: v('#code-plan'), days: v('#code-days'), maxUses: v('#code-max') === '' ? null : v('#code-max'), expiresAt: exp ? new Date(exp + 'T23:59:59').toISOString() : null, count: v('#code-count'), note: v('#code-note') });
  msg.textContent = ok ? `Created: ${data.codes.map(c => c._id).join(', ')}` : data.error || 'Could not create codes.';
  msg.className = 'form-message ' + (ok ? 'success' : 'error');
  if (ok) loadCodes();
});
const regBox = document.querySelector('#reg-open');
fetch('/api/admin/settings').then(r => r.json()).then(s => { regBox.checked = s.registrationOpen; });
regBox.addEventListener('change', async () => { const { data } = await post('/api/admin/settings', { registrationOpen: regBox.checked }); window.toast?.(data.registrationOpen ? 'Registration opened' : 'Registration closed', 'ok'); });
loadCodes();
