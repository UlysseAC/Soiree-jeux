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

test('anciens indices écrits salle par salle : regroupés dans les 3 pools communs', () => {
  const s = JSON.parse(JSON.stringify(defaultState()));
  s.config.games.enquete.indicesSalles = [{ textes: ['A', 'B', ''], p1: [70, 30, 0], p2: [10, 90, 0] }, { textes: ['A', 'C', ''], p1: [50, 50, 0], p2: [50, 50, 0] }];
  const pools = restore(s).config.games.enquete.poolsIndices;
  assert.deepEqual(pools[0].split('\n'), ['A | 70', 'B | 30', 'C | 50']);
  assert.deepEqual(pools[1].split('\n'), ['A | 10', 'B | 90', 'C | 50']);
  assert.equal(pools[2].split('\n').length, 3, 'le 3e pool reprend tous les textes');
  assert.equal(restore(s).config.games.enquete.indicesSalles, undefined);
  // tout premier format : une ligne = un indice par salle
  const t = JSON.parse(JSON.stringify(defaultState()));
  t.config.games.enquete.indices = ['X\nY', ''];
  t.config.games.enquete.indicesSalles = [{ textes: ['', '', ''], p1: [34, 33, 33], p2: [34, 33, 33] }];
  assert.deepEqual(restore(t).config.games.enquete.poolsIndices[0].split('\n').map(l => l.split(' | ')[0]), ['X', 'Y']);
  // déjà au nouveau format : rien ne change
  const u = JSON.parse(JSON.stringify(defaultState()));
  u.config.games.enquete.poolsIndices = ['Un', 'Deux', 'Trois'];
  assert.deepEqual(restore(u).config.games.enquete.poolsIndices, ['Un', 'Deux', 'Trois']);
});

test('supprimer tous les joueurs : prénoms libérés, classement archivé et remis à zéro, refusé pendant une partie', () => {
  const so = nouvelle();
  const a = so.join('tok-a', 'Léa'), b = so.join('tok-b', 'Hugo');
  const retrouve = so.join('tok-c', 'lea'); // sans accent ni majuscule : c'est le même prénom
  assert.equal(retrouve.ok, true, 'même prénom : il retrouve son compte');
  assert.equal(retrouve.token, a.token);
  assert.equal(retrouve.pid, a.pid);
  assert.equal(so.playerView(retrouve.token).me.name, 'Léa');
  so.s.config.reconnexionPrenom = false;
  assert.equal(so.join('tok-d', 'Léa').ok, false, 'réglage désactivé : prénom déjà pris');
  so.s.config.reconnexionPrenom = true;
  so.s.history.push({ gameId: 'chemin', at: 1, results: [{ pid: a.pid, rank: 1 }, { pid: b.pid, rank: 2 }] });
  so.s.bonus = { [a.pid]: 5 };
  const avant = so.playerView(a.token).purgeId;
  const r = so.admin({ type: 'supprimerJoueurs' });
  assert.equal(r.ok, true);
  assert.match(r.msg, /2 joueurs supprimés/);
  assert.deepEqual(so.s.people, {});
  assert.deepEqual(so.s.history, []);
  assert.deepEqual(so.s.bonus, {});
  assert.equal(so.s.soirees.length, 1, 'le classement est archivé');
  const neuf = so.join('tok-c', 'Léa');
  assert.ok(neuf.ok && neuf.pid !== a.pid, 'le prénom est de nouveau libre : c\'est un nouveau compte');
  assert.notEqual(so.playerView('inconnu').purgeId, avant, 'les téléphones sauront qu\'il faut oublier leur prénom');
  assert.equal(so.playerView(a.token).me, null, 'l\'ancien téléphone n\'est plus reconnu');
  // pas pendant une partie
  so.sess.status = 'playing';
  assert.equal(so.admin({ type: 'supprimerJoueurs' }).ok, false);
});

test('liens permanents des salles : ils existent sans partie, restent les mêmes et marchent en jeu', () => {
  const so = nouvelle();
  const liens = so.adminView().liensEnquete;
  assert.equal(liens.length, 11, 'un lien par salle, même sans partie lancée');
  assert.equal(new Set(liens.map(l => l.code)).size, 11);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(so.s))).secretLiens, so.s.secretLiens, 'enregistrés avec la soirée');
  so.admin({ type: 'choisirJeu', gameId: 'enquete' });
  const j = so.join('tok-x', 'Hugo');
  for (let i = 0; i < 3; i++) so.join('tok' + i, 'Joueur' + i);
  so.admin({ type: 'config', scope: 'soiree', path: 'decompte', value: 60 });
  so.admin({ type: 'demarrer' });
  Object.keys(so.s.people).forEach(p => so.register(p));
  so.admin({ type: 'lancerJeu' });
  so.s.config.games.enquete.panne = false;
  so.admin({ type: 'jeu', action: { type: 'lancer' } });
  assert.deepEqual(so.adminView().liensEnquete, liens, 'les mêmes liens pendant la partie');
  const r = so.player(j.token, { type: 'entrer', salle: 3, code: liens[3].code });
  assert.equal(r.ok, true, r.msg);
  assert.equal(so.sess.game.joueurs[j.pid].salle, 's3');
});

test('étages par défaut : « Étage » devient « 1er étage » (réglages enregistrés avec l\'ancien nom mis à jour, noms personnalisés gardés)', async () => {
  const E = await import('../server/games/enquete.js');
  const s = JSON.parse(JSON.stringify(defaultState()));
  s.config.games.enquete.etages = [...E.ETAGES_AVANT];
  assert.ok(restore(s).config.games.enquete.etages.includes('1er étage'));
  assert.ok(!restore(s).config.games.enquete.etages.includes('Étage'));
  const t = JSON.parse(JSON.stringify(defaultState()));
  t.config.games.enquete.etages = ['Cave', 'Cave', 'Salon', 'Salon', 'Salon', 'Salon', 'Salon', 'Haut', 'Haut', 'Haut', 'Haut'];
  assert.ok(restore(t).config.games.enquete.etages.includes('Haut'), 'noms personnalisés conservés');
});
