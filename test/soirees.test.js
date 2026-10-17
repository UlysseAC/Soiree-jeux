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

test('nouvelle soirée : repart de zéro, les joueurs se réinscrivent (noms pris sur les téléphones compris)', () => {
  const state = defaultState();
  state.people.p0 = { id: 'p0', token: 't0', name: 'Léa' };
  state.config.games.minijeux.joueurs = 'Léa\nHugo';
  state.session.registered = ['p0'];
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 20, 0) });
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  so.admin({ type: 'lancerJeu' });
  assert.equal(so.claimMini('t0', 'Léa').ok, true);
  so.admin({ type: 'arreter' });
  so.admin({ type: 'nouvelleSoiree' });
  assert.deepEqual(state.session.registered, []);
  assert.equal(state.session.game, null);
  assert.equal(state.session.claims, undefined);
});

test('démarrer la soirée : garde les inscriptions et les noms pris sur les téléphones', () => {
  const state = defaultState();
  state.people.p0 = { id: 'p0', token: 't0', name: 'Léa' };
  state.config.games.minijeux.joueurs = 'Léa\nHugo';
  state.config.programme = ['minijeux'];
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 20, 0) });
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  state.session.registered = ['p0'];
  so.admin({ type: 'lancerJeu' });
  assert.equal(so.claimMini('t0', 'Léa').ok, true);
  so.admin({ type: 'arreter' });
  so.admin({ type: 'demarrerSoiree' });
  assert.deepEqual(state.session.registered, ['p0']);
  so.admin({ type: 'lancerJeu' });
  assert.equal(Object.keys(state.session.game.claims).length, 1);
});
