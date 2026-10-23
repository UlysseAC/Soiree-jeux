// Test des tâches : le bac à sable enchaîne les 22 tâches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerBac } from '../server/testtaches.js';
import * as E from '../server/games/enquete.js';

test('22 tâches (solo + à plusieurs de chacune des 11 salles)', () => {
  const bac = creerBac(E.defaultConfig());
  const { liste } = bac.liste();
  assert.equal(liste.length, 22);
  assert.equal(liste.filter(x => x.groupe).length, 11);
});

test('chaque tâche se lance : un panneau par rôle, solo réussie par « tacheReussie »', () => {
  const bac = creerBac(E.defaultConfig());
  const { liste } = bac.liste();
  liste.forEach((it, i) => {
    const v = bac.choisir(i);
    assert.equal(v.vues.length, it.joueurs, it.nom);
    assert.equal(v.succes, false);
    if (it.groupe) {
      assert.ok(v.vues.every((x, k) => x.tache.etat === 'jeu' && x.tache.role === k && x.tache.vue), `${it.nom} : session lancée`);
    } else {
      assert.ok(v.vues[0].tache.params, it.nom);
      const r = bac.action('t1', { type: 'tacheReussie' });
      assert.equal(r.succes, true, it.nom);
    }
  });
});

test('tâche à plusieurs : chacun agit dans son panneau, puis on passe à la suivante', () => {
  const bac = creerBac(E.defaultConfig());
  const i = bac.liste().liste.findIndex(x => x.id === 'canalisations');
  const v = bac.choisir(i);
  assert.equal(v.vues.length, 2);
  const n = v.vues[0].tache.vue.n;
  assert.equal(bac.action('t1', { type: 'tache', op: 'tourner', i: 0 }).r.ok, true);
  assert.match(bac.action('t2', { type: 'tache', op: 'tourner', i: 0 }).r.msg, /autre moitié/);
  assert.equal(bac.action('t2', { type: 'tache', op: 'tourner', i: n - 1 }).r.ok, true);
  assert.equal(bac.choisir(0).succes, false, 'la tâche suivante repart de zéro');
});
