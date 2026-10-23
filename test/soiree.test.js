import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Soiree, restore, defaultState } from '../server/soiree.js';

const nouvelle = () => new Soiree(defaultState());

test('programme : tous les jeux par défaut, jeux inconnus et doublons ignorés', () => {
  const so = nouvelle();
  assert.deepEqual(so.s.config.programme, ['chemin', 'duel', 'grandpari', 'minijeux', 'enquete']);
  assert.ok(so.admin({ type: 'programme', ids: ['grandpari', 'inconnu', 'chemin', 'grandpari'] }).ok);
  assert.deepEqual(so.s.config.programme, ['grandpari', 'chemin']);
  assert.deepEqual(so.adminView().programme, ['grandpari', 'chemin']);
});

test('ancienne sauvegarde sans programme : tous les jeux ; programme sauvegardé conservé', () => {
  const ancienne = defaultState();
  delete ancienne.config.programme;
  assert.deepEqual(restore(JSON.parse(JSON.stringify(ancienne))).config.programme, ['chemin', 'duel', 'grandpari', 'minijeux', 'enquete']);
  const s = defaultState();
  s.config.programme = ['duel'];
  assert.deepEqual(restore(JSON.parse(JSON.stringify(s))).config.programme, ['duel']);
});

test('démarrer la soirée : premier jeu du programme, classement remis à zéro', () => {
  const so = nouvelle();
  so.s.history.push({ gameId: 'chemin', results: [] });
  so.s.bonus = { x: 5 };
  so.admin({ type: 'programme', ids: [] });
  assert.equal(so.admin({ type: 'demarrerSoiree' }).ok, false, 'programme vide refusé');
  so.admin({ type: 'programme', ids: ['grandpari', 'duel'] });
  assert.ok(so.admin({ type: 'demarrerSoiree' }).ok);
  assert.equal(so.sess.gameId, 'grandpari');
  assert.deepEqual(so.s.history, []);
  assert.deepEqual(so.s.bonus, {});
  assert.equal(so.adminView().soiree.started, true);
});

test('jeu suivant : suit le programme, refusé pendant une partie et après le dernier jeu', () => {
  const so = nouvelle();
  so.admin({ type: 'programme', ids: ['grandpari', 'duel'] });
  so.admin({ type: 'demarrerSoiree' });
  so.sess.status = 'playing';
  assert.equal(so.admin({ type: 'jeuSuivant' }).ok, false);
  so.sess.status = 'finished';
  assert.ok(so.admin({ type: 'jeuSuivant' }).ok);
  assert.equal(so.sess.gameId, 'duel');
  assert.equal(so.admin({ type: 'jeuSuivant' }).ok, false, 'dernier jeu');
  // Jeu actuel retiré du programme : on repart du premier.
  so.admin({ type: 'programme', ids: ['chemin', 'grandpari'] });
  assert.ok(so.admin({ type: 'jeuSuivant' }).ok);
  assert.equal(so.sess.gameId, 'chemin');
});

test('régler un autre jeu que le jeu actuel, même pendant la soirée', () => {
  const so = nouvelle();
  so.admin({ type: 'demarrerSoiree' });
  assert.equal(so.sess.gameId, 'chemin');
  const avant = so.s.config.games.chemin.dureeMax;
  assert.ok(so.admin({ type: 'config', scope: 'jeu', gameId: 'duel', path: 'vies', value: 5 }).ok);
  assert.equal(so.s.config.games.duel.vies, 5);
  assert.equal(so.s.config.games.chemin.dureeMax, avant);
});

test('terminer la soirée garde le classement', () => {
  const so = nouvelle();
  so.admin({ type: 'demarrerSoiree' });
  so.s.history.push({ gameId: 'chemin', results: [] });
  assert.ok(so.admin({ type: 'terminerSoiree' }).ok);
  assert.equal(so.s.soiree.started, false);
  assert.equal(so.s.history.length, 1);
});

test('L\'Enquête : un joueur non inscrit rejoint la partie en cours avec un personnage libre', () => {
  const so = nouvelle();
  so.admin({ type: 'choisirJeu', gameId: 'enquete' });
  so.admin({ type: 'config', scope: 'soiree', path: 'decompte', value: 60 });
  for (let i = 0; i < 4; i++) so.join('tok' + i, 'Joueur' + i);
  so.admin({ type: 'demarrer' });
  Object.keys(so.s.people).forEach(p => so.register(p));
  assert.equal(so.admin({ type: 'lancerJeu' }).ok, true);
  const retard = so.join('retard', 'Retardataire');
  const tok = retard.token, vue = () => so.playerView(tok);
  assert.equal(vue().peutRejoindre, true);
  assert.equal(so.player(tok, { type: 'rejoindreEnCours' }).ok, true);
  assert.equal(vue().me.registered, true);
  assert.ok(vue().game.moi.nom, 'il a un personnage');
  assert.equal(so.player(tok, { type: 'rejoindreEnCours' }).ok, false, 'une seule fois');
  assert.ok(retard.pid);
});
