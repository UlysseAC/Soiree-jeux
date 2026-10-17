import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';
import { correspond } from '../server/games/minijeux/mime.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];
const MOTS = ['Girafe', 'Brosse à dents', 'Hélicoptère', 'Pingouin', 'Ski', 'Œuf', 'Kangourou', 'Pompier', 'Robot', 'Ninja', 'Vampire', 'Statue'];

function setup() {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'mime', motsMime: MOTS.join('\n'), tempsMime: 45, tempsPret: 10, joueurs: 3, format: '1v1v1v1' });
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

test('réponse : sans accents, sans majuscules, sans article, avec une petite faute', () => {
  assert.ok(correspond('helicoptere', 'Hélicoptère'));
  assert.ok(correspond('  HELICOPTERE ', 'Hélicoptère'));
  assert.ok(correspond('helicopter', 'Hélicoptère'), 'une lettre oubliée');
  assert.ok(correspond('helicotpere', 'Hélicoptère'), 'deux lettres inversées');
  assert.ok(correspond('une girafe', 'Girafe'), 'article');
  assert.ok(correspond('girafes', 'Girafe'), 'pluriel');
  assert.ok(correspond('girafle', 'Girafe'), 'une faute');
  assert.ok(correspond('brosse a dent', 'Brosse à dents'));
  assert.ok(correspond('brossedents', 'Brosse à dents'));
  assert.ok(correspond('oeuf', 'Œuf'));
  assert.ok(!correspond('giraffon', 'Girafe'), 'trop différent');
  assert.ok(!correspond('kangou', 'Kangourou'));
  assert.ok(!correspond('sky', 'Ski'), 'mot très court : pas de faute');
  assert.ok(!correspond('', 'Ski'));
});

test('le Mime se joue toujours à 4, en 2 duos', () => {
  const { r } = setup();
  assert.deepEqual(r.format, [2, 2]);
  assert.equal(r.joueurs.length, 4);
  assert.equal(r.equipes.length, 2);
  assert.ok(r.equipes.every(t => t.length === 2));
  assert.equal(r.status, 'jeu');
  // 4 tours : le premier de chaque duo mime, puis on inverse
  assert.equal(r.mi.tours.length, 4);
  assert.deepEqual(r.mi.tours.map(t => t.equipe), [0, 1, 0, 1]);
  assert.equal(r.mi.tours[2].mime, r.mi.tours[0].devine);
});

test('un tour : préparation, mot visible seulement par celui qui mime, trouvé, passé, fin du temps', () => {
  const { g, ctx, r, pid, at, now } = setup();
  const { mime, devine } = r.mi.tours[0];
  assert.equal(r.mi.phase, 'pret');
  assert.equal(mj.playerAction(ctx, g, pid(devine), { type: 'pret' }).ok, false, 'seul celui qui mime lance');
  assert.equal(mj.playerAction(ctx, g, pid(mime), { type: 'pret' }).ok, true);
  at(now() + 50);
  assert.equal(r.mi.phase, 'mime');
  const mot = r.mi.mot;
  assert.ok(MOTS.includes(mot));
  assert.equal(mj.playerView(ctx, g, pid(mime)).etat.mot, mot);
  for (const v of [mj.playerView(ctx, g, pid(devine)), mj.screenView(ctx, g), mj.playerView(ctx, g, pid(NAMES.find(n => !r.joueurs.includes(n))))]) {
    assert.ok(!JSON.stringify(v).includes(mot), 'le mot reste secret');
  }
  assert.equal(mj.playerAction(ctx, g, pid(mime), { type: 'deviner', texte: mot }).ok, false, 'celui qui mime ne devine pas');
  assert.equal(mj.playerAction(ctx, g, pid(devine), { type: 'deviner', texte: 'zzz' }).ok, false);
  assert.deepEqual(mj.screenView(ctx, g).etat.essais, ['zzz'], 'les essais faux s\'affichent');
  assert.equal(mj.playerAction(ctx, g, pid(devine), { type: 'deviner', texte: mot.toUpperCase() }).ok, true);
  assert.equal(r.mi.score[0], 1);
  assert.notEqual(r.mi.mot, mot, 'mot suivant');
  assert.deepEqual(r.mi.essais, []);
  const mot2 = r.mi.mot;
  assert.equal(mj.playerAction(ctx, g, pid(devine), { type: 'passer' }).ok, false, 'seul celui qui mime passe');
  assert.equal(mj.playerAction(ctx, g, pid(mime), { type: 'passer' }).ok, true);
  assert.equal(r.mi.score[0], 1, 'passer ne rapporte rien');
  assert.ok(mj.screenView(ctx, g).etat.histo.some(e => e.mot === mot2 && !e.trouve), 'le mot passé est dévoilé');
  at(now() + 45e3);
  assert.equal(r.mi.tour, 1, 'au bout de 45 s, le duo suivant');
  assert.equal(r.mi.phase, 'pret');
  assert.equal(r.mi.histo.length, 3, 'le mot en cours à la fin du temps est dévoilé');
});

test('partie complète : chaque mot une seule fois dans le round, le duo qui a trouvé le plus gagne', () => {
  const { g, ctx, r, pid, at, now } = setup();
  const vus = [];
  for (let k = 0; k < 4; k++) {
    at(now() + 10e3); // fin de la préparation
    const { devine, equipe } = r.mi.tours[k];
    const n = equipe === 0 ? 2 : 1; // duo 0 trouve 2 mots par tour, duo 1 un seul
    for (let i = 0; i < n && r.mi.mot; i++) { vus.push(r.mi.mot); mj.playerAction(ctx, g, pid(devine), { type: 'deviner', texte: r.mi.mot }); }
    at(now() + 45e3);
  }
  assert.equal(new Set(vus).size, vus.length);
  assert.equal(r.status, 'fini');
  assert.deepEqual(r.mi.score, { 0: 4, 1: 2 });
  for (const p of r.equipes[0]) assert.equal(r.points[p].place, 1);
  for (const p of r.equipes[1]) assert.equal(r.points[p].place, 2);
});

test('plus de mots dans la liste : le tour s\'arrête', () => {
  const { g, ctx, r, pid, at, now } = setup();
  at(now() + 10e3);
  const { mime } = r.mi.tours[0];
  for (let i = 0; i < MOTS.length; i++) mj.playerAction(ctx, g, pid(mime), { type: 'passer' });
  assert.equal(r.mi.mot, null);
  at(now() + 50);
  assert.equal(r.mi.tour, 1);
});
