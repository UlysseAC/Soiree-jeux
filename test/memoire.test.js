// Mots et questions : d'un jeu à l'autre dans la soirée, un mot ne revient qu'une fois toute la liste passée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';
import { moinsUtilises } from '../server/util.js';

test('tirage : d\'abord ce qui a le moins servi, au hasard', () => {
  const c = {};
  const vus = [];
  for (let k = 0; k < 3; k++) vus.push(...moinsUtilises(['a', 'b', 'c', 'd', 'e', 'f'], c, 2));
  assert.deepEqual([...vus].sort(), ['a', 'b', 'c', 'd', 'e', 'f'], 'toute la liste avant de revenir');
  assert.ok(Object.values(c).every(n => n === 1));
});

test('les mots du Mime ne reviennent pas d\'un jeu à l\'autre dans la soirée (tant que la liste n\'est pas épuisée)', () => {
  const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik'];
  const MOTS = Array.from({ length: 12 }, (_, i) => `Mot${i}`);
  const memoire = {}; // celle de la soirée (ctx.memoire), partagée par les deux journées
  const jouer = () => {
    let t = Date.UTC(2026, 9, 13, 7, 0);
    const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), programme: 'mj1' };
    Object.assign(cfg.jeux.mj1, { type: 'mime', motsMime: MOTS.join('\n'), tempsMime: 45, tempsPret: 10 });
    const ctx = { now: () => t, cfg, sfx: () => {}, memoire };
    const g = mj.start(ctx);
    NAMES.forEach((n, i) => mj.claim(ctx, g, `p${i}`, n));
    const r = g.rounds[0];
    t = r.at - 299e3; mj.tick(ctx, g);
    for (const p of r.joueurs) mj.playerAction(ctx, g, `p${NAMES.indexOf(p)}`, { type: 'compris' });
    const mime = () => `p${NAMES.indexOf(r.mi.tours[r.mi.tour].mime)}`;
    mj.playerAction(ctx, g, mime(), { type: 'pret' }); t += 50; mj.tick(ctx, g);
    for (let k = 0; k < 5; k++) mj.playerAction(ctx, g, mime(), { type: 'passer' });
    return r.mi.vus;
  };
  const a = jouer(), b = jouer();
  assert.equal(a.length, 6);
  assert.equal(b.length, 6);
  assert.ok(b.every(m => !a.includes(m)), `jeu 1 : ${a} / jeu 2 : ${b}`);
});
