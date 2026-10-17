// Changer de mini-jeu pendant la soirée : seulement pour les rounds qui ne sont pas encore annoncés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès'];

function setup() {
  const t = Date.UTC(2026, 9, 12, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), programme: 'mj1,mj2,mj1' };
  const ctx = { now: () => t, cfg, sfx: () => {} };
  return { ctx, g: mj.start(ctx) };
}

test('un round à venir peut changer de mini-jeu', () => {
  const { ctx, g } = setup();
  assert.equal(mj.adminAction(ctx, g, { type: 'changerJeu', n: 2, slot: 'mj5' }).ok, true);
  assert.equal(g.rounds[1].jeu, 'mj5');
  assert.equal(g.rounds[0].jeu, 'mj1', 'les autres rounds ne bougent pas');
});

test('un round annoncé ou terminé ne change plus de mini-jeu', () => {
  const { ctx, g } = setup();
  g.rounds[0].status = 'annonce';
  assert.equal(mj.adminAction(ctx, g, { type: 'changerJeu', n: 1, slot: 'mj5' }).ok, false);
  assert.equal(g.rounds[0].jeu, 'mj1');
});

test('mini-jeu inconnu refusé', () => {
  const { ctx, g } = setup();
  assert.equal(mj.adminAction(ctx, g, { type: 'changerJeu', n: 2, slot: 'mj9' }).ok, false);
});
