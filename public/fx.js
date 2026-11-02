(() => {
  const root = document.documentElement, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');
  const mk = (t, id) => { const e = document.createElement(t); e.id = id; document.body.prepend(e); return e; };
  const cv = mk('canvas', 'aurora'), glow = mk('div', 'glow'), bar = mk('div', 'progress'), g = cv.getContext('2d');
  let W, H, k, mx = .5, my = .5, t = 0, last = 0, grads = [];
  const small = innerWidth < 800, step = small ? 40 : 26;
  const stars = Array.from({ length: small ? 60 : 110 }, () => ({ x: Math.random(), y: Math.random() * .75, s: Math.random() < .15 ? 3 : 2, p: Math.random() * 6 }));
  const rib = [[262, .30, .9], [158, .42, 1.3], [285, .24, .7]];
  function size() {
    W = innerWidth; H = innerHeight; k = small ? .35 : .5;
    cv.width = W * k; cv.height = H * k;
    grads = rib.map(([hue]) => { const gr = g.createLinearGradient(0, -H * .28, 0, 40); gr.addColorStop(0, `hsla(${hue},95%,65%,0)`); gr.addColorStop(.75, `hsla(${hue},95%,62%,.12)`); gr.addColorStop(1, `hsla(${hue},95%,70%,0)`); return gr; });
  }
  addEventListener('resize', size); size();
  function draw(now) {
    if (still || document.hidden) return;
    requestAnimationFrame(draw);
    if (now - last < 33) return; last = now; t += .01;
    g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#090719'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    stars.forEach(s => { g.globalAlpha = .35 + .65 * Math.abs(Math.sin(t * 2 + s.p)); g.fillRect(((s.x * W) - (mx - .5) * 30 * s.s) | 0, (s.y * H) | 0, s.s, s.s); });
    g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
    rib.forEach(([, base, sp], i) => {
      g.fillStyle = grads[i];
      for (let x = 0; x <= W; x += step) {
        const y = H * base + Math.sin(x * .004 + t * sp + i * 2) * H * .09 + Math.sin(x * .011 - t * sp) * H * .03 + (my - .5) * 40 - scrollY * .06 * (i + 1);
        g.setTransform(k, 0, 0, k, 0, y * k); g.fillRect(x, -H * .28, step + 1, H * .28 + 40);
      }
    });
  }
  requestAnimationFrame(draw);
  if (still) { t = 3; draw(1000); }
  addEventListener('pointermove', e => { mx = e.clientX / W; my = e.clientY / H; glow.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`; }, { passive: true });
  addEventListener('scroll', () => { bar.style.transform = `scaleX(${scrollY / Math.max(1, document.body.scrollHeight - innerHeight)})`; }, { passive: true });
  document.addEventListener('visibilitychange', () => !document.hidden && requestAnimationFrame(draw));
  document.querySelectorAll('.banner,.metric,.panel,.login-card,.note,.hero-row').forEach((e, i) => { e.dataset.reveal = ''; e.style.setProperty('--d', (i % 4) * .08 + 's'); });
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: .1 });
  document.querySelectorAll('[data-reveal]').forEach(e => io.observe(e));
  document.querySelectorAll('.magnet').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px,${(e.clientY - r.top - r.height / 2) * .35}px)`; });
    b.addEventListener('pointerleave', () => b.style.transform = '');
  });
  // 3D tilt on cards (hover devices only)
  if (matchMedia('(hover:hover)').matches && !still) document.querySelectorAll('.card,.metric,.steps .panel').forEach(el => {
    el.addEventListener('pointerenter', () => el.style.transition = 'transform .12s');
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(6px)`; });
    el.addEventListener('pointerleave', () => { el.style.transition = ''; el.style.transform = ''; });
  });
  // pixel burst on button press
  addEventListener('pointerdown', e => {
    if (still || !e.target.closest('.button,.tab,.command-form button')) return;
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('i'); p.className = 'px'; p.style.left = e.clientX + 'px'; p.style.top = e.clientY + 'px';
      p.style.background = ['#5dffb4', '#b690ff', '#fff'][i % 3]; document.body.appendChild(p);
      const a = Math.random() * 6.28, d = 30 + Math.random() * 40;
      p.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px)`, opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = () => p.remove();
    }
  });
  // Ctrl/Cmd+K command palette (dashboard only)
  const cmds = [...document.querySelectorAll('[data-tab]')].map(b => ['Go to ' + b.querySelector('span').textContent, () => b.click()])
    .concat([...document.querySelectorAll('[data-action]')].map(b => [b.textContent.replace(/[→↻×]/g, '').trim() + ' bot', () => b.click()]));
  if (cmds.length) {
    const pal = document.createElement('div'); pal.className = 'pal'; pal.hidden = true;
    pal.innerHTML = '<div class="pal-box"><input placeholder="Type a command..." aria-label="Command palette"><ul></ul><small>↑↓ to move · Enter to run · Esc to close</small></div>';
    document.body.appendChild(pal);
    const inp = pal.querySelector('input'), ul = pal.querySelector('ul'); let list = cmds, at = 0;
    const draw = () => { ul.innerHTML = list.map((c, i) => `<li class="${i === at ? 'on' : ''}" data-i="${i}">${c[0]}</li>`).join('') || '<li>No match</li>'; };
    const open = () => { pal.hidden = false; inp.value = ''; list = cmds; at = 0; draw(); inp.focus(); }, close = () => pal.hidden = true;
    const run = i => { if (list[i]) { close(); list[i][1](); } };
    addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? open() : close(); }
      else if (!pal.hidden) {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowDown') { at = (at + 1) % list.length; draw(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { at = (at - 1 + list.length) % list.length; draw(); e.preventDefault(); }
        else if (e.key === 'Enter') run(at);
      }
    });
    inp.addEventListener('input', () => { list = cmds.filter(c => c[0].toLowerCase().includes(inp.value.toLowerCase())); at = 0; draw(); });
    ul.addEventListener('click', e => e.target.dataset.i && run(+e.target.dataset.i));
    pal.addEventListener('pointerdown', e => e.target === pal && close());
  }
})();
