// L'Enquête : cartes, salles (QR code), interrogatoires, indices, accusations, fin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as E from '../server/games/enquete.js';

function setup(n = 12, tweak = c => c) {
  let t = 1_800_000_000_000;
  const cfg = tweak(E.defaultConfig());
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] ?? '?', sfx: () => {} };
  const g = E.start(ctx, pids);
  return { g, ctx, cfg, pids, avance: ms => { t += ms; return E.tick(ctx, g); }, now: () => t };
}
// code de la salle du moment, comme sur la tablette
const code = (ctx, g, n) => E.salleView(ctx, g, n).code;
const entrer = (ctx, g, p, n) => E.playerAction(ctx, g, p, { type: 'entrer', salle: n, code: code(ctx, g, n) });

test('cartes : 11 salles, autant de personnages que de joueurs, 7 armes ; solution hors des mains ; 3 cartes chacun, 2 joueurs au plus par carte', () => {
  for (const n of [12, 14]) {
    const { g } = setup(n);
    const types = t => Object.values(g.cartes).filter(c => c.type === t).length;
    assert.deepEqual([types('salle'), types('perso'), types('arme')], [11, n, 7]);
    const sol = Object.values(g.solution);
    const compte = {};
    for (const J of Object.values(g.joueurs)) {
      assert.equal(J.main.length, 3);
      assert.equal(new Set(J.main).size, 3, 'jamais deux fois la même carte');
      for (const c of J.main) { assert.ok(!sol.includes(c), 'la solution n\'est chez personne'); compte[c] = (compte[c] || 0) + 1; }
    }
    assert.ok(Object.values(compte).every(x => x <= 2), 'deux joueurs au plus par carte');
    const distribuees = 11 + n + 7 - 3;
    assert.equal(Object.keys(compte).length, distribuees, 'toutes les cartes hors solution sont distribuées');
    assert.equal(Object.values(compte).filter(x => x === 2).length, 3 * n - distribuees, `${n} joueurs : ${3 * n - distribuees} doublons`);
    assert.equal(new Set(Object.values(g.joueurs).map(J => J.perso)).size, n, 'un personnage par joueur');
  }
});

test('solution fixée dans l\'admin ; le tueur est le joueur de ce personnage', () => {
  const { g, ctx } = setup(12, c => ({ ...c, solution: { salle: 'Cave', perso: 'La Comtesse', arme: 'Poison' } }));
  assert.deepEqual([g.cartes[g.solution.salle].nom, g.cartes[g.solution.perso].nom, g.cartes[g.solution.arme].nom], ['Cave', 'La Comtesse', 'Poison']);
  E.adminAction(ctx, g, { type: 'lancer' });
  E.adminAction(ctx, g, { type: 'terminer' });
  const tueur = Object.keys(g.joueurs).find(p => g.joueurs[p].perso === g.solution.perso);
  assert.equal(E.playerView(ctx, g, tueur).tueur, true);
  assert.equal(E.screenView(ctx, g).revelation.tueur, ctx.name(tueur));
});

test('salles : on entre avec le code du QR (qui change), une salle à la fois', () => {
  const { g, ctx, avance } = setup();
  assert.equal(entrer(ctx, g, 'p0', 2).ok, false, 'pas avant le lancement');
  E.adminAction(ctx, g, { type: 'lancer' });
  const c = code(ctx, g, 2);
  assert.match(c, /^\d{4}$/);
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'entrer', salle: 2, code: '0000' }).ok, false);
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'entrer', salle: 2, code: c }).ok, true);
  assert.equal(g.joueurs.p0.salle, 's2');
  avance(31e3);
  assert.notEqual(code(ctx, g, 2), c, 'le code a changé');
  assert.equal(E.playerAction(ctx, g, 'p1', { type: 'entrer', salle: 2, code: c }).ok, true, 'le code précédent marche encore un moment');
  avance(31e3);
  assert.equal(E.playerAction(ctx, g, 'p2', { type: 'entrer', salle: 2, code: c }).ok, false, 'trop vieux');
  // code tapé à la main, sans dire la salle
  assert.equal(E.playerAction(ctx, g, 'p2', { type: 'entrer', code: code(ctx, g, 5) }).ok, true);
  assert.equal(g.joueurs.p2.salle, 's5');
  entrer(ctx, g, 'p0', 5);
  assert.equal(g.joueurs.p0.salle, 's5', 'une salle à la fois');
  assert.equal(new Set(Array.from({ length: 11 }, (_, n) => code(ctx, g, n))).size, 11, 'codes différents');
});

test('interrogatoire : même salle, salle où l\'on est ; la personne choisit la carte ; personne d\'autre ne la voit', () => {
  const { g, ctx, avance } = setup();
  E.adminAction(ctx, g, { type: 'lancer' });
  // p1 a au moins une carte : on construit une question qui la contient
  const C = g.joueurs.p1;
  const carte = C.main[0];
  const t = g.cartes[carte].type;
  // on place les deux joueurs dans une salle ; si la carte est une salle, ce sera elle
  const s = t === 'salle' ? Number(carte.slice(1)) : 3;
  entrer(ctx, g, 'p0', s);
  const perso = t === 'perso' ? carte : 'p0', arme = t === 'arme' ? carte : 'a0';
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: 'p1', perso, arme }).ok, false, 'pas dans la même salle');
  entrer(ctx, g, 'p1', s);
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: 'p1', perso, arme }).ok, true);
  const v = E.playerView(ctx, g, 'p1');
  assert.equal(v.aRepondre.length, 1);
  assert.ok(v.aRepondre[0].choix.some(c => c.id === carte));
  const autre = Object.keys(g.cartes).find(c => !v.aRepondre[0].choix.some(x => x.id === c));
  assert.equal(E.playerAction(ctx, g, 'p1', { type: 'montrer', q: v.aRepondre[0].id, carte: autre }).ok, false, 'seulement une carte demandée');
  assert.equal(E.playerAction(ctx, g, 'p1', { type: 'montrer', q: v.aRepondre[0].id, carte }).ok, true);
  const moi = E.playerView(ctx, g, 'p0');
  assert.equal(moi.mesQuestions[0].carte.id, carte);
  assert.ok(g.joueurs.p0.vus[carte].includes('p1'), 'retenue : les indices ne la redonneront pas');
  const ecran = JSON.stringify(E.screenView(ctx, g));
  assert.ok(ecran.includes('une carte montrée') && !ecran.includes(g.cartes[carte].nom + '»'), 'l\'écran ne dit pas laquelle');
  // pas deux fois de suite la même personne ; délai entre deux questions
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: 'p1', perso, arme }).ok, false);
  entrer(ctx, g, 'p2', s);
  assert.match(E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: 'p2', perso, arme }).msg, /Attends/);
  avance(30e3);
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: 'p2', perso, arme }).ok, true);
});

test('sans réponse à temps, une carte au hasard ; sans carte en commun, « aucune » tout de suite', () => {
  const { g, ctx, avance } = setup();
  E.adminAction(ctx, g, { type: 'lancer' });
  entrer(ctx, g, 'p0', 0); entrer(ctx, g, 'p1', 0);
  // une question dont p1 n'a aucune carte
  const sans = ['s0', ...Object.keys(g.cartes)].filter(c => !g.joueurs.p1.main.includes(c));
  const perso = sans.find(c => c.startsWith('p')), arme = sans.find(c => c.startsWith('a'));
  if (!g.joueurs.p1.main.includes('s0')) {
    E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: 'p1', perso, arme });
    assert.equal(g.questions.at(-1).etat, 'repondue');
    assert.equal(g.questions.at(-1).carte, null);
  }
  avance(31e3);
  entrer(ctx, g, 'p2', 0);
  const c = g.joueurs.p2.main.find(x => x.startsWith('p') || x.startsWith('a') || x === 's0');
  const q = { perso: c.startsWith('p') ? c : perso, arme: c.startsWith('a') ? c : arme };
  E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: 'p2', ...q });
  const derniere = g.questions.at(-1);
  if (derniere.etat === 'attente') {
    avance(61e3);
    assert.equal(derniere.etat, 'repondue');
    assert.ok(g.joueurs.p2.main.includes(derniere.carte));
  }
});

test('indices : un par salle (deux en phase finale, avec deux cartes), écrits ou automatiques, tous consultables', () => {
  const { g, ctx } = setup(12, c => { c.indices[0] = 'Le majordome a vu quelque chose près de « {arme} ».\nDeuxième indice : {salle}'; c.modeles = "Un souvenir revient : « {carte} » n'a rien à voir avec le crime."; return c; });
  E.adminAction(ctx, g, { type: 'lancer' });
  entrer(ctx, g, 'p0', 0);
  const r = E.playerAction(ctx, g, 'p0', { type: 'indice' });
  assert.equal(r.ok, true);
  assert.match(r.indice, /^Le majordome a vu quelque chose près de « .+ »\.$/);
  const elim = g.joueurs.p0.elimines;
  assert.equal(elim.length, 1);
  assert.equal(g.cartes[elim[0]].type, 'arme');
  assert.ok(!Object.values(g.solution).includes(elim[0]), 'jamais la solution');
  assert.equal(E.playerView(ctx, g, 'p0').notes[0].salle, g.cartes.s0.nom, 'indice consultable, avec sa salle');
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'indice' }).ok, false, 'un seul par salle');
  // autre salle : le modèle automatique
  entrer(ctx, g, 'p0', 4);
  assert.match(E.playerAction(ctx, g, 'p0', { type: 'indice' }).indice, /n'a rien à voir avec le crime/);
  // phase finale : un deuxième indice dans la salle, avec deux cartes
  E.adminAction(ctx, g, { type: 'finale' });
  entrer(ctx, g, 'p0', 0);
  const f = E.playerAction(ctx, g, 'p0', { type: 'indice' });
  assert.equal(f.ok, true);
  assert.match(f.indice, /^Deuxième indice : .+ » et « .+$/);
  assert.equal(g.joueurs.p0.indices, 3);
});

test('indice à recouper : 3 cartes du même type, au plus une de la solution, rien de barré', () => {
  let avecSolution = 0;
  for (let k = 0; k < 60; k++) {
    const { g, ctx } = setup(12, c => { c.indices[0] = 'Au moins 2 de ces 3 salles ne sont pas le lieu du crime : {3salle}.'; return c; });
    E.adminAction(ctx, g, { type: 'lancer' });
    entrer(ctx, g, 'p0', 0);
    const r = E.playerAction(ctx, g, 'p0', { type: 'indice' });
    const noms = r.indice.match(/crime : (.+)\.$/)[1].split(/, | et /);
    const salles = Object.values(g.cartes).filter(c => c.type === 'salle');
    assert.equal(new Set(noms).size, 3, r.indice);
    assert.ok(noms.every(n => salles.some(c => c.nom === n)), 'que des salles');
    const sol = noms.filter(n => n === g.cartes[g.solution.salle].nom).length;
    assert.ok(sol <= 1);
    avecSolution += sol;
    assert.deepEqual(g.joueurs.p0.elimines, [], 'rien de barré');
    assert.equal(g.joueurs.p0.indices, 1);
  }
  assert.ok(avecSolution > 5 && avecSolution < 55, 'la solution apparaît parfois');
});

test('accusation : une seule ; fausse = plus d\'accusation ; juste = gagne seul, classement par indices', () => {
  const { g, ctx } = setup();
  E.adminAction(ctx, g, { type: 'lancer' });
  const faux = { salle: g.solution.salle, perso: g.solution.perso, arme: Object.keys(g.cartes).find(c => c.startsWith('a') && c !== g.solution.arme) };
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'accuser', ...faux }).ok, false);
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'accuser', ...g.solution }).ok, false, 'déjà accusé');
  g.joueurs.p3.indices = 5; g.joueurs.p4.indices = 2;
  assert.equal(E.playerAction(ctx, g, 'p1', { type: 'accuser', ...g.solution }).ok, true);
  assert.equal(g.finished, true);
  const res = E.results(ctx, g);
  assert.deepEqual(res.slice(0, 3).map(r => r.pid), ['p1', 'p3', 'p4']);
  assert.equal(res[0].won, true);
});

test('temps : phase finale au bout du temps réglé, révélation à la fin', () => {
  const { g, ctx, avance } = setup(12, c => ({ ...c, dureeMax: 600, finaleApres: 300 }));
  E.adminAction(ctx, g, { type: 'lancer' });
  avance(299e3);
  assert.equal(g.phase, 'enquete');
  avance(2e3);
  assert.equal(g.phase, 'finale');
  avance(300e3);
  assert.equal(g.finished, true);
  assert.equal(g.winner, null);
  assert.ok(E.screenView(ctx, g).revelation.salle.nom);
});

test('personnages tirés au hasard parmi ceux de l\'admin ; l\'admin échange pendant l\'introduction', () => {
  const vus = new Set();
  for (let k = 0; k < 30; k++) {
    const { g } = setup(3, c => { c.personnages = 'Le Majordome\nLa Comtesse\nLéa = Le Docteur\nLe Colonel\nLa Veuve'; return c; });
    const noms = Object.values(g.joueurs).map(J => g.cartes[J.perso].nom);
    assert.equal(new Set(noms).size, 3);
    assert.ok(noms.every(n => ['Le Majordome', 'La Comtesse', 'Le Docteur', 'Le Colonel', 'La Veuve'].includes(n)));
    vus.add(g.cartes[g.joueurs.p0.perso].nom);
  }
  assert.ok(vus.size >= 3, 'au hasard');
  const { g, ctx } = setup(4);
  const autre = g.joueurs.p1.perso;
  assert.equal(E.adminAction(ctx, g, { type: 'personnage', pid: 'p0', perso: autre }).ok, true);
  assert.equal(g.joueurs.p0.perso, autre);
  E.adminAction(ctx, g, { type: 'lancer' });
  assert.equal(E.adminAction(ctx, g, { type: 'personnage', pid: 'p1', perso: autre }).ok, false, 'plus après l\'introduction');
});

test('fiche de détective : sur papier par défaut ; sur le téléphone si l\'admin l\'active (remplie toute seule, barrable)', () => {
  const { g, ctx } = setup(6);
  E.adminAction(ctx, g, { type: 'lancer' });
  assert.equal(E.playerView(ctx, g, 'p0').fiche, null);
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'cocher', carte: 's3' }).ok, false);
  ctx.cfg.ficheNumerique = true;
  const v = E.playerView(ctx, g, 'p0');
  assert.equal(v.fiche[v.main[0].id].statut, 'main');
  const autre = Object.keys(g.cartes).find(c => !v.fiche[c].statut);
  assert.equal(E.playerAction(ctx, g, 'p0', { type: 'cocher', carte: autre }).ok, true);
  assert.equal(E.playerView(ctx, g, 'p0').fiche[autre].statut, 'coche');
});

test('rattrapage : un joueur ajouté en cours reçoit un personnage libre et 3 cartes', () => {
  const { g, ctx } = setup(12);
  assert.equal(E.ajouterJoueur(ctx, g, 'tard').ok, true);
  assert.equal(new Set(Object.values(g.joueurs).map(J => g.cartes[J.perso].nom)).size, 13, 'pas déjà pris');
  assert.equal(g.joueurs.tard.main.length, 3);
  assert.equal(g.cartes[g.joueurs.tard.perso].type, 'perso');
  assert.ok(!g.joueurs.tard.main.some(c => Object.values(g.solution).includes(c)));
});

void createHmac;
