import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';
import { obstaclesOf, decorDe, planEtape } from '../server/games/minijeux/temple.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];

function setup({ etapes = 3, vies = 3, joueurs = 3, cheminsEtapes = '' } = {}) {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'temple', joueurs, etapes, vies, cheminsEtapes, tempsChoix: 20, tempsPiege: 5, format: '2v2' });
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

// Fait choisir chaque joueur vivant : sur le piège pour ceux de « tombent », à côté pour les autres.
function etape(ctx, g, r, pid, tombent = []) {
  const piege = r.tp.cur.pieges[0], sur = r.tp.cur.chemins.findIndex((_, i) => !r.tp.cur.pieges.includes(i));
  for (const p of r.joueurs) if (r.tp.vies[p] > 0) assert.equal(mj.playerAction(ctx, g, pid(p), { type: 'choisir', chemin: tombent.includes(p) ? piege : sur }).ok, true);
  mj.tick(ctx, g);
}

test('obstacles : un par ligne, avec la phrase du piège après « | »', () => {
  assert.deepEqual(obstaclesOf({ obstacles: 'Pont | Le pont casse !\n\npont\nGrotte' }), [{ nom: 'Pont', piege: 'Le pont casse !', decor: 'eau' }, { nom: 'Grotte', piege: '', decor: 'tunnel' }]);
});

test('décor : choisi en fin de ligne, sinon deviné d\'après le nom', () => {
  assert.deepEqual(obstaclesOf({ obstacles: 'Champ de cactus | Les épines te piquent ! | Jungle\nPont du dragon | | VOLCAN\nChemin | Aïe | inconnu' }).map(o => [o.nom, o.piege, o.decor]),
    [['Champ de cactus', 'Les épines te piquent !', 'jungle'], ['Pont du dragon', '', 'volcan'], ['Chemin', 'Aïe', 'jungle']]);
  assert.equal(decorDe('Pont de lianes'), 'eau', 'un pont reste un pont');
  assert.equal(decorDe('Liane au-dessus du ravin'), 'liane');
  assert.equal(decorDe('Paroi rocheuse'), 'escalade');
  assert.equal(decorDe('Coulée de lave'), 'volcan');
  assert.equal(decorDe('Gouffre sans fond'), 'ravin');
  assert.equal(decorDe('Nid de vipères'), 'serpents');
  assert.equal(decorDe('Caverne'), 'tunnel');
  assert.equal(decorDe('Sables mouvants'), 'marais');
  assert.equal(decorDe('Salle des statues'), 'pierre');
  assert.equal(decorDe('Champ de cactus'), 'jungle');
});

test('le jeu commence après « J\'ai compris » : chacun pour soi même si un format d\'équipes traîne dans les réglages', () => {
  const { r } = setup();
  assert.equal(r.status, 'jeu');
  assert.equal(r.joueurs.length, 3);
  assert.equal(r.format, null);
  assert.equal(r.tp.phase, 'choix');
  assert.equal(r.tp.cur.chemins.length, 2);
  assert.notEqual(r.tp.cur.chemins[0].nom, r.tp.cur.chemins[1].nom);
  assert.equal(r.tp.cur.pieges.length, 1);
  assert.ok(Object.values(r.tp.vies).every(v => v === 3));
});

test('personne ne voit le piège ni le choix des autres avant la révélation', () => {
  const { g, ctx, r, pid } = setup();
  const [a] = r.joueurs;
  mj.playerAction(ctx, g, pid(a), { type: 'choisir', chemin: 0 });
  const spect = NAMES.find(n => !r.joueurs.includes(n));
  for (const v of [mj.screenView(ctx, g).etat, mj.playerView(ctx, g, pid(spect)).etat, mj.playerView(ctx, g, pid(r.joueurs[1])).etat]) {
    assert.equal(v.pieges, undefined);
    assert.equal(v.messages, undefined);
    assert.ok(v.joueurs.every(p => p.choix === undefined));
    assert.equal(v.joueurs.find(p => p.nom === a).choisi, true);
  }
  assert.equal(mj.playerView(ctx, g, pid(a)).etat.monChoix, 0);
});

test('une partie : le piège fait perdre une vie, à 0 on est éliminé, le plus de vies au temple gagne', () => {
  const { g, ctx, r, pid, at, now } = setup({ etapes: 3, vies: 2 });
  const [a, b, c] = r.joueurs;
  assert.equal(mj.playerAction(ctx, g, pid(NAMES.find(n => !r.joueurs.includes(n))), { type: 'choisir', chemin: 0 }).ok, false, 'un spectateur ne joue pas');
  etape(ctx, g, r, pid, [b, c]);
  assert.equal(r.tp.phase, 'resultat', 'tout le monde a choisi : révélation');
  assert.deepEqual(r.tp.vies, { [a]: 2, [b]: 1, [c]: 1 });
  assert.equal(mj.screenView(ctx, g).etat.joueurs.find(p => p.nom === b).perdu, true);
  assert.equal(mj.playerAction(ctx, g, pid(a), { type: 'choisir', chemin: 0 }).ok, false, 'trop tard');
  at(now() + 5e3);
  assert.equal(r.tp.etape, 2);
  etape(ctx, g, r, pid, [c]);
  assert.equal(r.tp.vies[c], 0);
  assert.equal(r.tp.mort[c], 2);
  at(now() + 5e3);
  assert.equal(mj.playerAction(ctx, g, pid(c), { type: 'choisir', chemin: 0 }).ok, false, 'un éliminé ne joue plus');
  etape(ctx, g, r, pid, [a]);
  at(now() + 5e3);
  assert.equal(r.tp.phase, 'arrivee');
  at(now() + 5e3);
  assert.equal(r.status, 'fini');
  // a : 1 vie, b : 1 vie (ex æquo), c : éliminé
  assert.equal(r.points[a].place, 1);
  assert.equal(r.points[b].place, 1);
  assert.equal(r.points[c].place, 3);
});

test('sans choix à temps, le hasard choisit ; tous éliminés : on va directement au temple', () => {
  const { g, ctx, r, at, now } = setup({ etapes: 5, vies: 1 });
  let n = 0;
  while (r.status === 'jeu' && n++ < 50) at(now() + 21e3);
  assert.equal(r.status, 'fini');
  assert.ok(r.tp.passees.every(e => Object.keys(e.choix).length > 0));
  assert.ok(r.tp.passees[0].auto.length === 3, 'personne n\'a choisi : 3 choix au hasard');
  const vivants = r.joueurs.filter(p => r.tp.vies[p] > 0);
  if (!vivants.length) assert.ok(r.tp.etape <= 5);
  else assert.equal(r.tp.etape, 5);
  for (const p of r.joueurs) assert.ok(r.points[p], 'chaque joueur a une place');
  // Les éliminés tardifs passent devant les éliminés précoces
  const morts = r.joueurs.filter(p => !(r.tp.vies[p] > 0)).sort((x, y) => r.tp.mort[y] - r.tp.mort[x]);
  for (let i = 1; i < morts.length; i++) assert.ok(r.points[morts[i - 1]].place <= r.points[morts[i]].place);
});

test('remplacer un joueur en pleine partie : le remplaçant reprend ses vies', () => {
  const { g, ctx, r, pid } = setup();
  const [a, b, c] = r.joueurs;
  etape(ctx, g, r, pid, [a]);
  const neu = NAMES.find(n => !r.joueurs.includes(n));
  assert.equal(mj.adminAction(ctx, g, { type: 'remplacer', n: 1, ancien: a, nouveau: neu }).ok, true);
  assert.equal(r.tp.vies[neu], 2);
  assert.equal(r.tp.vies[a], undefined);
});

test('chemins par étape : 2 puis 3, puis 4 dont 2 piégés ; la dernière valeur vaut pour la suite', () => {
  const sc = { cheminsEtapes: '2:1, 2:1, 3:1, 4:2' };
  assert.deepEqual([1, 2, 3, 4, 5].map(k => planEtape(sc, k)), [{ chemins: 2, pieges: 1 }, { chemins: 2, pieges: 1 }, { chemins: 3, pieges: 1 }, { chemins: 4, pieges: 2 }, { chemins: 4, pieges: 2 }]);
  assert.deepEqual(planEtape({ cheminsEtapes: '' }, 3), { chemins: 2, pieges: 1 });
  assert.deepEqual(planEtape({ cheminsEtapes: '9:9' }, 1), { chemins: 4, pieges: 3 }, 'au plus 4 chemins, au moins un sûr');
  const { g, ctx, r, pid, at, now } = setup({ etapes: 3, cheminsEtapes: '2:1,4:3' });
  const pass = () => { for (const p of r.joueurs) if (r.tp.vies[p] > 0) mj.playerAction(ctx, g, pid(p), { type: 'choisir', chemin: r.tp.cur.chemins.findIndex((_, i) => !r.tp.cur.pieges.includes(i)) }); mj.tick(ctx, g); at(now() + 5e3); };
  assert.equal(r.tp.cur.chemins.length, 2);
  pass();
  assert.equal(r.tp.cur.chemins.length, 4);
  assert.equal(r.tp.cur.pieges.length, 3);
  assert.equal(new Set(r.tp.cur.chemins.map(c => c.nom)).size, 4, 'des obstacles différents');
  assert.equal(mj.playerAction(ctx, g, pid(r.joueurs[0]), { type: 'choisir', chemin: 4 }).ok, false, 'chemin inexistant');
  // tout le monde sur un chemin piégé
  for (const p of r.joueurs) mj.playerAction(ctx, g, pid(p), { type: 'choisir', chemin: r.tp.cur.pieges[1] });
  mj.tick(ctx, g);
  assert.ok(r.joueurs.every(p => r.tp.vies[p] === 2));
});
