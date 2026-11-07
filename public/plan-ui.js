(() => {
  const chip = document.querySelector('#plan-chip'), form = document.querySelector('#redeem-form');
  if (!chip || !form) return;
  async function refresh() {
    const r = await fetch('/api/me/plan'); if (!r.ok) return;
    const p = await r.json();
    if (p.admin) { chip.textContent = 'Admin'; form.hidden = true; return; }
    const days = p.until ? Math.max(1, Math.ceil((new Date(p.until) - Date.now()) / 864e5)) : 0;
    chip.textContent = p.canRun ? `${p.label} · ${days}d left` : 'No plan';
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const input = form.querySelector('input');
    const r = await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value }) });
    const d = await r.json().catch(() => ({}));
    window.toast?.(r.ok ? 'Code redeemed. Your plan is active.' : d.error || 'Could not redeem code', r.ok ? 'ok' : 'warn');
    if (r.ok) { input.value = ''; refresh(); }
  });
  refresh();
})();
