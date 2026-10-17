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

test('nouvelle soirée : les inscriptions et les noms pris sur les téléphones sont gardés', () => {
  const state = defaultState();
  state.people.p0 = { id: 'p0', token: 't0', name: 'Léa' };
  state.people.p1 = { id: 'p1', token: 't1', name: 'Hugo' };
  state.config.games.minijeux.joueurs = 'Léa\nHugo';
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 20, 0) });
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  so.admin({ type: 'lancerJeu' });
  assert.equal(so.claimMini('t0', 'Léa').ok, true);
  so.admin({ type: 'arreter' });
  assert.equal(so.admin({ type: 'nouvelleSoiree' }).ok, true);
  assert.equal(so.sess.status, 'idle');
  so.admin({ type: 'lancerJeu' });
  assert.equal(Object.keys(so.sess.game.claims).length, 1, 'les noms pris sont repris dans la nouvelle partie');
  assert.equal(so.claimMini('t1', 'Léa').ok, false, 'Léa reste prise sur son téléphone');
});

test('nouvelle soirée : les joueurs inscrits à un jeu restent inscrits', () => {
  const state = defaultState();
  state.people.p0 = { id: 'p0', token: 't0', name: 'Léa' };
  state.session.registered = ['p0'];
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 20, 0) });
  so.admin({ type: 'nouvelleSoiree' });
  assert.deepEqual(state.session.registered, ['p0']);
});
