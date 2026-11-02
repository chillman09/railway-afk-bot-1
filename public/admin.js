async function loadUsers() {
  const response = await fetch('/api/admin/users');
  if (!response.ok) return;
  const { users } = await response.json();
  renderUsers(users);
}

let allUsers = [];
const esc = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
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
