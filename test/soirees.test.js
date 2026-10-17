// Nouvelle soirée : le classement en cours est archivé, puis repart de zéro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Soiree, defaultState } from '../server/soiree.js';

test('nouvelle soirée : la précédente est archivée et le classement repart de zéro', () => {
  const state = defaultState();
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 20, 0) });
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  so.admin({ type: 'afficherClassement', mode: 'classement' });
  state.bonus = { p1: 5 };
  assert.equal(so.admin({ type: 'nouvelleSoiree' }).ok, true);
  assert.equal(state.soirees.length, 1);
  assert.ok(state.soirees[0].top.length <= 3, 'top 3 au plus');
  assert.equal(state.soirees[0].parties, 0);
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.bonus, {});
  assert.equal(state.show, null);
  assert.equal(so.adminView().soirees.length, 1);
});

test('nouvelle soirée refusée pendant une partie', () => {
  const state = defaultState();
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 20, 0) });
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  so.admin({ type: 'lancerJeu' });
  assert.equal(so.admin({ type: 'nouvelleSoiree' }).ok, false);
  assert.equal(state.soirees.length, 0);
});
