(() => {
  const chip = document.querySelector('#plan-chip'); if (!chip) return;
  fetch('/api/servers/current').then(r => r.ok ? r.json() : null).then(s => { if (s) chip.textContent = `${s.name} · ${s.label}`; });
})();
