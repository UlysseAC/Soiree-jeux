// Pause d'un jeu depuis l'admin : le temps s'arrête, puis toutes les échéances sont décalées de la durée de la pause.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Soiree, defaultState, decaler } from '../server/soiree.js';

test('pause : le temps du jeu s\'arrête, les actions sont refusées, puis tout reprend où il en était', () => {
  let t = Date.UTC(2026, 9, 13, 20, 0);
  const so = new Soiree(defaultState(), { now: () => t });
  so.admin({ type: 'choisirJeu', gameId: 'minijeux' });
  const c = (path, value) => so.admin({ type: 'config', scope: 'jeu', path, value });
  c('joueurs', 'Léa\nHugo\nInès\nMalik');
  c('programme', 'mj1'); c('rounds', 1); c('premier', 1);
  so.admin({ type: 'lancerJeu' });
  const g = so.sess.game, r = g.rounds[0];
  const at0 = r.at;
  assert.equal(so.admin({ type: 'pause' }).ok, true);
  assert.equal(so.common().paused, true);
  t += 10 * 60e3; // 10 min de pause
  so.tick();
  assert.equal(r.status, 'prevu', 'rien ne se passe pendant la pause');
  const tok = so.join(undefined, 'Léa').token;
  assert.equal(so.player(tok, { type: 'compris' }).ok, false, 'le jeu est en pause');
  so.admin({ type: 'pause' });
  assert.equal(so.common().paused, false);
  assert.equal(r.at, at0 + 10 * 60e3, 'le round est décalé de la durée de la pause');
});

test('décalage : seuls les horodatages bougent, pas les durées ni les points', () => {
  const o = { fin: 1.8e12, points: 10, tempsVote: 90, liste: [{ at: 1.8e12 + 5 }] };
  decaler(o, 1000, 1.8e12);
  assert.deepEqual(o, { fin: 1.8e12 + 1000, points: 10, tempsVote: 90, liste: [{ at: 1.8e12 + 1005 }] });
});
