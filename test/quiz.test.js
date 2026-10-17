import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';
import { parseQuestions } from '../server/games/minijeux/quiz.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé'];
const TEXTE = `Quelle est la capitale de la France ?
Lyon
*Paris
Marseille
Lille

Combien font 2 + 2 ?
3
*4
5
22`;

function setup(texte = TEXTE, points = '30, 20, 15, 10, 5') {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'quiz', questions: texte, tempsQuestion: 20, tempsRevelation: 8, points });
  const ctx = { now: () => t, cfg, sfx: () => {}, name: p => p };
  const g = mj.start(ctx);
  NAMES.forEach((n, i) => mj.claim(ctx, g, `p${i}`, n));
  const pid = n => `p${NAMES.indexOf(n)}`;
  const at = ms => { t = ms; mj.tick(ctx, g); };
  const r = g.rounds[0];
  at(r.at - 299e3);
  for (const p of r.joueurs) mj.playerAction(ctx, g, pid(p), { type: 'compris' });
  return { g, ctx, r, pid, at, now: () => t };
}

test('lecture des questions : un bloc par question, une seule bonne réponse marquée d\'une étoile', () => {
  const { questions, erreurs } = parseQuestions(TEXTE);
  assert.deepEqual(erreurs, []);
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0].reponses, ['Lyon', 'Paris', 'Marseille', 'Lille']);
  assert.equal(questions[0].bonne, 1);
  const e = parseQuestions('Q1\nA\nB\n*C\n\nQ2\nA\n*B\n*C\nD\n\nQ3\nA\nB\nC\nD');
  assert.equal(e.questions.length, 0);
  assert.equal(e.erreurs.length, 3);
  assert.match(e.erreurs[0], /4 réponses/);
  assert.match(e.erreurs[1], /exactement une bonne réponse/);
});

test('tout le monde joue : tous les joueurs du roster participent au quiz', () => {
  const { r } = setup();
  assert.equal(r.joueurs.length, NAMES.length);
  assert.equal(r.type, 'quiz');
  assert.equal(r.status, 'jeu');
});

test('une question : on répond une fois, la bonne réponse n\'est visible qu\'à la correction', () => {
  const { g, ctx, r, pid, at, now } = setup();
  const [a, b, c, d, e] = r.joueurs;
  assert.equal(mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: 1 }).ok, true);
  assert.equal(mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: 0 }).ok, false, 'une seule réponse');
  const avant = mj.playerView(ctx, g, pid(b)).etat;
  assert.equal(avant.bonne, undefined, 'pas de bonne réponse avant la correction');
  assert.equal(avant.question.reponses.length, 4);
  // tout le monde a répondu : correction tout de suite
  for (const p of [b, c, d]) mj.playerAction(ctx, g, pid(p), { type: 'repondre', choix: 1 });
  mj.playerAction(ctx, g, pid(e), { type: 'repondre', choix: 0 });
  at(now());
  assert.equal(r.qz.phase, 'revelation');
  const apres = mj.playerView(ctx, g, pid(a)).etat;
  assert.equal(apres.juste, true);
  assert.equal(apres.bonne.lettre, 'B');
  assert.equal(mj.playerView(ctx, g, pid(e)).etat.juste, false);
  assert.deepEqual(mj.screenView(ctx, g).etat.correction.compte, [1, 4, 0, 0]);
});

test('points à chaque question, en direct : 2 au plus rapide, 1 aux autres ; dernière question 5, 4, 3…', () => {
  const { g, ctx, r, pid, at, now } = setup('Q1\nA\n*B\nC\nD\n\nQ2\nA\n*B\nC\nD', '30, 20, 15, 10, 5');
  const [a, b, c, d, e] = r.joueurs;
  const pts = nom => mj.screenView(ctx, g).classement.find(x => x.nom === nom).points;
  // Q1 : a juste le premier, b juste ensuite, les autres faux
  mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: 1 });
  at(now() + 5000);
  mj.playerAction(ctx, g, pid(b), { type: 'repondre', choix: 1 });
  for (const p of [c, d, e]) mj.playerAction(ctx, g, pid(p), { type: 'repondre', choix: 0 });
  at(now());
  assert.equal(r.qz.phase, 'revelation');
  assert.equal(pts(a), 2, 'en direct dans le classement, dès la correction');
  assert.equal(pts(b), 1);
  assert.deepEqual(mj.screenView(ctx, g).etat.correction.gains, [{ nom: a, points: 2 }, { nom: b, points: 1 }]);
  assert.equal(mj.playerView(ctx, g, pid(a)).etat.gain, 2);
  at(now() + 8000);
  assert.equal(r.qz.k, 1);
  assert.equal(mj.screenView(ctx, g).etat.derniere, true);
  // Q2 (la dernière) : e, puis a, puis b, puis c répondent juste ; d se trompe
  for (const p of [e, a, b, c]) { mj.playerAction(ctx, g, pid(p), { type: 'repondre', choix: 1 }); at(now() + 1000); }
  mj.playerAction(ctx, g, pid(d), { type: 'repondre', choix: 3 });
  at(now());
  assert.deepEqual(r.qz.gains[1], { [e]: 5, [a]: 4, [b]: 3, [c]: 2 });
  at(now() + 8000);
  assert.equal(r.status, 'fini');
  // totaux : a 6, e 5, b 4, c 2, d 0 ; pas de points de place en plus
  assert.deepEqual([a, e, b, c, d].map(pts), [6, 5, 4, 2, 0]);
  assert.deepEqual([a, e, b, c, d].map(p => r.points[p].place), [1, 2, 3, 4, 5]);
  assert.equal(r.points[a].points, 6);
});

test('quiz sauté en cours : les points déjà donnés sont retirés ; pas de correction des places', () => {
  const { g, ctx, r, pid, at, now } = setup('Q1\nA\n*B\nC\nD\n\nQ2\nA\n*B\nC\nD');
  const [a] = r.joueurs;
  mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: 1 });
  at(now() + 20000);
  assert.equal(mj.screenView(ctx, g).classement.find(x => x.nom === a).points, 2);
  assert.equal(mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: {} }).ok, false);
  assert.equal(mj.adminAction(ctx, g, { type: 'passer', n: r.n }).ok, true);
  assert.equal(mj.screenView(ctx, g).classement.find(x => x.nom === a).points, 0);
});

test('temps écoulé : la correction passe sans réponse ; l\'admin peut passer à la suite', () => {
  const { g, ctx, r, at, now } = setup('Q1\nA\n*B\nC\nD\n\nQ2\nA\n*B\nC\nD');
  at(now() + 20000);
  assert.equal(r.qz.phase, 'revelation');
  mj.adminAction(ctx, g, { type: 'suivant' });
  at(now());
  assert.equal(r.qz.k, 1, 'question suivante');
});
