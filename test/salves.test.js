// Salves de rounds : battement entre les rounds d'une salve, pause entre les salves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];

test('salves « 2, 3 » : 5 rounds ; 2 min après chaque round, 20 min de pause entre les salves', () => {
  let t = Date.UTC(2026, 9, 12, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), salves: '2, 3', battement: 2, pause: 20, premier: 5, resultats: 0 };
  for (const s of mj.SLOTS) Object.assign(cfg.jeux[s], { type: 'manuel', joueurs: 2, points: '10, 6' });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  NAMES.forEach(n => mj.claim(ctx, g, `tel:${n}`, n));
  assert.equal(g.rounds.length, 5);
  assert.equal(g.rounds[0].at, t + 5 * 60e3);
  const ecarts = [];
  for (const r of g.rounds) {
    t = r.at - 1000; mj.tick(ctx, g);
    assert.equal(r.status, 'prevu', 'pas de tirage avant l\'heure');
    t = r.at; mj.tick(ctx, g);
    assert.equal(r.status, 'annonce', 'tirage à l\'heure prévue');
    mj.adminAction(ctx, g, { type: 'commencer' });
    t += 7 * 60e3; // le round dure 7 min
    mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: { 0: 1, 1: 2 } });
    mj.tick(ctx, g);
    const next = g.rounds[r.n];
    if (next) ecarts.push((next.at - r.finAt) / 60e3);
  }
  assert.deepEqual(ecarts, [2, 20, 2, 2]);
});
