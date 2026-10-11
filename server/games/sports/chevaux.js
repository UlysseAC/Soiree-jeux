// Course de chevaux : simulation enregistrée image par image, rejouée par l'écran public.
import { makeRng } from './rng.js';

export const COLORS = ['#e8574a', '#f2c14e', '#eef3ea', '#c98a4b', '#b77be0', '#6fb7ff', '#5fd08a', '#f08fc0'];
const DT = 0.02, FPS = 10;

// frames[k] = progression (0 → 1) de chaque cheval à t = k / FPS.
export function simulate({ noms, duree, tours }, seed) {
  const rng = makeRng(seed);
  const horses = noms.map((n, i) => ({ n, i, x: 0, v: 0, base: rng.range(.92, 1.08), burst: rng.range(.55, .85), ph: rng.range(0, 6.28), fin: null }));
  const frames = [];
  const order = [];
  let t = 0, step = 0;
  const every = Math.round(1 / FPS / DT);
  while (order.length < horses.length && t < duree * 1.6) {
    t += DT;
    const p = t / duree;
    for (const h of horses) {
      if (h.fin != null) continue;
      const surge = p > h.burst ? 1 + .25 * Math.sin(Math.min(1, (p - h.burst) * 4) * Math.PI / 2) : 1;
      const target = h.base * surge * (1 + .18 * Math.sin(t * 1.3 + h.ph) + .08 * Math.sin(t * 3.7 + h.i));
      h.v += (target - h.v) * Math.min(1, DT * 2);
      h.x += h.v * DT / duree;
      if (h.x >= 1) { h.x = 1; h.fin = t; order.push(h.i); }
    }
    if (++step % every === 0) frames.push(horses.map(h => Math.round(h.x * 10000) / 10000));
  }
  frames.push(horses.map(h => h.x));
  return {
    sport: 'chevaux', fps: FPS, duration: frames.length / FPS,
    meta: { noms, couleurs: COLORS.slice(0, noms.length), tours },
    frames,
    result: { order },
  };
}
