import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';
import { normName } from '../server/util.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom', 'Sarah', 'Nico', 'Jade', 'Yanis', 'Emma'];
function setup(tweak = c => c, startAt = Date.UTC(2026, 9, 12, 7, 0)) { // 7 h UTC = 9 h à Genève (UTC+2)
  let t = startAt;
  const cfg = tweak({ ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120 });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  return { g, ctx, cfg, at: ms => { t = ms; mj.tick(ctx, g); }, now: () => t };
}
const clock = h => Date.UTC(2026, 9, 12, h - 2, 0); // heure de Genève -> UTC
// Fait avancer l'horloge jusqu'à l'annonce du round, puis le lance (comme si tous avaient appuyé sur « Compris »).
function jouer(ctx, at, r, g) {
  at(Math.max(ctx.now(), r.at - 299e3));
  mj.adminAction(ctx, g ?? ctx.g, { type: 'commencer' });
}

test('liste des participants : un nom par ligne, sans doublon ni ligne vide', () => {
  assert.deepEqual(mj.roster({ joueurs: ' Léa \n\nHugo\nléa\n  Inès   Martin ' }), ['Léa', 'Hugo', 'Inès Martin']);
});

test('programme : celui choisi, complété en boucle avec les mini-jeux utilisés', () => {
  const cfg = mj.defaultConfig();
  cfg.rounds = 5; cfg.programme = 'mj3,mj1';
  cfg.jeux.mj2.actif = false;
  assert.deepEqual(mj.program(cfg), ['mj3', 'mj1', 'mj4', 'mj5', 'mj6']); // rounds non choisis : mj2 (désactivé) n'est pas utilisé
});

test('annonce 5 min avant ; le round commence quand tous les joueurs ont compris', () => {
  const { g, ctx, at } = setup(c => ({ ...c, premier: 10 }), clock(10));
  const r0 = clock(10) + 10 * 60e3;
  at(r0 - 301e3);
  assert.equal(g.rounds[0].status, 'prevu');
  at(r0 - 299e3);
  assert.equal(g.rounds[0].status, 'annonce');
  assert.equal(g.rounds[0].joueurs.length, 2);
  at(r0 + 60e3);
  assert.equal(g.rounds[0].status, 'annonce', 'pas de départ automatique à l\'heure');
  const [a, b] = g.rounds[0].joueurs;
  mj.claim(ctx, g, 'pa', a); mj.claim(ctx, g, 'pb', b); mj.claim(ctx, g, 'px', NAMES.find(n => n !== a && n !== b));
  assert.equal(mj.playerAction(ctx, g, 'px', { type: 'compris' }).ok, false, 'un spectateur ne compte pas');
  assert.equal(mj.playerAction(ctx, g, 'pa', { type: 'compris' }).ok, true);
  assert.equal(g.rounds[0].status, 'annonce');
  assert.deepEqual(mj.screenView(ctx, g).actif.compris, [a]);
  mj.playerAction(ctx, g, 'pb', { type: 'compris' });
  assert.equal(g.rounds[0].status, 'jeu');
  at(clock(12));
  assert.equal(g.rounds[0].status, 'jeu', 'le round attend les résultats');
  assert.equal(g.rounds[1].status, 'prevu', 'le suivant attend que le précédent soit fini');
});

test('tout le monde joue autant (à un près), jamais deux rounds de suite quand c\'est possible', () => {
  const { g, ctx, at } = setup(c => ({ ...c, rounds: 24, programme: '' }));
  let back2back = 0, prev = [];
  for (const r of g.rounds) {
    jouer(ctx, at, r, g);
    assert.equal(r.status, 'jeu');
    back2back += r.joueurs.filter(p => prev.includes(p)).length;
    prev = r.joueurs;
    mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: Object.fromEntries(r.equipes.map((_, i) => [i, i + 1])) });
    at(ctx.now() + 60e3);
  }
  const counts = NAMES.map(n => g.played[n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()] ?? Object.entries(g.played).find(([k]) => k.startsWith(n.slice(0, 2).toLowerCase()))?.[1]);
  const values = Object.values(g.played);
  assert.equal(values.length, NAMES.length, 'tout le monde a joué');
  assert.ok(Math.max(...values) - Math.min(...values) <= 1, `répartition : ${JSON.stringify(g.played)}`);
  assert.equal(back2back, 0);
});

test('les joueurs connectés passent avant ceux sans téléphone, à nombre de rounds égal', () => {
  const g = { played: {}, pairs: {}, claims: { tom: 'p1', jade: 'p2' } };
  const sel = mj.draw(g, NAMES, 2);
  assert.deepEqual(sel.sort(), ['Jade', 'Tom']);
});

test('remplacement manuel : les compteurs suivent', () => {
  const { g, ctx, at } = setup();
  jouer(ctx, at, g.rounds[0], g);
  const r = g.rounds[0];
  assert.equal(r.status, 'jeu');
  const [absent] = r.joueurs;
  const remplacant = NAMES.find(n => !r.joueurs.includes(n));
  assert.equal(mj.adminAction(ctx, g, { type: 'remplacer', n: 1, ancien: absent, nouveau: remplacant }).ok, true);
  assert.ok(r.joueurs.includes(remplacant) && !r.joueurs.includes(absent));
  const k = normName;
  assert.equal(g.played[k(absent)] || 0, 0);
  assert.equal(g.played[k(remplacant)], 1);
  assert.equal(mj.adminAction(ctx, g, { type: 'remplacer', n: 1, ancien: remplacant, nouveau: r.joueurs[1] }).ok, false, 'pas deux fois le même');
});

test('résultats : points par place, ex æquo, correction après coup', () => {
  const { g, ctx, at } = setup(c => { c.jeux.mj1.joueurs = 3; c.jeux.mj1.points = '10, 6, 3'; return c; });
  jouer(ctx, at, g.rounds[0], g);
  const r = g.rounds[0];
  const [a, b, c] = r.joueurs;
  assert.equal(mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { 0: 1, 1: 2 } }).ok, false, 'tout le monde doit avoir une place');
  assert.equal(mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { 0: 1, 1: 1, 2: 3 } }).ok, true);
  assert.equal(r.status, 'fini');
  const pts = n => mj.screenView(ctx, g).classement.find(x => x.nom === n).points;
  assert.deepEqual([pts(a), pts(b), pts(c)], [10, 10, 3]);
  mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { 0: 3, 1: 2, 2: 1 } });
  assert.deepEqual([pts(a), pts(b), pts(c)], [3, 6, 10]);
});

test('passer un round en cours annule sa participation ; décaler le planning', () => {
  const { g, ctx, at } = setup();
  jouer(ctx, at, g.rounds[0], g);
  assert.equal(Object.values(g.played).reduce((a, b) => a + b, 0), 2);
  mj.adminAction(ctx, g, { type: 'passer', n: 1 });
  assert.equal(g.rounds[0].status, 'saute');
  assert.ok(Object.values(g.played).every(v => v === 0), 'participation annulée');
  const avant = g.rounds[2].at;
  mj.adminAction(ctx, g, { type: 'decaler', sec: 300 });
  assert.equal(g.rounds[2].at, avant + 300e3);
});

test('prendre son nom sur un téléphone : un nom = un téléphone', () => {
  const { g, ctx } = setup();
  assert.equal(mj.claim(ctx, g, 'p1', 'léa').ok, true);
  assert.equal(mj.claim(ctx, g, 'p2', 'Léa').ok, false);
  assert.equal(mj.claim(ctx, g, 'p1', 'Inconnu').ok, false);
  assert.equal(mj.playerView(ctx, g, 'p1').nom, 'Léa');
  assert.equal(mj.playerView(ctx, g, 'p2').claim, true);
  assert.ok(!mj.playerView(ctx, g, 'p2').libres.includes('Léa'));
  mj.claim(ctx, g, 'p1', 'Hugo');
  assert.equal(mj.playerView(ctx, g, 'p1').nom, 'Hugo', 'changer de nom libère l\'ancien');
  mj.adminAction(ctx, g, { type: 'liberer', nom: 'Hugo' });
  assert.equal(mj.playerView(ctx, g, 'p1').claim, true);
});

test('le téléphone sait quand c\'est son tour', () => {
  const { g, ctx, at } = setup();
  at(clock(10) - 200e3);
  const [p] = g.rounds[0].joueurs;
  mj.claim(ctx, g, 'moi', p);
  const v = mj.playerView(ctx, g, 'moi');
  assert.equal(v.monTour.n, 1);
  assert.equal(v.monTour.status, 'annonce');
});

test('fin de journée après le dernier round, puis podium', () => {
  const { g, ctx, at } = setup(c => ({ ...c, rounds: 2 }));
  for (const r of g.rounds) {
    jouer(ctx, at, r, g);
    mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: Object.fromEntries(r.equipes.map((_, i) => [i, i + 1])) });
  }
  at(ctx.now() + 10e3);
  assert.equal(g.finished, false, 'on laisse les derniers résultats à l\'écran');
  at(ctx.now() + 60e3);
  assert.equal(g.finished, true);
});

test('nombre de rounds attendu par personne', () => {
  const { g, cfg } = setup(c => ({ ...c, rounds: 11 }));
  assert.deepEqual(mj.expected(cfg, g), { min: 2, max: 2 }); // 11 rounds × 2 joueurs / 11 personnes
});

test('annoncer à la main, puis commencer sans attendre les « Compris »', () => {
  const { g, ctx } = setup(c => c, clock(9)); // le premier round est à 9 h 05 : pas encore annoncé
  assert.equal(mj.adminAction(ctx, g, { type: 'annoncer' }).ok, true);
  assert.equal(g.rounds[0].status, 'annonce');
  assert.equal(mj.adminAction(ctx, g, { type: 'commencer' }).ok, true);
  assert.equal(g.rounds[0].status, 'jeu');
  assert.equal(g.rounds[1].at, clock(9) + 5 * 60e3 + 15 * 60e3, 'les rounds suivants gardent leur heure');
});

test('formats : lecture de « 2v2 », « 3v1 », « 1v1v1v1 »', () => {
  assert.deepEqual(mj.parseFormat('2v2'), [2, 2]);
  assert.deepEqual(mj.parseFormat('3 v 1'), [3, 1]);
  assert.deepEqual(mj.parseFormat('1v1v1v1'), [1, 1, 1, 1]);
  assert.deepEqual(mj.parseFormat('2 contre 2 contre 2'), [2, 2, 2]);
  assert.equal(mj.parseFormat(''), null);
  assert.equal(mj.parseFormat('n\'importe quoi'), null);
  assert.equal(mj.parseFormat('0v3'), null);
  assert.equal(mj.formatLabel([3, 1]), '3 contre 1');
  assert.equal(mj.formatLabel([1, 1, 1, 1]), 'Chacun pour soi (4)');
  assert.equal(mj.formatLabel(null), 'Chacun pour soi');
});

test('2v2 : 4 joueurs en deux équipes de 2, points pour toute l\'équipe', () => {
  const { g, ctx, at } = setup(c => { c.jeux.mj1.format = '2v2'; c.jeux.mj1.points = '10, 4'; return c; });
  jouer(ctx, at, g.rounds[0], g);
  const r = g.rounds[0];
  assert.equal(r.joueurs.length, 4);
  assert.deepEqual(r.equipes.map(t => t.length), [2, 2]);
  assert.equal(mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { 0: 2, 1: 1 } }).ok, true);
  const pts = n => mj.screenView(ctx, g).classement.find(x => x.nom === n).points;
  assert.deepEqual(r.equipes[1].map(pts), [10, 10]);
  assert.deepEqual(r.equipes[0].map(pts), [4, 4]);
});

test('3v1 : le joueur seul change d\'un round à l\'autre', () => {
  const g = { played: {}, pairs: {}, mates: {}, solo: {}, claims: {} };
  const four = ['Léa', 'Hugo', 'Inès', 'Malik'];
  const seuls = new Set();
  for (let k = 0; k < 4; k++) {
    const teams = mj.teamsFor(g, four, [3, 1]);
    assert.deepEqual(teams.map(t => t.length), [3, 1]);
    seuls.add(teams[1][0]);
    g.solo[teams[1][0].toLocaleLowerCase('fr')] = (g.solo[teams[1][0].toLocaleLowerCase('fr')] || 0) + 1;
  }
  assert.equal(seuls.size, 4, 'chacun a été seul une fois');
});

test('2v2 : on évite de remettre les mêmes coéquipiers', () => {
  const g = { played: {}, pairs: {}, mates: { 'hugo|léa': 3, 'inès|malik': 3 }, solo: {}, claims: {} };
  const teams = mj.teamsFor(g, ['Léa', 'Hugo', 'Inès', 'Malik'], [2, 2]);
  const together = (a, b) => teams.some(t => t.includes(a) && t.includes(b));
  assert.ok(!together('Léa', 'Hugo') && !together('Inès', 'Malik'));
});

test('2v2 : remplacer garde l\'équipe, ajouter va dans la plus petite équipe', () => {
  const { g, ctx, at } = setup(c => { c.jeux.mj1.format = '2v2'; return c; });
  jouer(ctx, at, g.rounds[0], g);
  const r = g.rounds[0];
  const [x] = r.equipes[0];
  const libre = NAMES.find(n => !r.joueurs.includes(n));
  mj.adminAction(ctx, g, { type: 'remplacer', n: 1, ancien: x, nouveau: libre });
  assert.ok(r.equipes[0].includes(libre) && !r.joueurs.includes(x));
  mj.adminAction(ctx, g, { type: 'retirer', n: 1, ancien: r.equipes[1][0] });
  assert.deepEqual(r.equipes.map(t => t.length), [2, 1]);
  const autre = NAMES.find(n => !r.joueurs.includes(n));
  mj.adminAction(ctx, g, { type: 'ajouter', n: 1, nouveau: autre });
  assert.deepEqual(r.equipes.map(t => t.length), [2, 2]);
  assert.ok(r.equipes[1].includes(autre));
});

test('le téléphone connaît ses coéquipiers et ses adversaires', () => {
  const { g, ctx, at } = setup(c => { c.jeux.mj1.format = '3v1'; return c; });
  at(clock(10) - 200e3);
  const r = g.rounds[0];
  const seul = r.equipes[1][0];
  mj.claim(ctx, g, 'moi', seul);
  const v = mj.playerView(ctx, g, 'moi').monTour;
  assert.equal(v.coequipiers.length, 0);
  assert.equal(v.adversaires[0].length, 3);
  assert.equal(v.format, '3 contre 1');
});

test("rounds : le premier X min après l'ouverture, puis un toutes les Y min", () => {
  const { g } = setup(c => ({ ...c, premier: 5, intervalle: 15 }), clock(10));
  assert.equal(g.rounds.length, 12);
  assert.equal(g.rounds[0].at, clock(10) + 5 * 60e3);
  assert.equal(g.spacing, 15 * 60e3);
  assert.equal(g.rounds[11].at, clock(10) + 5 * 60e3 + 11 * 15 * 60e3);
});
