import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gp from '../server/games/grandpari.js';
import * as foot from '../server/games/sports/foot.js';
import * as boxe from '../server/games/sports/boxe.js';

function setup(n, tweak = c => c) {
  let t = 1_000_000;
  const cfg = tweak(gp.defaultConfig());
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] };
  const g = gp.start(ctx, pids);
  return { g, ctx, cfg, pids, adv: ms => { t += ms; return gp.tick(ctx, g); } };
}
// Fait défiler le temps jusqu'à la fin du sport en cours.
function runSport(s) {
  gp.adminAction(s.ctx, s.g, { type: 'lancerSport' });
  for (let i = 0; i < 400 && s.g.phase === 'sport'; i++) s.adv(1000);
}

test('investissements par bloc selon le nombre de joueurs', () => {
  const cfg = gp.defaultConfig();
  assert.equal(gp.investCount(cfg, 8), 2);
  assert.equal(gp.investCount(cfg, 15), 3);
  assert.equal(gp.investCount(cfg, 22), 4);
  assert.equal(gp.investCount(cfg, 40), 5);
  const { g } = setup(22);
  assert.equal(g.blocks[0].items.length, 4);
  const it = g.blocks[0].items[0];
  assert.ok(it.needInvestors >= 2 && it.needAmount > 0);
});

test('course : paris, fermeture 15 s avant, gains selon la place', () => {
  const s = setup(6);
  const { g, ctx, cfg, pids } = s;
  assert.equal(gp.playerAction(ctx, g, pids[0], { type: 'pari', bet: 'cheval', sel: 2, mise: 5000 }).ok, false, 'pas plus que son argent');
  for (let h = 0; h < 8; h++) assert.equal(gp.playerAction(ctx, g, pids[0], { type: 'pari', bet: 'cheval', sel: h, mise: 100 }).ok, true);
  assert.equal(g.wallets[pids[0]], cfg.argentDepart - 800);
  // Fermeture des paris
  s.adv(g.sports[0].at - ctx.now() - 10_000);
  assert.equal(gp.playerAction(ctx, g, pids[1], { type: 'pari', bet: 'cheval', sel: 0, mise: 100 }).ok, false);
  runSport(s);
  assert.equal(g.phase, 'resultat');
  // 8 chevaux à 100 $ : ×3 + ×1,5 + ×0,5 = 500 $ récupérés
  assert.equal(g.wallets[pids[0]], cfg.argentDepart - 800 + 500);
});

test('investissement réussi ou remboursé en partie', () => {
  const s = setup(10);
  const { g, ctx, pids } = s;
  const [a, b] = g.blocks[0].items;
  // a : tout le monde investit assez → réussi
  const per = Math.ceil(a.needAmount / 10);
  pids.forEach(p => gp.playerAction(ctx, g, p, { type: 'investir', item: a.id, mise: per }));
  // b : un seul investisseur → échoue
  gp.playerAction(ctx, g, pids[0], { type: 'investir', item: b.id, mise: 100 });
  const before = g.wallets[pids[1]];
  gp.adminAction(ctx, g, { type: 'lancerSport' });
  assert.equal(a.status, 'reussi');
  assert.equal(b.status, 'echoue');
  assert.equal(g.wallets[pids[1]], before + Math.round(per * a.gain));
});

test('foot : cotes calculées et paris réglés', () => {
  const cfg = gp.defaultConfig();
  const counts = foot.estimate(cfg.foot, 20, 3);
  const odds = gp.footOdds(cfg, counts, 20);
  assert.ok(odds.nul >= 1.1 && odds.buts.length === 5 && odds.buteur[0].length === 5);
  const s = setup(4);
  const { g, ctx, pids } = s;
  runSport(s); // course
  s.adv(20_000); // fin des résultats → foot
  assert.equal(g.k, 1);
  g.odds = odds;
  for (const sel of [0, 1]) gp.playerAction(ctx, g, pids[0], { type: 'pari', bet: 'vainqueur', sel, mise: 100 });
  gp.playerAction(ctx, g, pids[0], { type: 'pari', bet: 'nul', mise: 100 });
  const w = g.wallets[pids[0]];
  runSport(s);
  const r = g.sports[1].result;
  const back = r.winner === 'nul' ? Math.round(100 * odds.nul) : 200;
  assert.equal(g.wallets[pids[0]], w + back);
});

test('boxe : tous les inscrits combattent, gains selon la place', () => {
  const cfg = gp.defaultConfig();
  assert.equal(gp.boxeMult(cfg, 1, 20), 8);
  assert.equal(gp.boxeMult(cfg, 3, 20), 3);
  assert.equal(gp.boxeMult(cfg, 5, 20), 1.5);
  assert.equal(gp.boxeMult(cfg, 10, 20), 1);
  assert.equal(gp.boxeMult(cfg, 11, 20), 0);
  const r = boxe.simulate({ noms: Array.from({ length: 12 }, (_, i) => 'B' + i), duree: 60 }, 11);
  assert.deepEqual([...r.result.places].sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
});

test('la partie se termine après les 3 sports', () => {
  const s = setup(5);
  for (let k = 0; k < 3; k++) {
    s.g.odds = s.g.odds || { nul: 3, buteur: [[5, 5, 5, 5, 5], [5, 5, 5, 5, 5]], buts: [5, 5, 5, 5, 5] };
    runSport(s);
    s.adv(20_000);
  }
  assert.ok(s.g.finished);
  assert.equal(s.g.phase, 'fini');
});
