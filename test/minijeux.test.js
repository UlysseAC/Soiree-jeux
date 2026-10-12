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
// Fait avancer l'horloge jusqu'au début du round (en passant par son annonce, comme en vrai).
function jouer(ctx, at, r) {
  at(Math.max(ctx.now(), r.at - 299e3));
  at(Math.max(ctx.now() + 1, r.at, r.annonceAt + 120e3));
}

test('liste des participants : un nom par ligne, sans doublon ni ligne vide', () => {
  assert.deepEqual(mj.roster({ joueurs: ' Léa \n\nHugo\nléa\n  Inès   Martin ' }), ['Léa', 'Hugo', 'Inès Martin']);
});

test('heure du jour dans le fuseau de l\'admin', () => {
  assert.equal(mj.tsAt('10:00', -120, clock(9)), clock(10));
  assert.equal(new Date(mj.tsAt('18:30', -120, clock(9))).getUTCHours(), 16);
});

test('rounds répartis à intervalles égaux entre début et fin', () => {
  const { g } = setup();
  assert.equal(g.rounds.length, 12);
  assert.equal(g.rounds[0].at, clock(10));
  assert.equal(g.spacing, 40 * 60e3); // 8 h / 12 rounds
  assert.equal(g.rounds[11].at, clock(10) + 11 * 40 * 60e3);
  assert.equal(g.late, false);
});

test('journée lancée en retard : elle part de maintenant', () => {
  const { g } = setup(c => c, clock(12));
  assert.equal(g.late, true);
  assert.equal(g.rounds[0].at, clock(12) + 300e3);
  assert.ok(g.rounds[11].at < clock(18));
});

test('programme : celui choisi, complété en boucle avec les mini-jeux utilisés', () => {
  const cfg = mj.defaultConfig();
  cfg.rounds = 5; cfg.programme = 'mj3,mj1';
  cfg.jeux.mj2.actif = false;
  assert.deepEqual(mj.program(cfg), ['mj3', 'mj1', 'mj4', 'mj5', 'mj6']); // rounds non choisis : mj2 (désactivé) n'est pas utilisé
});

test('annonce 5 min avant, début à l\'heure, puis attente des résultats', () => {
  const { g, at } = setup();
  at(clock(10) - 301e3);
  assert.equal(g.rounds[0].status, 'prevu');
  at(clock(10) - 299e3);
  assert.equal(g.rounds[0].status, 'annonce');
  assert.equal(g.rounds[0].joueurs.length, 2);
  at(clock(10));
  assert.equal(g.rounds[0].status, 'jeu');
  at(clock(12));
  assert.equal(g.rounds[0].status, 'jeu', 'le round attend les résultats');
  assert.equal(g.rounds[1].status, 'prevu', 'le suivant attend que le précédent soit fini');
});

test('tout le monde joue autant (à un près), jamais deux rounds de suite quand c\'est possible', () => {
  const { g, ctx, at } = setup(c => ({ ...c, rounds: 24, programme: '' }));
  let back2back = 0, prev = [];
  for (const r of g.rounds) {
    jouer(ctx, at, r);
    assert.equal(r.status, 'jeu');
    back2back += r.joueurs.filter(p => prev.includes(p)).length;
    prev = r.joueurs;
    mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: Object.fromEntries(r.joueurs.map((p, i) => [p, i + 1])) });
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
  jouer(ctx, at, g.rounds[0]);
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
  jouer(ctx, at, g.rounds[0]);
  const r = g.rounds[0];
  const [a, b, c] = r.joueurs;
  assert.equal(mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { [a]: 1, [b]: 2 } }).ok, false, 'tout le monde doit avoir une place');
  assert.equal(mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { [a]: 1, [b]: 1, [c]: 3 } }).ok, true);
  assert.equal(r.status, 'fini');
  const pts = n => mj.screenView(ctx, g).classement.find(x => x.nom === n).points;
  assert.deepEqual([pts(a), pts(b), pts(c)], [10, 10, 3]);
  mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { [a]: 3, [b]: 2, [c]: 1 } });
  assert.deepEqual([pts(a), pts(b), pts(c)], [3, 6, 10]);
});

test('passer un round en cours annule sa participation ; décaler le planning', () => {
  const { g, ctx, at } = setup();
  jouer(ctx, at, g.rounds[0]);
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
    jouer(ctx, at, r);
    mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: Object.fromEntries(r.joueurs.map((p, i) => [p, i + 1])) });
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

test('annoncer à la main : le round commence 2 min plus tard, pas à son heure prévue', () => {
  const { g, ctx, at } = setup();
  at(clock(9)); // une heure avant le premier round
  const r = mj.adminAction(ctx, g, { type: 'annoncer' });
  assert.equal(r.ok, true);
  assert.equal(g.rounds[0].status, 'annonce');
  at(clock(9) + 119e3);
  assert.equal(g.rounds[0].status, 'annonce');
  at(clock(9) + 120e3);
  assert.equal(g.rounds[0].status, 'jeu');
  assert.equal(g.rounds[1].at, clock(10) + 40 * 60e3, 'les rounds suivants gardent leur heure');
});
