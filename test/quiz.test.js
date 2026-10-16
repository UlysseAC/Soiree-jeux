import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as quiz from '../server/games/quiz.js';
import * as classement from '../server/classement.js';

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

function setup(texte = TEXTE) {
  let t = 1000;
  const ctx = { now: () => t, cfg: { ...quiz.defaultConfig(), questions: texte, tempsQuestion: 20, tempsRevelation: 8 }, name: p => p.toUpperCase(), sfx: () => {} };
  const g = quiz.start(ctx, ['a', 'b', 'c']);
  return { ctx, g, at: ms => { t = ms; quiz.tick(ctx, g); }, now: () => t };
}

test('lecture des questions : un bloc par question, une bonne réponse marquée d\'une étoile', () => {
  const { questions, erreurs } = quiz.parseQuestions(TEXTE);
  assert.deepEqual(erreurs, []);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].question, 'Quelle est la capitale de la France ?');
  assert.deepEqual(questions[0].reponses, ['Lyon', 'Paris', 'Marseille', 'Lille']);
  assert.equal(questions[0].bonne, 1);
  assert.equal(questions[1].bonne, 1);
});

test('erreurs signalées dans l\'admin : pas 4 réponses, pas de bonne réponse, deux bonnes réponses', () => {
  const { questions, erreurs } = quiz.parseQuestions('Q1\nA\nB\n*C\n\nQ2\nA\n*B\n*C\nD\n\nQ3\nA\nB\nC\nD');
  assert.equal(questions.length, 0);
  assert.equal(erreurs.length, 3);
  assert.match(erreurs[0], /4 réponses/);
  assert.match(erreurs[1], /exactement une bonne réponse/);
  assert.match(erreurs[2], /exactement une bonne réponse/);
  assert.deepEqual(quiz.parseQuestions('').erreurs, ['Aucune question pour le moment.']);
});

test('une partie : on répond une fois, la bonne réponse est révélée, le temps compte pour départager', () => {
  const { g, ctx, at, now } = setup();
  assert.equal(g.phase, 'question');
  assert.equal(quiz.playerAction(ctx, g, 'a', { type: 'repondre', choix: 1 }).ok, true);
  assert.equal(quiz.playerAction(ctx, g, 'a', { type: 'repondre', choix: 0 }).ok, false, 'une seule réponse');
  assert.equal(quiz.screenView(ctx, g).correction, undefined, 'pas de bonne réponse avant la correction');
  at(now() + 3000);
  quiz.playerAction(ctx, g, 'b', { type: 'repondre', choix: 1 });
  quiz.playerAction(ctx, g, 'c', { type: 'repondre', choix: 0 });
  at(now());
  assert.equal(g.phase, 'revelation', 'tout le monde a répondu : correction tout de suite');
  assert.equal(quiz.screenView(ctx, g).correction.bonne, 1);
  assert.deepEqual(quiz.screenView(ctx, g).correction.compte, [1, 2, 0, 0]);
  assert.equal(quiz.playerView(ctx, g, 'a').juste, true);
  assert.equal(quiz.playerView(ctx, g, 'c').juste, false);
  at(now() + 8000);
  assert.equal(g.k, 1, 'question suivante');
});

test('le temps de réponse : à égalité de bonnes réponses, le plus rapide passe devant', () => {
  const { g, ctx, at, now } = setup('Q1\nA\n*B\nC\nD\n\nQ2\nA\n*B\nC\nD');
  quiz.playerAction(ctx, g, 'a', { type: 'repondre', choix: 1 });
  at(now() + 5000);
  quiz.playerAction(ctx, g, 'b', { type: 'repondre', choix: 1 });
  quiz.playerAction(ctx, g, 'c', { type: 'repondre', choix: 0 });
  at(now());
  at(now() + 8000);
  assert.equal(g.k, 1);
  for (const p of ['a', 'b', 'c']) quiz.playerAction(ctx, g, p, { type: 'repondre', choix: p === 'c' ? 0 : 1 });
  at(now());
  at(now() + 8000);
  assert.equal(g.finished, true);
  const cl = quiz.classement(g);
  assert.deepEqual(cl.map(x => x.pid), ['a', 'b', 'c']);
  assert.equal(cl[0].score, 2);
  assert.equal(cl[1].score, 2);
  assert.equal(cl[2].score, 0);
});

test('temps écoulé : on passe à la correction sans réponse ; fin au bout de la dernière question', () => {
  const { g, at, now } = setup('Q1\nA\n*B\nC\nD');
  at(now() + 20000);
  assert.equal(g.phase, 'revelation');
  at(now() + 8000);
  assert.equal(g.finished, true);
  assert.equal(g.phase, 'fini');
});

test('classement de la soirée : bonnes réponses converties en points par place', () => {
  const cfg = { ...classement.defaultConfig() };
  const res = [{ pid: 'a', score: 5, temps: 10000, won: true }, { pid: 'b', score: 3, temps: 9000 }, { pid: 'c', score: 3, temps: 20000 }];
  const pts = classement.gamePoints(cfg, { gameId: 'quiz', results: res });
  assert.equal(pts.a.pts, cfg.quiz.max);
  assert.ok(pts.b.pts > pts.c.pts, 'à égalité, le plus rapide a plus de points');
  assert.equal(pts.c.pts, cfg.quiz.min);
});
