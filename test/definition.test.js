import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';
import { wordsOf, gagnantsDevineurs } from '../server/games/minijeux/definition.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom', 'Sarah', 'Nico'];
const MOTS = ['Florpidoux', 'Gramouille', 'Zétrabule', 'Pinchaflor', 'Brouscaille', 'Tirlipote', 'Mazabouc', 'Quenouflet'];

function setup({ manches = 2, joueurs = 3, connectes = NAMES } = {}) {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1,mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'definition', joueurs, mots: MOTS.join('\n'), manches, tempsEcriture: 120, tempsVote: 90, tempsRevelation: 20 });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  connectes.forEach((n, i) => mj.claim(ctx, g, `p${i}`, n));
  const pid = n => `p${connectes.indexOf(n)}`;
  const at = ms => { t = ms; mj.tick(ctx, g); };
  const r = g.rounds[0];
  at(r.at - 299e3); // annonce
  for (const p of r.joueurs) mj.playerAction(ctx, g, pid(p), { type: 'compris' });
  return { g, ctx, r, pid, at, now: () => t };
}

test('liste de mots : un par ligne, sans doublon', () => {
  assert.deepEqual(wordsOf({ mots: ' Florpidoux \n\nflorpidoux\nGramouille' }), ['Florpidoux', 'Gramouille']);
});

test('« Compris » de tous les joueurs : la première manche commence, chacun a un mot différent de la liste', () => {
  const { r } = setup();
  assert.equal(r.status, 'jeu');
  assert.equal(r.def.manche, 1);
  assert.equal(r.def.phase, 'ecriture');
  const mots = Object.values(r.def.cur.mots);
  assert.equal(new Set(mots).size, 3);
  assert.ok(mots.every(m => MOTS.includes(m)));
});

test('personne ne voit qui a quel mot avant la révélation', () => {
  const { g, ctx, r, pid } = setup();
  const [a] = r.joueurs;
  const moi = mj.playerView(ctx, g, pid(a)).etat;
  assert.equal(moi.monMot, r.def.cur.mots[a]);
  const autres = r.joueurs.filter(p => p !== a).map(p => r.def.cur.mots[p]);
  const spect = NAMES.find(n => !r.joueurs.includes(n));
  for (const v of [mj.screenView(ctx, g), mj.playerView(ctx, g, pid(a)), mj.playerView(ctx, g, pid(spect))]) {
    const json = JSON.stringify(v);
    for (const m of autres) assert.ok(!json.includes(m), `le mot ${m} ne doit pas apparaître`);
  }
  assert.deepEqual(mj.adminView(ctx, g).etat.admin.mots, r.def.cur.mots, "l'admin voit tout");
});

test('une manche complète : écriture, vote des spectateurs, révélation, points', () => {
  const { g, ctx, r, pid, at, now } = setup({ manches: 1 });
  const [a, b, c] = r.joueurs;
  const spect = NAMES.filter(n => !r.joueurs.includes(n));
  assert.equal(mj.playerAction(ctx, g, pid(spect[0]), { type: 'ecrire', texte: 'triche' }).ok, false, 'un spectateur n\'écrit pas');
  for (const p of r.joueurs) assert.equal(mj.playerAction(ctx, g, pid(p), { type: 'ecrire', texte: `Définition de ${p}` }).ok, true);
  mj.tick(ctx, g);
  assert.equal(r.def.phase, 'vote', 'tout le monde a écrit : on passe au vote');
  const mot = p => r.def.cur.mots[p];
  const juste = { [mot(a)]: a, [mot(b)]: b, [mot(c)]: c };
  const inverse = { [mot(a)]: b, [mot(b)]: a, [mot(c)]: c };
  assert.equal(mj.playerAction(ctx, g, pid(a), { type: 'voter', liens: juste }).ok, false, 'un joueur ne vote pas');
  assert.equal(mj.playerAction(ctx, g, pid(spect[0]), { type: 'voter', liens: { [mot(a)]: a, [mot(b)]: a, [mot(c)]: c } }).ok, false, 'un joueur par mot');
  assert.equal(mj.playerAction(ctx, g, pid(spect[0]), { type: 'voter', liens: { [mot(a)]: a } }).ok, false, 'tous les mots');
  // 3 spectateurs trouvent tout, 2 se trompent sur a et b
  spect.forEach((s, i) => assert.equal(mj.playerAction(ctx, g, pid(s), { type: 'voter', liens: i < 3 ? juste : inverse }).ok, true));
  mj.tick(ctx, g);
  assert.equal(r.def.phase, 'revelation', 'tout le monde a voté');
  assert.deepEqual(r.def.cur.trouves, { [a]: 3, [b]: 3, [c]: 5 });
  const sv = mj.screenView(ctx, g).etat;
  assert.equal(sv.cartes.find(x => x.mot === mot(c)).auteur, c);
  assert.equal(mj.playerView(ctx, g, pid(spect[4])).etat.bons, 1);
  at(now() + 20e3);
  assert.equal(r.status, 'fini');
  assert.equal(r.points[c].place, 1);
  assert.equal(r.points[a].place, 2);
  assert.equal(r.points[b].place, 2);
  assert.equal(mj.screenView(ctx, g).classement.find(x => x.nom === c).points, 10);
  // Spectateurs : 3 ont tout trouvé (3), 2 en ont trouvé 1. Le premier tiers (2 sur 5), ex æquo compris, gagne 1 point.
  assert.deepEqual(r.bonus, Object.fromEntries(spect.slice(0, 3).map(s => [s, 1])));
  assert.equal(mj.screenView(ctx, g).classement.find(x => x.nom === spect[0]).points, 1);
  assert.equal(mj.screenView(ctx, g).classement.find(x => x.nom === spect[4]).points, 0);
  assert.deepEqual(mj.playerView(ctx, g, pid(spect[0])).devine, { n: 1, nom: spect[0], bons: 3, rang: 1, sur: 5, bonus: 1 });
  assert.equal(mj.playerView(ctx, g, pid(spect[4])).devine.bonus, 0);
  // Corriger les places du round ne redonne pas le bonus.
  mj.adminAction(ctx, g, { type: 'resultats', n: 1, places: { 0: 1, 1: 2, 2: 3 } });
  assert.equal(mj.screenView(ctx, g).classement.find(x => x.nom === spect[0]).points, 1);
});

test('bonus des devineurs : le premier tiers, arrondi au-dessus, ex æquo compris, au moins une bonne réponse', () => {
  const rows = l => l.map((bons, i) => ({ nom: `s${i}`, bons }));
  assert.deepEqual(gagnantsDevineurs(rows([5, 4, 3, 2, 1, 0])), ['s0', 's1']);
  assert.deepEqual(gagnantsDevineurs(rows([5, 4, 4, 2, 1, 0])), ['s0', 's1', 's2']);
  assert.deepEqual(gagnantsDevineurs(rows([3, 1])), ['s0']);
  assert.deepEqual(gagnantsDevineurs(rows([0, 0, 0])), []);
  assert.deepEqual(gagnantsDevineurs([]), []);
});

test('plusieurs manches : un nouveau mot par joueur, jamais déjà utilisé quand la liste suffit', () => {
  const { g, ctx, r, at, now } = setup({ manches: 2 });
  const m1 = Object.values(r.def.cur.mots);
  at(now() + 120e3); // fin de l'écriture
  at(now() + 90e3); // fin du vote
  at(now() + 20e3); // fin de la révélation
  assert.equal(r.def.manche, 2);
  const m2 = Object.values(r.def.cur.mots);
  assert.ok(m2.every(m => !m1.includes(m)));
  at(now() + 120e3); at(now() + 90e3); at(now() + 20e3);
  assert.equal(r.status, 'fini');
  assert.ok(Object.values(r.points).every(p => p.place === 1), 'personne n\'a été trouvé : égalité');
});

test('sans spectateur connecté, on passe directement à la révélation', () => {
  const { ctx, g, r, pid } = setup({ manches: 1, connectes: NAMES.slice(0, 8) });
  // on ne garde connectés que les joueurs
  for (const n of NAMES) if (!r.joueurs.includes(n)) mj.adminAction(ctx, g, { type: 'liberer', nom: n });
  for (const p of r.joueurs) mj.playerAction(ctx, g, pid(p), { type: 'ecrire', texte: 'Une définition' });
  mj.tick(ctx, g);
  assert.equal(r.def.phase, 'revelation');
});

test('remplacer un joueur en pleine partie : le remplaçant reprend son mot', () => {
  const { g, ctx, r } = setup();
  const [a] = r.joueurs;
  const motA = r.def.cur.mots[a];
  const neu = NAMES.find(n => !r.joueurs.includes(n));
  assert.equal(mj.adminAction(ctx, g, { type: 'remplacer', n: 1, ancien: a, nouveau: neu }).ok, true);
  assert.equal(r.def.cur.mots[neu], motA);
  assert.equal(mj.adminAction(ctx, g, { type: 'retirer', n: 1, ancien: neu }).ok, false);
});

test('l\'admin peut passer à l\'étape suivante', () => {
  const { g, ctx, r } = setup();
  assert.equal(mj.adminAction(ctx, g, { type: 'suivant' }).ok, true);
  assert.equal(r.def.phase, 'vote');
});
