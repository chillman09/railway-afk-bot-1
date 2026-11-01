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
})();