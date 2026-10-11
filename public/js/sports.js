// Rejoue sur l'écran public le film d'un sport calculé par le serveur (course, foot, boxe).
/* exported Sports */
const Sports = (() => {
  const TAU = Math.PI * 2, W = 1280, H = 720;
  const DISPLAY = '"Anton", "Big Shoulders Display", Impact, sans-serif';
  const BODY = '"IBM Plex Sans", system-ui, sans-serif';
  const MONO = '"JetBrains Mono", ui-monospace, monospace';

  function text(ctx, t, x, y, { size = 20, font = BODY, weight = 600, color = '#eef3ea', align = 'left' } = {}) {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, x, y);
  }
  function panel(ctx, x, y, w, h, r = 12, fill = 'rgba(14,20,17,.86)') { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
  const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const lerp = (a, b, k) => a + (b - a) * k;

  // Image interpolée à l'instant t (secondes).
  function frameAt(R, t) {
    const fi = Math.max(0, Math.min(R.frames.length - 1, t * R.fps));
    const i0 = Math.floor(fi), i1 = Math.min(R.frames.length - 1, i0 + 1), k = fi - i0;
    return { i0, k, a: R.frames[i0], b: R.frames[i1] };
  }

  // ================= COURSE =================
  function chevaux(ctx, R, t) {
    const CX = 470, CY = 405, L = 300, R0 = 150, LW = 18, N = R.meta.noms.length, RO = R0 + N * LW, LAPS = R.meta.tours;
    function at(f, r) {
      const P = 2 * L + 2 * Math.PI * r; let d = ((f % 1) + 1) % 1 * P;
      if (f >= LAPS) d = 0;
      if (d < L) return { x: CX + L / 2 - d, y: CY + r, a: Math.PI };
      d -= L;
      if (d < Math.PI * r) { const th = Math.PI / 2 + d / r; return { x: CX - L / 2 + r * Math.cos(th), y: CY + r * Math.sin(th), a: th + Math.PI / 2 }; }
      d -= Math.PI * r;
      if (d < L) return { x: CX - L / 2 + d, y: CY - r, a: 0 };
      d -= L;
      const th = -Math.PI / 2 + d / r; return { x: CX + L / 2 + r * Math.cos(th), y: CY + r * Math.sin(th), a: th + Math.PI / 2 };
    }
    function stadium(r) { ctx.beginPath(); ctx.moveTo(CX - L / 2, CY + r); ctx.arc(CX - L / 2, CY, r, Math.PI / 2, Math.PI * 1.5); ctx.lineTo(CX + L / 2, CY - r); ctx.arc(CX + L / 2, CY, r, -Math.PI / 2, Math.PI / 2); ctx.closePath(); }
    const { a, b, k } = frameAt(R, t);
    const xs = a.map((v, i) => lerp(v, b[i], k));
    const done = xs.every(x => x >= 1);
    ctx.fillStyle = '#1d3b24'; ctx.fillRect(0, 0, W, H);
    stadium(RO + 6); ctx.fillStyle = '#f4f1e8'; ctx.fill();
    stadium(RO); ctx.fillStyle = '#9a7a50'; ctx.fill();
    stadium(R0); ctx.fillStyle = '#f4f1e8'; ctx.fill();
    stadium(R0 - 6); ctx.fillStyle = '#2f7a3f'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; for (let i = 1; i < N; i++) { stadium(R0 + i * LW); ctx.stroke(); }
    ctx.fillStyle = '#276a36'; ctx.beginPath(); ctx.ellipse(CX, CY, L / 2 + 60, R0 - 40, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2f6f9a'; ctx.beginPath(); ctx.ellipse(CX, CY + 18, 110, 32, 0, 0, TAU); ctx.fill();
    text(ctx, 'PRIX DE LA SOIRÉE', CX, CY - 26, { size: 24, font: DISPLAY, weight: 400, align: 'center', color: 'rgba(242,193,78,.85)' });
    const fx = CX + L / 2;
    for (let q = 0; q < N * LW / 6; q++) for (let c = 0; c < 2; c++) { ctx.fillStyle = (q + c) % 2 ? '#111' : '#fff'; ctx.fillRect(fx - 6 + c * 6, CY + R0 + q * 6, 6, 6); }
    text(ctx, 'ARRIVÉE', fx, CY + R0 - 14, { size: 14, weight: 700, align: 'center', color: '#f4f1e8' });
    text(ctx, 'COURSE HIPPIQUE', 30, 56, { size: 40, font: DISPLAY, weight: 400, color: '#f2c14e' });
    text(ctx, done ? 'ARRIVÉE' : fmt(R.duration - t), 910, 56, { size: 36, font: MONO, weight: 700, align: 'right' });
    if (!done) {
      const lead = Math.max(...xs);
      const last = lead * LAPS >= LAPS - 1;
      text(ctx, last ? 'DERNIER TOUR !' : `Tour ${Math.min(LAPS, Math.floor(lead * LAPS) + 1)} / ${LAPS}`, CX, CY + 64, { size: 20, weight: 700, align: 'center', color: last ? '#f2c14e' : '#eef3ea' });
    }
    // chevaux (vus de dessus)
    for (let i = N - 1; i >= 0; i--) {
      const r = R0 + (i + .5) * LW, p = at(xs[i] * LAPS, r), g = t * 14 + i;
      if (xs[i] < 1) { ctx.fillStyle = 'rgba(222,196,150,.35)'; for (let q = 1; q <= 3; q++) { const d = at(xs[i] * LAPS - q * .006, r); ctx.beginPath(); ctx.arc(d.x, d.y, 5 - q, 0, TAU); ctx.fill(); } }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(-1, 3, 17, 7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2616'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const run = xs[i] < 1 ? 1 : 0;
      for (const [lx, ly, ph] of [[9, -5, 0], [9, 5, Math.PI], [-9, -5, Math.PI / 2], [-9, 5, Math.PI * 1.5]]) { ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + Math.sin(g + ph) * 6 * run, ly * 1.5); ctx.stroke(); }
      ctx.fillStyle = '#6b4226'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 6.5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(17, 0, 7, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = R.meta.couleurs[i]; ctx.beginPath(); ctx.arc(-1, 0, 5.5, 0, TAU); ctx.fill();
      ctx.restore();
      text(ctx, String(i + 1), p.x, p.y - 12, { size: 11, weight: 700, color: '#fff', align: 'center' });
    }
    // classement
    const order = R.result.order;
    const rank = xs.map((x, i) => ({ i, x })).sort((p, q) => (q.x >= 1 && p.x >= 1 ? order.indexOf(p.i) - order.indexOf(q.i) : q.x - p.x));
    panel(ctx, W - 330, 20, 310, H - 40);
    text(ctx, 'CLASSEMENT', W - 310, 56, { size: 14, weight: 700, color: '#9db0a4' });
    rank.forEach(({ i }, n) => {
      const y = 100 + n * 72;
      ctx.fillStyle = R.meta.couleurs[i]; ctx.beginPath(); ctx.roundRect(W - 310, y - 22, 10, 44, 3); ctx.fill();
      text(ctx, (n + 1) + '.', W - 290, y + 8, { size: 22, font: MONO, weight: 700, color: n < 3 ? '#f2c14e' : '#9db0a4' });
      text(ctx, R.meta.noms[i], W - 248, y + 8, { size: 24, weight: 700 });
      text(ctx, `n°${i + 1}`, W - 248, y + 28, { size: 13, weight: 500, color: '#9db0a4' });
    });
    if (done) {
      panel(ctx, CX - 280, CY - 70, 560, 140, 16, 'rgba(0,0,0,.78)');
      text(ctx, `${R.meta.noms[order[0]]} gagne !`, CX, CY + 8, { size: 60, font: DISPLAY, weight: 400, color: '#f2c14e', align: 'center' });
      text(ctx, `2e ${R.meta.noms[order[1]]} · 3e ${R.meta.noms[order[2]]}`, CX, CY + 48, { size: 22, align: 'center' });
    }
  }

  // ================= FOOT =================
  function prepFoot(R) {
    // possession cumulée image par image
    const poss = [[0, 0]];
    for (const f of R.frames) { const last = poss.at(-1).slice(); const ti = f.at(-1); if (ti >= 0) last[ti]++; poss.push(last); }
    R._poss = poss;
  }
  function foot(ctx, R, t) {
    if (!R._poss) prepFoot(R);
    const F = { x: 60, y: 110, w: R.meta.field.w, h: R.meta.field.h };
    const [GY0, GY1] = R.meta.goalY;
    const T = R.meta.equipes;
    const P = (x, y) => [F.x + x, F.y + y];
    const { a, b, k, i0 } = frameAt(R, t);
    const np = 10;
    const ev = R.events.filter(e => e.t <= t);
    const goals = ev.filter(e => e.type === 'goal');
    const score = goals.length ? goals.at(-1).score : [0, 0];
    const shots = [0, 1].map(ti => ev.filter(e => e.type === 'shot' && e.ti === ti).length);
    const clock = ev.find(e => e.type === 'clock');
    const minute = clock ? Math.min(90, Math.floor((t - clock.t0) / (R.duration - clock.t0) * 90)) : 0;
    const done = t >= R.duration;
    // terrain
    ctx.fillStyle = '#0f2a17'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#2f7a3f' : '#338443'; ctx.fillRect(F.x + i * F.w / 12, F.y, F.w / 12, F.h); }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.strokeRect(F.x, F.y, F.w, F.h);
    ctx.beginPath(); ctx.moveTo(F.x + F.w / 2, F.y); ctx.lineTo(F.x + F.w / 2, F.y + F.h); ctx.stroke();
    ctx.beginPath(); ctx.arc(F.x + F.w / 2, F.y + F.h / 2, 70, 0, TAU); ctx.stroke();
    ctx.strokeRect(F.x, F.y + F.h * .25, F.w * .13, F.h * .5); ctx.strokeRect(F.x + F.w * .87, F.y + F.h * .25, F.w * .13, F.h * .5);
    const lastGoal = goals.at(-1);
    for (const side of [0, 1]) {
      const gx = side ? F.x + F.w : F.x - 24;
      const shake = lastGoal && ((lastGoal.ti === 0) === (side === 1)) && t - lastGoal.t < 1 ? Math.sin(t * 60) * 3 : 0;
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(gx + shake, F.y + GY0, 24, GY1 - GY0);
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1;
      for (let q = GY0; q <= GY1; q += 8) { ctx.beginPath(); ctx.moveTo(gx + shake, F.y + q); ctx.lineTo(gx + 24 + shake, F.y + q); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.fillRect(side ? F.x + F.w - 2 : F.x - 2, F.y + GY0 - 4, 4, GY1 - GY0 + 8);
    }
    // tableau d'affichage et stats
    panel(ctx, W / 2 - 360, 16, 720, 80, 14);
    text(ctx, T[0].nom, W / 2 - 100, 64, { size: 26, weight: 700, color: T[0].couleur, align: 'right' });
    text(ctx, T[1].nom, W / 2 + 100, 64, { size: 26, weight: 700, color: T[1].couleur });
    text(ctx, `${score[0]} - ${score[1]}`, W / 2, 68, { size: 42, font: DISPLAY, weight: 400, align: 'center' });
    text(ctx, done ? 'FIN' : minute + "'", W - 40, 64, { size: 32, font: MONO, weight: 700, align: 'right', color: '#f2c14e' });
    const ps = R._poss[i0 + 1] || [0, 0], tot = ps[0] + ps[1], p0 = tot ? Math.round(ps[0] / tot * 100) : 50;
    text(ctx, `Possession  ${p0} % · ${100 - p0} %`, 30, 48, { size: 15, weight: 600, color: '#9db0a4' });
    text(ctx, `Tirs  ${shots[0]} · ${shots[1]}`, 30, 72, { size: 15, weight: 600, color: '#9db0a4' });
    // traînée du ballon
    for (let q = Math.max(0, i0 - 6); q < i0; q++) {
      const f = R.frames[q]; const [x, y] = P(f[np * 2], f[np * 2 + 1] - f[np * 2 + 2]);
      ctx.fillStyle = `rgba(255,255,255,${(q - i0 + 7) / 7 * .3})`; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
    }
    // joueurs
    const down = a[np * 2 + 3];
    for (let i = 0; i < np; i++) {
      const ti = i < 5 ? 0 : 1, gk = i % 5 === 0;
      const px = lerp(a[i * 2], b[i * 2], k), py = lerp(a[i * 2 + 1], b[i * 2 + 1], k);
      const moving = Math.hypot(b[i * 2] - a[i * 2], b[i * 2 + 1] - a[i * 2 + 1]) > 2;
      const [x, y] = P(px, py);
      const isDown = down & (1 << i);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 12, 13, 5, 0, 0, TAU); ctx.fill();
      if (!isDown && moving) { ctx.strokeStyle = T[ti].bord; ctx.lineWidth = 4; ctx.lineCap = 'round'; const s = Math.sin(t * 16 + i) * 5; ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(-4 + s, 15); ctx.moveTo(4, 6); ctx.lineTo(4 - s, 15); ctx.stroke(); }
      ctx.fillStyle = gk ? '#f2c14e' : T[ti].couleur;
      ctx.beginPath(); if (isDown) ctx.ellipse(0, 4, 16, 9, 0, 0, TAU); else ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = T[ti].bord; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      text(ctx, T[ti].joueurs[i % 5], x, y - 18, { size: 13, weight: 700, align: 'center', color: '#fff' });
      if (isDown) text(ctx, '💫', x + 14, y - 6, { size: 14, align: 'center' });
    }
    // ballon
    const bx = lerp(a[np * 2], b[np * 2], k), by = lerp(a[np * 2 + 1], b[np * 2 + 1], k), bz = lerp(a[np * 2 + 2], b[np * 2 + 2], k);
    const [x, y] = P(bx, by);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 6, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - bz, 7 + bz / 40, 0, TAU); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
    // bulles d'action
    for (const e of ev.filter(e => e.type === 'pop' && t - e.t < 1.6)) {
      const age = t - e.t; const [px, py] = P(e.x, e.y);
      ctx.globalAlpha = Math.max(0, 1 - age / 1.6); text(ctx, e.text, px, py - age * 30, { size: 26, font: DISPLAY, weight: 400, align: 'center', color: e.c }); ctx.globalAlpha = 1;
    }
    // commentaires
    panel(ctx, F.x + F.w / 2 - 340, H - 86, 680, 74, 12, 'rgba(0,0,0,.6)');
    ev.filter(e => e.type === 'say').slice(-3).reverse().forEach((l, i) => text(ctx, (i ? '' : '🎙 ') + l.text, W / 2, H - 58 + i * 22, { size: i ? 15 : 19, weight: i ? 500 : 700, align: 'center', color: i ? '#9db0a4' : '#eef3ea' }));
    // coup d'envoi
    const ko = ev.filter(e => e.type === 'ko').at(-1);
    if (ko && t < ko.until) {
      const r = Math.ceil(ko.until - t);
      panel(ctx, W / 2 - 190, F.y + 18, 380, 96, 16, 'rgba(0,0,0,.72)');
      text(ctx, ko.first ? "COUP D'ENVOI" : 'REPRISE', W / 2, F.y + 56, { size: 26, font: DISPLAY, weight: 400, align: 'center' });
      text(ctx, `🔔 dans ${r}`, W / 2, F.y + 94, { size: 26, font: MONO, weight: 700, align: 'center', color: '#f2c14e' });
    }
    if (lastGoal && t - lastGoal.t < 3) {
      panel(ctx, W / 2 - 270, H / 2 - 100, 540, 190, 18, 'rgba(0,0,0,.82)');
      text(ctx, 'BUT !', W / 2, H / 2 + 10, { size: 110, font: DISPLAY, weight: 400, align: 'center', color: '#f2c14e' });
      text(ctx, `${lastGoal.n} · ${lastGoal.min}'`, W / 2, H / 2 + 64, { size: 30, weight: 700, align: 'center', color: T[lastGoal.ti].couleur });
    }
    if (done) {
      panel(ctx, W / 2 - 330, H / 2 - 100, 660, 200, 18, 'rgba(0,0,0,.85)');
      const w = score[0] === score[1] ? 'Match nul' : `Victoire de ${T[score[0] > score[1] ? 0 : 1].nom}`;
      text(ctx, w, W / 2, H / 2 - 10, { size: 52, font: DISPLAY, weight: 400, align: 'center', color: '#f2c14e' });
      text(ctx, `${score[0]} - ${score[1]}`, W / 2, H / 2 + 34, { size: 28, weight: 700, align: 'center' });
      text(ctx, goals.map(g => `${g.n} ${g.min}'`).join(' · ') || 'Aucun but', W / 2, H / 2 + 70, { size: 17, weight: 500, align: 'center', color: '#9db0a4' });
    }
  }

  // ================= BOXE =================
  function boxe(ctx, R, t) {
    const { cx: CX, cy: CY } = R.meta.ring;
    const n = R.meta.noms.length;
    const { a, b, k } = frameAt(R, t);
    const half = lerp(a[0], b[0], k);
    const falls = R.events.filter(e => e.type === 'fall' && e.t <= t);
    const fallen = new Map(falls.map(e => [e.i, e]));
    const kos = new Array(n).fill(0);
    falls.forEach(e => { if (e.by != null) kos[e.by]++; });
    const done = t >= R.duration;
    ctx.fillStyle = '#0b3a5c'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2;
    for (let y = 20; y < H; y += 36) { ctx.beginPath(); for (let x = 0; x <= 900; x += 20) ctx.lineTo(x, y + Math.sin(x / 60 + t * 1.6 + y) * 5); ctx.stroke(); }
    text(ctx, 'BATTLE ROYALE', 30, 60, { size: 40, font: DISPLAY, weight: 400, color: '#f2c14e' });
    text(ctx, done ? 'TERMINÉ' : fmt(R.duration - t), 860, 60, { size: 36, font: MONO, weight: 700, align: 'right' });
    ctx.fillStyle = '#5a3b22'; ctx.fillRect(CX - half - 8, CY - half + 8, 2 * half + 16, 2 * half + 16);
    ctx.fillStyle = '#d9c8a3'; ctx.fillRect(CX - half, CY - half, 2 * half, 2 * half);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 6; ctx.strokeRect(CX - half, CY - half, 2 * half, 2 * half);
    const fighter = (x, y, c, dir, punch, alpha = 1) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 12, 13, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2; ctx.stroke();
      for (const s of [-1, 1]) { const an = dir + s * .55, r = s === 1 && punch ? 20 : 12; ctx.fillStyle = '#e8453c'; ctx.beginPath(); ctx.arc(Math.cos(an) * r, Math.sin(an) * r, 6, 0, TAU); ctx.fill(); }
      ctx.restore();
    };
    // éclaboussures
    for (const e of falls) {
      const age = t - e.t; if (age > 1.4) continue;
      ctx.strokeStyle = `rgba(255,255,255,${1 - age / 1.4})`; ctx.lineWidth = 3;
      for (const m of [1, 1.6]) { ctx.beginPath(); ctx.arc(e.x, e.y, age * 40 * m, 0, TAU); ctx.stroke(); }
      fighter(e.x, e.y + age * 10, R.meta.couleurs[e.i], 0, 0, Math.max(0, 1 - age * 1.2));
    }
    for (let i = 0; i < n; i++) {
      if (fallen.has(i)) continue;
      const o = 1 + i * 4; if (!a[o] && !a[o + 1]) continue;
      fighter(lerp(a[o], b[o] || a[o], k), lerp(a[o + 1], b[o + 1] || a[o + 1], k), R.meta.couleurs[i], a[o + 2] / 100, a[o + 3]);
    }
    // classement : en lice (par KO), puis éliminés par place
    const alive = [...Array(n).keys()].filter(i => !fallen.has(i)).sort((p, q) => kos[q] - kos[p]);
    const out = [...fallen.values()].sort((p, q) => p.place - q.place).map(e => e.i);
    const rows = [...alive, ...out];
    panel(ctx, 900, 20, 360, H - 40);
    text(ctx, `EN LICE · ${alive.length}`, 920, 54, { size: 14, weight: 700, color: '#9db0a4' });
    const maxRows = Math.floor((H - 100) / 22), cols = rows.length > maxRows ? 2 : 1, per = Math.ceil(rows.length / cols), colW = cols === 2 ? 172 : 340;
    rows.forEach((i, q) => {
      const col = Math.floor(q / per), r = q % per, x = 920 + col * colW, y = 80 + r * 22;
      const f = fallen.get(i);
      ctx.globalAlpha = f ? .45 : 1;
      ctx.fillStyle = R.meta.couleurs[i]; ctx.beginPath(); ctx.roundRect(x, y - 11, 12, 14, 3); ctx.fill();
      text(ctx, R.meta.noms[i], x + 18, y + 1, { size: 15, weight: f ? 500 : 700 });
      text(ctx, f ? `${f.place}e` : kos[i] ? `${kos[i]} KO` : '', x + colW - 22, y + 1, { size: 13, font: MONO, weight: 700, align: 'right', color: f ? '#9db0a4' : '#f2c14e' });
      ctx.globalAlpha = 1;
    });
    if (done) {
      const w = R.result.winner;
      panel(ctx, CX - 300, CY - 70, 600, 140, 18, 'rgba(0,0,0,.8)');
      ctx.fillStyle = R.meta.couleurs[w]; ctx.beginPath(); ctx.arc(CX - 240, CY, 26, 0, TAU); ctx.fill();
      text(ctx, `${R.meta.noms[w]} gagne !`, CX + 30, CY + 20, { size: 52, font: DISPLAY, weight: 400, align: 'center', color: '#f2c14e' });
    }
  }

  const DRAW = { chevaux, foot, boxe };
  function draw(canvas, R, t) {
    const ctx = canvas.getContext('2d');
    DRAW[R.sport](ctx, R, Math.max(0, Math.min(t, R.duration + .01)));
  }
  return { draw };
})();
