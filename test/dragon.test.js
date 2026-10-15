import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];

function setup(opts = {}) {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'dragon', equipesDragon: 'chacun', viesTir: 2, munitions: 3, munitionsTrouvees: 2, tempsRecherche: 3, pvDragon: 10, attaqueMin: 30, attaqueMax: 30, dureeTir: 180, joueurs: 2, ...opts });
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

test('à l\'abri, on ne voit rien et on ne peut pas être touché ; à découvert, si', () => {
  const { g, ctx, r, pid, at, now, act } = setup();
  const [a, b] = r.joueurs;
  assert.equal(mj.playerView(ctx, g, pid(a)).etat.vue, undefined, 'à l\'abri : pas de vue du jeu');
  assert.ok(!JSON.stringify(mj.screenView(ctx, g).etat).includes('"action"'), 'l\'écran ne montre pas qui est à découvert');
  assert.equal(act(a, { type: 'viser', cible: b }).ok, true);
  assert.ok(mj.playerView(ctx, g, pid(a)).etat.vue, 'en visant, on est à découvert et on voit le jeu');
  at(now() + 1000);
  assert.equal(r.dr.j[b].vies, 2, 'cible à l\'abri : raté');
  assert.equal(r.dr.j[a].munitions, 2, 'le tir coûte une munition');
  assert.equal(r.dr.j[a].action, 'cache', 'après le tir, retour à l\'abri');
  act(b, { type: 'observer', on: true });
  act(a, { type: 'viser', cible: b });
  at(now() + 1000);
  assert.equal(r.dr.j[b].vies, 1, 'cible qui observe : touchée');
  assert.ok(r.dr.events.some(e => e.type === 'tir' && e.touche));
});

test('le dragon : touché en 1 s de visée, il attaque ceux qui sont à découvert, annoncé à l\'avance', () => {
  const { g, ctx, r, at, now, act } = setup({ attaqueMin: 10, attaqueMax: 10 });
  const [a, b, c] = r.joueurs;
  act(a, { type: 'viser', cible: 'dragon' });
  at(now() + 999);
  assert.equal(r.dr.dragon.pv, 10, 'pas avant une seconde');
  at(now() + 1);
  assert.equal(r.dr.dragon.pv, 9);
  assert.equal(r.dr.j[a].degats, 1);
  act(b, { type: 'observer', on: true });
  act(c, { type: 'chercher' });
  at(r.dr.dragon.attaque - 1500);
  assert.equal(mj.screenView(ctx, g).etat.dragon.prepare, true, 'préavis');
  at(r.dr.dragon.attaque);
  // c a fini de chercher avant l'attaque ? 3 s de recherche : non, encore à découvert
  assert.equal(r.dr.j[b].vies, 1, 'qui observe est touché');
  assert.equal(r.dr.j[a].vies, 2, 'à l\'abri : rien');
});

test('chercher des munitions : à découvert quelques secondes, +2 munitions', () => {
  const { r, at, now, act } = setup();
  const [a] = r.joueurs;
  assert.equal(act(a, { type: 'chercher' }).ok, true);
  assert.equal(act(a, { type: 'viser', cible: 'dragon' }).ok, false, 'occupé');
  at(now() + 3000);
  assert.equal(r.dr.j[a].munitions, 5);
  assert.equal(r.dr.j[a].action, 'cache');
});

test('sans munition, on ne peut pas tirer ; on ne tire pas sur son coéquipier', () => {
  const { r, at, now, act } = setup({ equipesDragon: '2v2', munitions: 1 });
  const [x, y] = r.equipes[0];
  assert.equal(act(x, { type: 'viser', cible: y }).ok, false, 'coéquipier');
  act(x, { type: 'viser', cible: 'dragon' }); at(now() + 1000);
  assert.equal(act(x, { type: 'viser', cible: 'dragon' }).ok, false, 'plus de munitions');
});

test('fin et classement : survivants selon les dégâts au dragon, puis éliminés (le dernier éliminé devant)', () => {
  const { r, at, now, act } = setup({ pvDragon: 3, munitions: 5 });
  const [a, b, c, d] = r.joueurs;
  // c est éliminé en premier, puis d (deux touches chacun pendant qu'ils observent)
  for (const cible of [c, c, d, d]) { act(cible, { type: 'observer', on: true }); act(a, { type: 'viser', cible }); at(now() + 1000); }
  assert.ok(r.dr.j[c].horsJeuA < r.dr.j[d].horsJeuA);
  // a : 1 touche au dragon (et 4 tirs sur les joueurs), b : 2 touches → le dragon (3 pv) tombe
  act(a, { type: 'viser', cible: 'dragon' }); at(now() + 1000);
  act(b, { type: 'viser', cible: 'dragon' }); at(now() + 1000);
  act(b, { type: 'viser', cible: 'dragon' }); at(now() + 1000);
  assert.equal(r.status, 'fini');
  assert.equal(r.dr.raison, 'dragon');
  assert.equal(r.points[b].place, 1, 'b : plus de dégâts');
  assert.equal(r.points[a].place, 2);
  assert.equal(r.points[d].place, 3, 'd éliminé après c');
  assert.equal(r.points[c].place, 4);
});

test('fin quand il ne reste qu\'un joueur, ou au bout du temps', () => {
  const s1 = setup({ viesTir: 1 });
  const [a, b, c, d] = s1.r.joueurs;
  for (const cible of [b, c, d]) { s1.act(cible, { type: 'observer', on: true }); s1.act(a, { type: 'viser', cible }); s1.at(s1.now() + 1000); }
  assert.equal(s1.r.status, 'fini');
  assert.equal(s1.r.dr.raison, 'survivant');
  assert.equal(s1.r.points[a].place, 1);
  const s2 = setup();
  s2.at(s2.r.dr.fin);
  assert.equal(s2.r.status, 'fini');
  assert.equal(s2.r.dr.raison, 'temps');
});
