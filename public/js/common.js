// Outils partagés par toutes les pages : connexion, horloge synchronisée, rendu, minuteurs.
/* global io, morphdom */
const SJ = (() => {
  const sock = io({ transports: ['websocket', 'polling'] });
  let offset = 0;

  // Horloge : on garde l'échantillon au plus court aller-retour.
  async function sync() {
    let best = null;
    for (let i = 0; i < 6; i++) {
      const t0 = Date.now();
      const server = await new Promise(r => sock.timeout(3000).emit('sync', null, (e, t) => r(e ? null : t)));
      const t1 = Date.now();
      if (server == null) continue;
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, off: server - (t0 + t1) / 2 };
    }
    if (best) offset = best.off;
  }
  sock.on('connect', () => { sync(); setTimeout(sync, 15000); });
  setInterval(sync, 60000);

  const now = () => Date.now() + offset;

  function emit(ev, payload) {
    return new Promise(res => sock.timeout(8000).emit(ev, payload, (e, r) => res(e ? { ok: false, msg: 'Connexion perdue, réessaie.' } : r)));
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  }
  const money = n => Number(n || 0).toLocaleString('fr-FR') + ' $';

  // Rendu sans perdre le champ en cours de saisie.
  function render(el, html) {
    const next = el.cloneNode(false);
    next.innerHTML = html;
    morphdom(el, next, {
      childrenOnly: true,
      onBeforeElUpdated(from, to) {
        if (from === document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(from.tagName)) return false;
        if (from.isEqualNode(to)) return false;
        return true;
      },
    });
    tickTimers();
  }

  // <span data-until="ms"> affiche le temps restant, <span data-since="ms"> le temps écoulé.
  function tickTimers() {
    const n = now();
    document.querySelectorAll('[data-until]').forEach(e => { e.textContent = fmt(Number(e.dataset.until) - n); });
    document.querySelectorAll('[data-since]').forEach(e => { e.textContent = fmt(n - Number(e.dataset.since)); });
  }
  setInterval(tickTimers, 250);

  let toastT;
  function toast(r) {
    if (!r || !r.msg) return;
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = r.msg;
    el.className = r.ok ? 'ok' : 'err';
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.add('off'), 3200);
    if (!r.ok) navigator.vibrate?.(120);
  }

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; }
  }

  function hearts(n, max = 2) {
    return `<span class="hearts" aria-label="${n} vie${n > 1 ? 's' : ''}">${'♥'.repeat(Math.max(0, n))}<span class="off">${'♥'.repeat(Math.max(0, max - n))}</span></span>`;
  }

  function confetti(ms = 8000) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    const dp = devicePixelRatio || 1;
    const ctx = cv.getContext('2d');
    const size = () => { cv.width = innerWidth * dp; cv.height = innerHeight * dp; };
    size();
    const cols = ['#e5a83b', '#43b8a6', '#ece6d9', '#e7584f', '#7fa8f0'];
    const ps = Array.from({ length: 220 }, () => ({ x: Math.random() * cv.width, y: -Math.random() * cv.height, w: (6 + Math.random() * 8) * dp, h: (3 + Math.random() * 5) * dp, vy: (1.5 + Math.random() * 3) * dp, vx: (Math.random() - .5) * 1.5 * dp, r: Math.random() * 6, vr: (Math.random() - .5) * .2, c: cols[Math.random() * cols.length | 0] }));
    const end = Date.now() + ms;
    (function f() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of ps) {
        p.y += p.vy; p.x += p.vx; p.r += p.vr;
        if (p.y > cv.height + 20 && Date.now() < end) { p.y = -20; p.x = Math.random() * cv.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (ps.some(p => p.y < cv.height + 20)) requestAnimationFrame(f); else cv.remove();
    })();
  }

  // Empêche l'écran de s'éteindre (écran public, téléphones en jeu).
  async function keepAwake() {
    try { await navigator.wakeLock?.request('screen'); } catch { /* refusé : tant pis */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

  return { sock, now, sync, emit, esc, fmt, money, render, toast, store, hearts, confetti, keepAwake, tickTimers };
})();
