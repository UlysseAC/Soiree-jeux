import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as duel from '../server/games/duel.js';

function setup(n, tweak = c => c) {
  let t = 1_000_000;
  const cfg = tweak(duel.defaultConfig());
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] };
  const g = duel.start(ctx, pids);
  pids.forEach((p, i) => duel.adminAction(ctx, g, { type: 'num', pid: p, value: String(10 + i) }));
  return { g, ctx, cfg, pids, step: ms => { t += ms; return duel.tick(ctx, g); } };
}

const live = g => Object.values(g.duels).filter(d => !d.winner);
const aliveCount = g => Object.values(g.players).filter(P => P.alive).length;

// Joue un duel au numéro : le joueur `a` gagne (ou perd si `explode`).
function play(ctx, g, d, explode = false) {
  const opp = g.players[d.b].num;
  return duel.playerAction(ctx, g, d.a, { type: 'tir', value: explode ? '0' : opp });
}

test('tours simultanés proportionnels au nombre d\'inscrits', () => {
  const cfg = duel.defaultConfig();
  assert.equal(duel.simRoundsFor(cfg, 12), 0);
  assert.equal(duel.simRoundsFor(cfg, 20), 1);
  assert.equal(duel.simRoundsFor(cfg, 35), 2);
  assert.equal(duel.simRoundsFor(cfg, 50), 3);
});

test('numéros de dossard uniques et obligatoires', () => {
  const { g, ctx, pids } = setup(4);
  assert.equal(duel.adminAction(ctx, g, { type: 'num', pid: pids[1], value: '10' }).ok, false);
  duel.adminAction(ctx, g, { type: 'num', pid: pids[1], value: '' });
  assert.equal(duel.adminAction(ctx, g, { type: 'lancer' }).ok, false);
});

test('mauvais numéro : le pistolet explose et l\'autre gagne', () => {
  const { g, ctx } = setup(20);
  duel.adminAction(ctx, g, { type: 'lancer' });
  assert.equal(g.rounds[0].type, 'sim');
  const d = live(g)[0];
  assert.equal(play(ctx, g, d, true).ok, false);
  assert.equal(d.winner, d.b);
  assert.equal(g.players[d.a].lives, 1);
});

test('la partie arrive pile à 8 joueurs puis passe au face-à-face', () => {
  for (let run = 0; run < 30; run++) {
    const n = 9 + Math.floor(Math.random() * 42);
    const { g, ctx, step } = setup(n);
    duel.adminAction(ctx, g, { type: 'lancer' });
    for (let guard = 0; guard < 5000 && g.phase !== 'p2'; guard++) {
      assert.ok(aliveCount(g) >= 8, `jamais sous 8 (n=${n})`);
      const d = live(g).find(x => x.kind === 'num');
      if (d) play(ctx, g, d, Math.random() < .5);
      step(30_000);
      if (g.phase === 'pause') duel.adminAction(ctx, g, { type: 'passerPause' });
    }
    assert.equal(g.phase, 'p2', `n=${n}`);
    assert.equal(aliveCount(g), 8, `n=${n}`);
    assert.ok(Object.values(g.players).filter(P => P.alive).every(P => P.lives === 1));
  }
});

test('pas de revanche immédiate quand c\'est évitable', () => {
  const { g } = setup(10);
  for (const p of Object.keys(g.players)) g.players[p].lastOpp = null;
  g.players.p0.lastOpp = 'p1'; g.players.p1.lastOpp = 'p0';
  for (let k = 0; k < 50; k++) {
    const { pairs } = duel.pairUp(g, Object.keys(g.players));
    assert.ok(!pairs.some(([a, b]) => (a === 'p0' && b === 'p1') || (a === 'p1' && b === 'p0')));
  }
});

test('face-à-face : tir trop tôt, 2 erreurs permises, la 3e fait perdre', () => {
  const { g, ctx, step } = setup(8);
  duel.adminAction(ctx, g, { type: 'lancer' });
  assert.equal(g.phase, 'p2');
  step(10_000);
  const d = live(g)[0];
  assert.equal(d.kind, 'face');
  const early = () => duel.playerAction(ctx, g, d.a, { type: 'gachette', t: ctx.now() });
  early(); early();
  assert.equal(g.players[d.a].errors, 0);
  assert.equal(d.winner, null);
  early();
  assert.equal(d.winner, d.b);
});

test('face-à-face : le plus rapide gagne, finale et prime du vainqueur', () => {
  const { g, ctx, cfg, step } = setup(8);
  duel.adminAction(ctx, g, { type: 'lancer' });
  for (let guard = 0; guard < 200 && !g.finished; guard++) {
    step(7_000);
    if (g.phase === 'pause') { duel.adminAction(ctx, g, { type: 'passerPause' }); step(1); continue; }
    const d = live(g)[0];
    if (!d) continue;
    step(d.fireAt - ctx.now() + 100);
    duel.playerAction(ctx, g, d.b, { type: 'gachette', t: ctx.now() - 50 });
    duel.playerAction(ctx, g, d.a, { type: 'gachette', t: ctx.now() - 80 });
    step(300);
    assert.equal(d.winner, d.a);
  }
  assert.ok(g.finished);
  assert.equal(g.players[g.winner].prime, cfg.primeVainqueur);
});

test('paris : définitifs, 3 joueurs max, gains à chaque duel gagné', () => {
  const { g, ctx, cfg } = setup(20);
  duel.adminAction(ctx, g, { type: 'lancer' });
  const d1 = live(g)[0];
  play(ctx, g, d1); // d1.b perd une vie
  const d2 = live(g).find(x => x.a !== d1.b && x.b !== d1.b);
  // On élimine d1.b à la main pour tester les paris.
  g.players[d1.b].alive = false;
  const bettor = d1.b;
  const target = d2.a;
  assert.equal(duel.playerAction(ctx, g, bettor, { type: 'pari', alloc: { [target]: 400 } }).ok, false, 'pas plus que les jetons');
  assert.equal(duel.playerAction(ctx, g, bettor, { type: 'pari', alloc: { [target]: 200 } }).ok, true);
  assert.equal(duel.playerAction(ctx, g, bettor, { type: 'pari', alloc: { [target]: 50 } }).ok, false, 'définitif');
  play(ctx, g, d2);
  const v = duel.playerView(ctx, g, bettor);
  assert.equal(v.bet.value, Math.round(200 * (1 + cfg.coefPari)));
});
