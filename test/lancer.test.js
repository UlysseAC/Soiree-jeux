// Lancer un mini-jeu maintenant : hors programme, les joueurs inscrits sont tirés au sort tout de suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik'];

function setup() {
  const t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1,mj2' };
  Object.assign(cfg.jeux.mj3, { type: 'quiz', questions: 'Q ?\nA\n*B\nC\nD', tempsQuestion: 20, tempsRevelation: 8, points: '30, 20, 15, 10' });
  const ctx = { now: () => t, cfg, sfx: () => {}, name: p => p };
  const g = mj.start(ctx);
  NAMES.forEach((n, i) => mj.claim(ctx, g, `p${i}`, n));
  return { ctx, g, t };
}

test('lancer maintenant : le mini-jeu choisi est annoncé hors programme', () => {
  const { ctx, g } = setup();
  const prevus = g.rounds.filter(x => x.status === 'prevu').length;
  const res = mj.adminAction(ctx, g, { type: 'lancerMaintenant', slot: 'mj3' });
  assert.equal(res.ok, true);
  const r = g.rounds.at(-1);
  assert.equal(r.jeu, 'mj3');
  assert.equal(r.hors, true);
  assert.equal(r.status, 'annonce');
  assert.equal(r.joueurs.length, NAMES.length, 'tous les inscrits jouent le quiz');
  assert.equal(g.rounds.filter(x => x.status === 'prevu').length, prevus, 'la programme prévue reste intacte');
});

test('lancer maintenant : refusé pendant un round, et pour un mini-jeu inconnu', () => {
  const { ctx, g } = setup();
  assert.equal(mj.adminAction(ctx, g, { type: 'lancerMaintenant', slot: 'mj9' }).ok, false);
  mj.adminAction(ctx, g, { type: 'lancerMaintenant', slot: 'mj3' });
  assert.equal(mj.adminAction(ctx, g, { type: 'lancerMaintenant', slot: 'mj3' }).ok, false);
});

test('lancer maintenant : sans inscrits, c\'est refusé', () => {
  const t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: '', decalage: -120 };
  const ctx = { now: () => t, cfg, sfx: () => {}, name: p => p };
  const g = mj.start(ctx);
  assert.equal(mj.adminAction(ctx, g, { type: 'lancerMaintenant', slot: 'mj1' }).ok, false);
});
