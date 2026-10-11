import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cl from '../server/classement.js';

const names = p => p.toUpperCase();
const cfg = cl.defaultConfig();

test('points par jeu : chemin en équipe, grand pari et duel selon la place', () => {
  const recs = [
    { gameId: 'chemin', results: [{ pid: 'a', won: true }, { pid: 'b', won: false }, { pid: 'c', won: true }] },
    { gameId: 'grandpari', results: [{ pid: 'a', argent: 500 }, { pid: 'b', argent: 3000 }, { pid: 'c', argent: 1000 }] },
    { gameId: 'duel', results: [{ pid: 'a', prime: 100, paris: 50 }, { pid: 'b', prime: 1600, won: true }, { pid: 'c', prime: 900, paris: 0 }] },
  ];
  const { rows } = cl.compute(cfg, recs, names);
  const by = Object.fromEntries(rows.map(r => [r.pid, r]));
  assert.deepEqual(by.a.games, { chemin: 60, grandpari: 10, duel: 15 });
  assert.deepEqual(by.b.games, { chemin: 25, grandpari: 60, duel: 90 });
  assert.equal(by.c.games.duel, 52.5);
  assert.equal(by.b.total, 175);
  assert.equal(rows[0].pid, 'b');
});

test('rater un jeu : bonus calculé sur les points non joués, plafonné à ×1,5', () => {
  const recs = [
    { gameId: 'chemin', results: [{ pid: 'a', won: true }, { pid: 'b', won: true }] },
    { gameId: 'grandpari', results: [{ pid: 'a', argent: 900 }, { pid: 'b', argent: 900 }, { pid: 'late', argent: 900 }] },
    { gameId: 'duel', results: [{ pid: 'a', prime: 100 }, { pid: 'b', prime: 100 }, { pid: 'late', prime: 100 }, { pid: 'skip', prime: 100 }] },
  ];
  const { rows } = cl.compute(cfg, recs, names);
  const by = Object.fromEntries(rows.map(r => [r.pid, r]));
  assert.equal(by.a.mult, 1);
  assert.equal(by.late.mult, 1.4); // 210 / 150
  assert.equal(by.skip.mult, 1.5); // plafonné
});

test('bonus manuels et départage par jeux gagnés', () => {
  const recs = [{ gameId: 'chemin', results: [{ pid: 'a', won: true }, { pid: 'b', won: false }] }];
  const { rows } = cl.compute(cfg, recs, names, { b: 35 });
  assert.equal(rows[0].total, 60);
  assert.equal(rows[1].total, 60);
  assert.equal(rows[0].pid, 'a', 'à égalité, celui qui a gagné un jeu passe devant');
});
