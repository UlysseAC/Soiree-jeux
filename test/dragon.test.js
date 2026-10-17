import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];

function setup(opts = {}) {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'dragon', equipesDragon: 'chacun', viesTir: 2, chargeur: 3, tempsRecharge: 2, pvDragon: 10, attaqueMin: 30, attaqueMax: 30, dureeTir: 180, joueurs: 2, ...opts });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  NAMES.forEach((n, i) => mj.claim(ctx, g, `p${i}`, n));
  const pid = n => `p${NAMES.indexOf(n)}`;
  const at = ms => { t = ms; mj.tick(ctx, g); };
  const r = g.rounds[0];
  at(r.at - 299e3);
  for (const p of r.joueurs) mj.playerAction(ctx, g, pid(p), { type: 'compris' });
  const act = (n, a) => mj.playerAction(ctx, g, pid(n), a);
  return { g, ctx, r, pid, at, now: () => t, act };
}

test('format : 4 joueurs chacun pour soi, ou 2 contre 2', () => {
  const a = setup();
  assert.equal(a.r.joueurs.length, 4);
  assert.deepEqual(a.r.format, [1, 1, 1, 1]);
  const b = setup({ equipesDragon: '2v2' });
  assert.deepEqual(b.r.format, [2, 2]);
  assert.equal(b.r.equipes.length, 2);
});

// viser une cible précise : Viser, choisir la cible, puis attendre 1 s
function viserSur(s, nom, cible) {
  s.act(nom, { type: 'viser' });
  assert.equal(s.act(nom, { type: 'cibler', cible }).ok, true);
  assert.equal(s.r.dr.j[nom].cible, cible);
  s.at(s.now() + 1000);
}

test('Viser : on se lève et on prend d\'abord un adversaire, même à l\'abri ; on choisit ensuite sa cible', () => {
  const s = setup();
  const [a, b, c, d] = s.r.joueurs;
  assert.equal(s.r.dr.j[a].action, 'cache');
  assert.equal(s.act(a, { type: 'cibler', cible: c }).ok, false, 'on ne choisit pas une cible à l\'abri');
  s.act(a, { type: 'viser' });
  assert.equal(s.r.dr.j[a].action, 'vise', 'à découvert');
  assert.equal(s.r.dr.j[a].cible, b, 'premier adversaire, même à l\'abri');
  for (const cible of [c, d, 'dragon']) assert.equal(s.act(a, { type: 'cibler', cible }).ok, true);
  assert.equal(s.r.dr.j[a].cible, 'dragon');
  assert.equal(s.act(a, { type: 'cibler', cible: a }).ok, false, 'pas soi-même');
  const st = mj.screenView(s.ctx, s.g).etat.etats.find(x => x.nom === a);
  assert.equal(st.action, 'vise'); assert.equal(st.cible, 'dragon');
  s.act(a, { type: 'cacher' });
  assert.equal(s.r.dr.j[a].action, 'cache');
});

test('Tirer : seulement après 1 s sur la même cible ; touche un joueur à découvert, rate un joueur à l\'abri', () => {
  const s = setup();
  const [a, b] = s.r.joueurs;
  s.act(a, { type: 'viser' });
  assert.equal(s.act(a, { type: 'tirer' }).ok, false, 'trop tôt');
  s.at(s.now() + 1000);
  assert.equal(s.act(a, { type: 'tirer' }).ok, true);
  assert.equal(s.r.dr.j[b].vies, 2, 'b à l\'abri : raté');
  assert.equal(s.r.dr.j[a].balles, 2);
  s.act(b, { type: 'viser' }); // b se lève
  s.at(s.now() + 600);
  s.act(a, { type: 'tirer' });
  assert.equal(s.r.dr.j[b].vies, 1, 'b debout : touché');
  s.act(a, { type: 'cibler', cible: 'dragon' });
  assert.equal(s.act(a, { type: 'tirer' }).ok, false, 'nouvelle cible : on recommence la seconde');
});

test('le dragon : chaque tir le touche, il attaque ceux qui sont debout, annoncé à l\'avance', () => {
  const s = setup({ attaqueMin: 10, attaqueMax: 10 });
  const [a, b] = s.r.joueurs;
  viserSur(s, a, 'dragon');
  s.act(a, { type: 'tirer' });
  assert.equal(s.r.dr.dragon.pv, 9);
  assert.equal(s.r.dr.j[a].degats, 1);
  s.at(s.r.dr.dragon.attaque - 1500);
  assert.equal(mj.screenView(s.ctx, s.g).etat.dragon.prepare, true, 'préavis');
  s.at(s.r.dr.dragon.attaque);
  assert.equal(s.r.dr.j[a].vies, 1, 'debout : touché par le souffle');
  assert.equal(s.r.dr.j[b].vies, 2, 'à l\'abri : rien');
});

test('Recharger : à découvert quelques secondes, chargeur plein, puis on reprend la visée', () => {
  const s = setup();
  const [a] = s.r.joueurs;
  assert.equal(s.act(a, { type: 'recharger' }).ok, false, 'chargeur déjà plein');
  viserSur(s, a, 'dragon');
  for (let k = 0; k < 3; k++) { s.act(a, { type: 'tirer' }); s.at(s.now() + 600); }
  assert.equal(s.r.dr.j[a].balles, 0);
  assert.equal(s.act(a, { type: 'tirer' }).ok, false, 'chargeur vide');
  s.act(a, { type: 'recharger' });
  assert.equal(s.r.dr.j[a].action, 'recharge');
  s.at(s.now() + 2000);
  assert.equal(s.r.dr.j[a].balles, 3);
  assert.equal(s.r.dr.j[a].action, 'vise');
  assert.equal(s.r.dr.j[a].cible, 'dragon');
});

test('en 2 contre 2, son coéquipier n\'est jamais une cible', () => {
  const s = setup({ equipesDragon: '2v2' });
  const [x, y] = s.r.equipes[0];
  s.act(x, { type: 'viser' });
  const vus = new Set();
  for (const p of [...s.r.joueurs, 'dragon']) if (s.act(x, { type: 'cibler', cible: p }).ok) vus.add(p);
  assert.ok(!vus.has(y));
  assert.deepEqual([...vus].sort(), [...s.r.equipes[1], 'dragon'].sort());
});

test('fin et classement : survivants selon les dégâts au dragon, puis éliminés (le dernier éliminé devant)', () => {
  const s = setup({ pvDragon: 3, chargeur: 9 });
  const [a, b, c, d] = s.r.joueurs;
  for (const cible of [c, d]) { // c puis d se lèvent et se font toucher deux fois
    s.act(cible, { type: 'viser' });
    viserSur(s, a, cible);
    s.act(a, { type: 'tirer' }); s.at(s.now() + 600); s.act(a, { type: 'tirer' }); s.at(s.now() + 600);
  }
  assert.ok(s.r.dr.j[c].horsJeuA < s.r.dr.j[d].horsJeuA);
  viserSur(s, a, 'dragon'); s.act(a, { type: 'tirer' });
  viserSur(s, b, 'dragon'); s.act(b, { type: 'tirer' }); s.at(s.now() + 600); s.act(b, { type: 'tirer' }); s.at(s.now() + 50);
  assert.equal(s.r.status, 'fini');
  assert.equal(s.r.dr.raison, 'dragon');
  assert.equal(s.r.points[b].place, 1, 'b : plus de dégâts');
  assert.equal(s.r.points[a].place, 2);
  assert.equal(s.r.points[d].place, 3, 'd éliminé après c');
  assert.equal(s.r.points[c].place, 4);
});

test('fin quand il ne reste qu\'un joueur, ou au bout du temps', () => {
  const s1 = setup({ viesTir: 1, chargeur: 9 });
  const [a, b, c, d] = s1.r.joueurs;
  for (const cible of [b, c, d]) { s1.act(cible, { type: 'viser' }); viserSur(s1, a, cible); s1.act(a, { type: 'tirer' }); s1.at(s1.now() + 50); }
  assert.equal(s1.r.status, 'fini');
  assert.equal(s1.r.dr.raison, 'survivant');
  assert.equal(s1.r.points[a].place, 1);
  const s2 = setup();
  s2.at(s2.r.dr.fin);
  assert.equal(s2.r.status, 'fini');
  assert.equal(s2.r.dr.raison, 'temps');
});
