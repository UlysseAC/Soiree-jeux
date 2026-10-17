// Tirage au sort : seulement les connectés, 3 rounds au plus (sans le quiz), et le détective en avant-dernier pour égaliser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];

function setup(programme, connectes = NAMES) {
  let t = Date.UTC(2026, 9, 12, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), programme, rounds: programme.split(',').length };
  for (const s of mj.SLOTS) Object.assign(cfg.jeux[s], { type: 'manuel', joueurs: 2, points: '10, 6' });
  Object.assign(cfg.jeux.mj6, { type: 'disparu', points: '10, 6, 3, 1, 1, 1' });
  Object.assign(cfg.jeux.mj7, { type: 'quiz', questions: 'Q ?\nA\n*B\nC\nD' });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  for (const n of connectes) mj.claim(ctx, g, `tel:${n}`, n);
  // joue un round tout de suite (annonce + commencer), places dans l'ordre
  const jouer = r => {
    mj.adminAction(ctx, g, { type: 'annoncer' });
    if (r.status === 'saute') return;
    mj.adminAction(ctx, g, { type: 'commencer' });
    if (r.type === 'manuel' || r.type === 'disparu') mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: Object.fromEntries(r.equipes.map((_, i) => [i, i + 1])) });
    t += 60e3;
  };
  return { ctx, g, jouer };
}

test('seuls les joueurs connectés sont tirés au sort', () => {
  const { g, jouer } = setup('mj1,mj2,mj3', ['Léa', 'Hugo', 'Inès']);
  for (const r of g.rounds) jouer(r);
  const tous = g.rounds.flatMap(r => r.joueurs);
  assert.ok(tous.length > 0);
  assert.ok(tous.every(n => ['Léa', 'Hugo', 'Inès'].includes(n)), JSON.stringify(tous));
});

test('personne ne joue plus de 3 rounds (le quiz ne compte pas) ; un round sans joueur libre est sauté', () => {
  const { g, jouer } = setup('mj1,mj2,mj3,mj4,mj5,mj1,mj2,mj3,mj4,mj5,mj7', ['Léa', 'Hugo', 'Inès', 'Malik']);
  for (const r of g.rounds) jouer(r);
  for (const n of ['Léa', 'Hugo', 'Inès', 'Malik']) assert.ok(mj.joues(g, n) <= 3, `${n} : ${mj.joues(g, n)}`);
  assert.ok(g.rounds.some(r => r.status === 'saute'), 'des rounds sont sautés faute de joueur libre');
  assert.equal(g.rounds.at(-1).joueurs.length, 4, 'le quiz réunit tout le monde, même à 3 rounds');
});

test('détective en avant-dernier : tous ceux sous 3 rounds jouent, points ×2 pour 1 round joué, ×3 pour aucun', () => {
  // 6 connectés ; 2 rounds de 2 : 4 joueurs à 1 round, 2 joueurs à 0
  const { g, jouer } = setup('mj1,mj2,mj6,mj7');
  jouer(g.rounds[0]); jouer(g.rounds[1]);
  const r = g.rounds[2];
  jouer(r);
  assert.equal(r.joueurs.length, 6, 'tout le monde est sous 3 rounds');
  const zero = NAMES.filter(n => !g.rounds[0].joueurs.includes(n) && !g.rounds[1].joueurs.includes(n));
  for (const n of r.joueurs) {
    const attendu = zero.includes(n) ? 3 : 2;
    assert.equal(r.multi[n], attendu, n);
    const base = [10, 6, 3, 1, 1, 1][r.points[n].place - 1];
    assert.equal(r.points[n].points, base * attendu, `${n} : points ×${attendu}`);
  }
});

test('détective en avant-dernier sauté si tout le monde a déjà 3 rounds', () => {
  const { g, jouer } = setup('mj1,mj2,mj3,mj4,mj5,mj1,mj2,mj3,mj4,mj6,mj7', ['Léa', 'Hugo']);
  for (const r of g.rounds.slice(0, -1)) jouer(r);
  assert.equal(g.rounds.at(-2).status, 'saute');
});
