import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom', 'Sarah', 'Nico'];

function setup({ manches = 1, joueurs = 3 } = {}) {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'anecdote', joueurs, manches, tempsEcriture: 120, tempsVote: 90, tempsRevelation: 20 });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  NAMES.forEach((n, i) => mj.claim(ctx, g, `p${i}`, n));
  const pid = n => `p${NAMES.indexOf(n)}`;
  const at = ms => { t = ms; mj.tick(ctx, g); };
  const r = g.rounds[0];
  at(r.at - 299e3);
  for (const p of r.joueurs) mj.playerAction(ctx, g, pid(p), { type: 'compris' });
  return { g, ctx, r, pid, at, now: () => t };
}

test('chaque joueur écrit une anecdote ; les cartes A, B, C ne disent pas à qui elles sont', () => {
  const { g, ctx, r, pid } = setup();
  assert.equal(r.status, 'jeu');
  assert.deepEqual(r.def.cur.ordre, ['A', 'B', 'C']);
  assert.deepEqual(Object.values(r.def.cur.mots).sort(), ['A', 'B', 'C']);
  for (const p of r.joueurs) assert.equal(mj.playerAction(ctx, g, pid(p), { type: 'ecrire', texte: `J'ai déjà vu un ours, signé ${p}` }).ok, true);
  mj.tick(ctx, g);
  const v = mj.screenView(ctx, g).etat;
  assert.equal(v.type, 'anecdote');
  assert.equal(v.phase, 'vote');
  assert.deepEqual(v.cartes.map(c => c.mot), ['A', 'B', 'C']);
  assert.ok(v.cartes.every(c => c.auteur === undefined), 'pas d\'auteur avant la révélation');
  const spect = NAMES.find(n => !r.joueurs.includes(n));
  assert.ok(!JSON.stringify(mj.playerView(ctx, g, pid(spect)).etat).includes('"mots"'));
});

test('le joueur le MOINS reconnu gagne ; les spectateurs ont leur classement et leur bonus', () => {
  const { g, ctx, r, pid, at, now } = setup();
  const [a, b, c] = r.joueurs;
  for (const p of r.joueurs) mj.playerAction(ctx, g, pid(p), { type: 'ecrire', texte: `Anecdote de ${p}` });
  mj.tick(ctx, g);
  const carte = p => r.def.cur.mots[p];
  const spect = NAMES.filter(n => !r.joueurs.includes(n));
  // 5 spectateurs : 3 trouvent tout ; 2 se trompent sur a et b → a : 3, b : 3, c : 5 reconnus
  const juste = { [carte(a)]: a, [carte(b)]: b, [carte(c)]: c };
  const inverse = { [carte(a)]: b, [carte(b)]: a, [carte(c)]: c };
  spect.forEach((s, i) => assert.equal(mj.playerAction(ctx, g, pid(s), { type: 'voter', liens: i < 3 ? juste : inverse }).ok, true));
  mj.tick(ctx, g);
  assert.equal(r.def.phase, 'revelation');
  at(now() + 20e3);
  assert.equal(r.status, 'fini');
  assert.equal(r.points[a].place, 1, 'a : le moins reconnu (ex æquo avec b)');
  assert.equal(r.points[b].place, 1);
  assert.equal(r.points[c].place, 3, 'c : reconnu par tout le monde');
  assert.deepEqual(r.bonus, Object.fromEntries(spect.slice(0, 3).map(s => [s, 1])));
});
