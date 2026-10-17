// L'écran public ne doit pas rester bloqué sur le classement de la soirée quand un jeu démarre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Soiree, defaultState } from '../server/soiree.js';

test('lancer un jeu masque le classement de la soirée affiché sur l\'écran', () => {
  const state = defaultState();
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 7, 0) });
  so.admin({ type: 'afficherClassement', mode: 'classement' });
  assert.equal(state.show, 'classement');
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  so.admin({ type: 'lancerJeu' });
  assert.equal(state.session.status, 'playing');
  assert.equal(state.show, null, 'l\'écran ne reste pas sur le classement');
});
