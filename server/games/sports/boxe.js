// Battle royale de boxe sur un ring posé sur l'eau : simulation enregistrée, rejouée par l'écran public.
import { makeRng } from './rng.js';

export const RING = { cx: 450, cy: 390, half: 230 };
const DT = 0.02, FPS = 8;

export function colorFor(i, n) {
  return `hsl(${Math.round(i * 360 / n + (i % 2) * 18)}, ${i % 3 === 0 ? 85 : 70}%, ${i % 2 ? 62 : 52}%)`;
}

// noms : les combattants (les joueurs inscrits). Le ring rétrécit à la fin pour finir à temps.
export function simulate({ noms, duree }, seed) {
  const rng = makeRng(seed);
  const n = noms.length;
  const { cx: CX, cy: CY } = RING;
  const f = noms.map((name, i) => {
    const a = i / n * Math.PI * 2, r = rng.range(40, 150);
    return { name, i, x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, vx: 0, vy: 0, pow: rng.range(.8, 1.25), cd: rng.range(0, 1), fall: null, place: null, kos: 0, punch: 0, dir: 0, last: null };
  });
  let t = 0, half = RING.half;
  const frames = [], events = [];
  const alive = () => f.filter(p => p.fall == null);
  const every = Math.round(1 / FPS / DT);
  let step = 0;
  const snap = () => {
    // demi-côté du ring, puis pour chaque combattant [x, y, direction ×100, coup de poing 0/1] ou 0 s'il est tombé
    frames.push([Math.round(half), ...f.flatMap(p => (p.fall == null ? [Math.round(p.x), Math.round(p.y), Math.round(p.dir * 100), p.punch > 0 ? 1 : 0] : [0, 0, 0, 0]))]);
  };
  snap();
  while (alive().length > 1 && t < duree * 1.5) {
    t += DT;
    const p = t / duree;
    half = RING.half * (p < .6 ? 1 : Math.max(.2, 1 - (p - .6) * 1.9));
    const al = alive();
    for (const a of al) {
      let tgt = null, bd = 1e9;
      for (const b of al) if (b !== a) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2; if (d < bd) { bd = d; tgt = b; } }
      if (tgt) {
        const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy) || 1;
        a.dir = Math.atan2(dy, dx);
        a.vx += dx / d * 60 * DT; a.vy += dy / d * 60 * DT;
        a.cd -= DT;
        if (d < 34 && a.cd <= 0) {
          a.cd = rng.range(.5, 1.1); a.punch = .18;
          const k = rng.range(90, 190) * a.pow;
          tgt.vx += dx / d * k; tgt.vy += dy / d * k; tgt.last = a;
        }
      }
      a.vx += rng.range(-30, 30) * DT; a.vy += rng.range(-30, 30) * DT;
      a.punch = Math.max(0, a.punch - DT);
    }
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 28) { const o = (28 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
    }
    for (const a of al) {
      a.x += a.vx * DT; a.y += a.vy * DT; a.vx *= 1 - DT * 3; a.vy *= 1 - DT * 3;
      if ((Math.abs(a.x - CX) > half + 6 || Math.abs(a.y - CY) > half + 6) && alive().length > 1) {
        a.place = alive().length;
        a.fall = t;
        if (a.last) a.last.kos++;
        events.push({ t: Math.round(t * 100) / 100, type: 'fall', i: a.i, place: a.place, x: Math.round(a.x), y: Math.round(a.y), by: a.last ? a.last.i : null });
      }
    }
    if (++step % every === 0) snap();
  }
  // Si le temps est écoulé à plusieurs, les derniers sont départagés au hasard (rare : le ring rétrécit).
  const rest = alive().sort(() => rng() - .5);
  rest.forEach((a, k) => { a.place = rest.length - k; if (k < rest.length - 1) { a.fall = t; events.push({ t: Math.round(t * 100) / 100, type: 'fall', i: a.i, place: a.place, x: Math.round(a.x), y: Math.round(a.y), by: null }); } });
  snap();
  const winner = f.find(p => p.place === 1);
  return {
    sport: 'boxe', fps: FPS, duration: frames.length / FPS,
    meta: { ring: RING, noms, couleurs: noms.map((_, i) => colorFor(i, n)) },
    frames, events,
    result: { places: f.map(p => p.place), kos: f.map(p => p.kos), winner: winner.i },
  };
}
