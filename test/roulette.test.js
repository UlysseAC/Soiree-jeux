// Roulette : un nom tiré parmi les personnes connectées, envoyé à l'écran avec son heure de départ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Soiree, defaultState } from '../server/soiree.js';

function setup(noms) {
  const state = defaultState();
  noms.forEach((name, i) => { state.people[`p${i}`] = { id: `p${i}`, token: `t${i}`, name }; });
  const t = Date.UTC(2026, 9, 13, 21, 0);
  return { state, so: new Soiree(state, { now: () => t }), t };
}

test('roulette : le gagnant est une personne connectée, et l\'écran reçoit le tirage', () => {
  const { state, so, t } = setup(['Léa', 'Hugo', 'Inès']);
  assert.equal(so.admin({ type: 'roulette' }).ok, true);
  const r = state.roulette;
  assert.ok(['Léa', 'Hugo', 'Inès'].includes(r.winner));
  assert.equal(r.startAt, t);
  assert.equal(so.screenView().roulette.winner, r.winner);
});

test('roulette : refusée avec moins de deux personnes connectées', () => {
  const { state, so } = setup(['Léa']);
  assert.equal(so.admin({ type: 'roulette' }).ok, false);
  assert.equal(state.roulette, null);
});

test('roulette : une nouvelle roulette a un nouvel identifiant', () => {
  const { state, so } = setup(['Léa', 'Hugo']);
  so.admin({ type: 'roulette' });
  const premier = state.roulette.id;
  so.admin({ type: 'roulette' });
  assert.notEqual(state.roulette.id, premier);
});
