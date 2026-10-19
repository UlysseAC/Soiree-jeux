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

test('démarrer la soirée : les joueurs restent dans la base, mais doivent se réinscrire à chaque jeu', () => {
  const state = defaultState();
  state.people.p0 = { id: 'p0', token: 't0', name: 'Léa' };
  state.config.games.minijeux.joueurs = 'Léa\nHugo';
  state.config.programme = ['minijeux'];
  const so = new Soiree(state, { now: () => Date.UTC(2026, 9, 13, 20, 0) });
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  so.admin({ type: 'lancerJeu' });
  assert.equal(so.claimMini('t0', 'Léa').ok, true);
  so.admin({ type: 'arreter' });
  so.admin({ type: 'demarrerSoiree' });
  assert.ok(state.people.p0, 'la personne reste dans la base');
  assert.deepEqual(state.session.registered, []);
  so.admin({ type: 'lancerJeu' });
  assert.equal(Object.keys(state.session.game.claims).length, 0, 'il faut se réinscrire au jeu');
});

test('retrouver son compte depuis un autre téléphone : prénom + code de l\'admin, une seule fois, 10 min', () => {
  let t = Date.UTC(2026, 9, 13, 20, 0);
  const so = new Soiree(defaultState(), { now: () => t });
  const { token, pid } = so.join(undefined, 'Mélusine');
  assert.equal(so.reprendre('Mélusine', '1234').ok, false, 'pas de code demandé');
  const { code } = so.admin({ type: 'codeReprise', pid });
  assert.equal(so.reprendre('Mélusine', '0000' === code ? '1111' : '0000').ok, false, 'mauvais code');
  const r = so.reprendre(' mélusine ', code);
  assert.equal(r.ok, true);
  assert.equal(r.token, token, 'le nouveau téléphone retrouve le même compte');
  assert.equal(so.reprendre('Mélusine', code).ok, false, 'une seule fois');
  const c2 = so.admin({ type: 'codeReprise', pid }).code;
  t += 11 * 60e3;
  assert.equal(so.reprendre('Mélusine', c2).ok, false, 'code expiré');
});

test('journal des désinscriptions et ajout d\'un joueur à une partie du Chemin déjà lancée (comme détective)', () => {
  let t = Date.UTC(2026, 9, 13, 20, 0);
  const so = new Soiree(defaultState(), { now: () => t });
  so.admin({ type: 'choisirJeu', gameId: 'chemin' });
  so.admin({ type: 'inscriptions', value: 'open' });
  const p = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom', 'Vesa'].map(n => so.join(undefined, n));
  for (const x of p) so.player(x.token, { type: 'inscription', on: true });
  const vesa = p[6];
  so.player(vesa.token, { type: 'inscription', on: false });
  so.admin({ type: 'retirerInscrit', pid: p[5].pid });
  const j = so.adminView().journal;
  assert.deepEqual(j.map(x => [x.nom, x.quoi]), [['Tom', 'retiré par l\'admin'], ['Vesa', 'désinscrit par le joueur (son téléphone)']]);
  assert.equal(so.admin({ type: 'ajouterEnCours', pid: vesa.pid }).ok, false, 'pas de partie en cours');
  so.admin({ type: 'lancerJeu' });
  assert.equal(so.sess.status, 'playing');
  assert.equal(so.playerView(vesa.token).game.spectator, true, 'Vesa n\'est pas dans la partie');
  const r = so.admin({ type: 'ajouterEnCours', pid: vesa.pid });
  assert.equal(r.ok, true, r.msg);
  assert.equal(so.sess.game.roles[vesa.pid].role, 'detective');
  assert.equal(so.playerView(vesa.token).game.spectator, undefined, 'Vesa joue maintenant');
  assert.equal(so.admin({ type: 'ajouterEnCours', pid: vesa.pid }).ok, false, 'déjà dans la partie');
  assert.match(so.adminView().journal[0].quoi, /ajouté en cours de partie/);
});
