// L'Enquête : cartes, salles (QR code), interrogatoires, indices, accusations, fin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as E from '../server/games/enquete.js';

function setup(n = 12, tweak = c => c) {
  let t = 1_800_000_000_000;
  const cfg = tweak({ ...E.defaultConfig(), taches: false, panne: false });
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] ?? '?', sfx: () => {} };
  const g = E.start(ctx, pids);
  return { g, ctx, cfg, pids, avance: ms => { t += ms; return E.tick(ctx, g); }, now: () => t };
}
// code de la salle du moment, comme sur la tablette
const code = (ctx, g, n) => E.salleView(ctx, g, n).code;
// Les indices qu'une salle porte (1er, 2e, 3e indice), une fois la partie créée : les pools sont répartis au hasard entre les salles au lancement.
const ecrire = (g, n, ...textes) => { g.indicesSalle[n] = [0, 1, 2].map(k => textes[k] ?? null); return g; };
// Passe par k autres salles puis revient dans la salle n (nécessaire entre deux indices d'une même salle).
const detour = (ctx, g, p, n, k = 1) => { const autres = [0, 1, 2, 3].filter(x => x !== n).slice(0, k); autres.forEach(x => E.adminAction(ctx, g, { type: 'placer', pid: p, salle: `s${x}` })); E.adminAction(ctx, g, { type: 'placer', pid: p, salle: `s${n}` }); };
const entrer = (ctx, g, p, n) => { ctx.cfg.delaiQuitter = 0; E.playerAction(ctx, g, p, { type: 'quitter' }); return E.playerAction(ctx, g, p, { type: 'entrer', salle: n, code: code(ctx, g, n) }); };

test('cartes : 11 salles, autant de personnages que de joueurs, 10 armes ; solution hors des mains ; 3 cartes chacun, 2 joueurs au plus par carte', () => {
  for (const n of [12, 14]) {
    const { g } = setup(n);
    const types = t => Object.values(g.cartes).filter(c => c.type === t).length;
    assert.deepEqual([types('salle'), types('perso'), types('arme')], [11, n, 10]);
    const sol = Object.values(g.solution);
    const compte = {};
    for (const J of Object.values(g.joueurs)) {
      assert.equal(J.main.length, 3);
      assert.equal(new Set(J.main).size, 3, 'jamais deux fois la même carte');
      for (const c of J.main) { assert.ok(!sol.includes(c), 'la solution n\'est chez personne'); compte[c] = (compte[c] || 0) + 1; }
    }
    assert.ok(Object.values(compte).every(x => x <= 2), 'deux joueurs au plus par carte');
    const distribuees = 11 + n + 10 - 3;
    assert.equal(Object.keys(compte).length, distribuees, 'toutes les cartes hors solution sont distribuées');
    assert.equal(Object.values(compte).filter(x => x === 2).length, 3 * n - distribuees, `${n} joueurs : ${3 * n - distribuees} doublons`);
    assert.equal(new Set(Object.values(g.joueurs).map(J => J.perso)).size, n, 'un personnage par joueur');
  }
});

test('solution fixée dans l\'admin ; le tueur est le joueur de ce personnage', () => {
  const { g, ctx } = setup(12, c => ({ ...c, solution: { salle: 'Grenier', perso: 'Comptesse Ivoire', arme: 'Poison' } }));
  assert.deepEqual([g.cartes[g.solution.salle].nom, g.cartes[g.solution.perso].nom, g.cartes[g.solution.arme].nom], ['Grenier', 'Comptesse Ivoire', 'Poison']);
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
  // un joueur qui a une carte qu'on peut demander dans cette salle (personnage, arme ou la salle s0)
  const utile = x => x.startsWith('p') || x.startsWith('a') || x === 's0';
  const p2 = ['p2', 'p3', 'p4', 'p5'].find(x => g.joueurs[x].main.some(utile));
  entrer(ctx, g, p2, 0);
  const c = g.joueurs[p2].main.find(utile);
  const q = { perso: c.startsWith('p') ? c : perso, arme: c.startsWith('a') ? c : arme };
  E.playerAction(ctx, g, 'p0', { type: 'interroger', cible: p2, ...q });
  const derniere = g.questions.at(-1);
  if (derniere.etat === 'attente') {
    avance(61e3);
    assert.equal(derniere.etat, 'repondue');
    assert.ok(g.joueurs[p2].main.includes(derniere.carte));
  }
});

test('indices : un par salle (deux en phase finale, avec deux cartes), écrits ou automatiques, tous consultables', () => {
  const { g, ctx } = setup(12, c => { c.sallesPropres = 0; c.sallesPropres = 0; c.modeles = "Un souvenir revient : « {carte} » n'a rien à voir avec le crime."; return c; });
  E.adminAction(ctx, g, { type: 'lancer' });
  ecrire(g, 0, 'Un témoin a vu quelque chose près de « {arme} ».', 'Deuxième indice : {salle}');
  const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso); // pas le tueur : ses indices sont plus précis
  entrer(ctx, g, P, 0);
  const r = E.playerAction(ctx, g, P, { type: 'indice' });
  assert.equal(r.ok, true);
  assert.match(r.indice, /^Un témoin a vu quelque chose près de « .+ »\.$/);
  const elim = g.joueurs[P].elimines;
  assert.equal(elim.length, 1);
  assert.equal(g.cartes[elim[0]].type, 'arme');
  assert.ok(!Object.values(g.solution).includes(elim[0]), 'jamais la solution');
  assert.equal(E.playerView(ctx, g, P).notes[0].salle, g.cartes.s0.nom, 'indice consultable, avec sa salle');
  assert.equal(E.playerAction(ctx, g, P, { type: 'indice' }).ok, false, 'un seul par salle');
  // autre salle : le modèle automatique
  entrer(ctx, g, P, 4);
  assert.match(E.playerAction(ctx, g, P, { type: 'indice' }).indice, /n'a rien à voir avec le crime|Au moins 2 de ces 3/);
  // phase finale : un deuxième indice dans la salle, avec deux cartes
  E.adminAction(ctx, g, { type: 'finale' });
  entrer(ctx, g, P, 0);
  const f = E.playerAction(ctx, g, P, { type: 'indice' });
  assert.equal(f.ok, true);
  assert.match(f.indice, /^Deuxième indice : .+ » et « .+$/);
  assert.equal(g.joueurs[P].indices, 3);
});

test('indice à recouper : 3 cartes du même type, au plus une de la solution, rien de barré', () => {
  let avecSolution = 0;
  for (let k = 0; k < 60; k++) {
    const { g, ctx } = setup(12, c => { c.sallesPropres = 0; return c; });
    E.adminAction(ctx, g, { type: 'lancer' });
    ecrire(g, 0, 'Au moins 2 de ces 3 salles ne sont pas le lieu du crime : {3salle}.');
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
  // (le tueur, lui, a une seconde chance et ne gagne pas en s'accusant : voir tueur.test.js)
  const [a, b2, c, d] = Object.keys(g.joueurs).filter(p => g.joueurs[p].perso !== g.solution.perso);
  const faux = { salle: g.solution.salle, perso: g.solution.perso, arme: Object.keys(g.cartes).find(x => x.startsWith('a') && x !== g.solution.arme) };
  assert.equal(E.playerAction(ctx, g, a, { type: 'accuser', ...faux }).ok, false);
  assert.equal(E.playerAction(ctx, g, a, { type: 'accuser', ...g.solution }).ok, false, 'déjà accusé');
  g.joueurs[c].indices = 5; g.joueurs[d].indices = 2;
  assert.equal(E.playerAction(ctx, g, b2, { type: 'accuser', ...g.solution }).ok, true);
  assert.equal(g.finished, true);
  const res = E.results(ctx, g);
  assert.deepEqual(res.slice(0, 3).map(r => r.pid), [b2, c, d]);
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

test('3 indices par salle : un par rang, jamais deux fois le même, jamais une carte déjà connue', () => {
  const { g, ctx } = setup(6, c => { c.sallesPropres = 0; return c; });
  E.adminAction(ctx, g, { type: 'lancer' });
  ecrire(g, 0, 'Indice A', 'Indice B', 'Indice C');
  const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso);
  entrer(ctx, g, P, 0);
  assert.equal(E.playerAction(ctx, g, P, { type: 'indice' }).indice, 'Indice A', '1er indice');
  detour(ctx, g, P, 0, 1);
  assert.equal(E.playerAction(ctx, g, P, { type: 'indice' }).indice, 'Indice B', '2e indice');
  detour(ctx, g, P, 0, 2);
  assert.equal(E.playerAction(ctx, g, P, { type: 'indice' }).indice, 'Indice C', '3e indice');
  // le même texte dans deux rangs : un joueur ne le reçoit pas deux fois
  const { g: g2, ctx: c2 } = setup(6, c => { c.sallesPropres = 0; return c; });
  E.adminAction(c2, g2, { type: 'lancer' });
  ecrire(g2, 0, 'Indice A', 'Indice A', 'Indice B');
  const Q = Object.keys(g2.joueurs).find(x => g2.joueurs[x].perso !== g2.solution.perso);
  entrer(c2, g2, Q, 0);
  const a = E.playerAction(c2, g2, Q, { type: 'indice' }).indice;
  detour(c2, g2, Q, 0, 1);
  const b2 = E.playerAction(c2, g2, Q, { type: 'indice' }).indice;
  assert.equal(a, 'Indice A');
  assert.notEqual(b2, 'Indice A', 'pas deux fois le même texte');
  // un indice qui cite une carte déjà dans la main du joueur ne lui est pas donné
  const { g: g3, ctx: c3 } = setup(6, c => { c.sallesPropres = 0; return c; });
  E.adminAction(c3, g3, { type: 'lancer' });
  const R = Object.keys(g3.joueurs).find(x => g3.joueurs[x].perso !== g3.solution.perso);
  const carte = g3.joueurs[R].main[0];
  ecrire(g3, 0, `Un souvenir revient : « ${g3.cartes[carte].nom} » n'a rien à voir.`);
  g3.auto[0] = [{ texte: 'Autre fait sûr.', elim: [] }, { texte: 'Deuxième.', elim: [] }, { texte: 'Troisième.', elim: [] }];
  entrer(c3, g3, R, 0);
  assert.equal(E.playerAction(c3, g3, R, { type: 'indice' }).indice, 'Autre fait sûr.', 'à la place : un fait vrai');
});

test('salles « trop propres » : N salles (réglable), jamais la salle du crime ; l\'indice général n\'est jamais le 1er, il élimine la salle', () => {
  const { g, ctx } = setup(6, c => { c.sallesPropres = 3; c.rangPropre = '2'; return c; });
  assert.equal(g.propres.length, 3);
  assert.ok(!g.propres.includes(g.solution.salle));
  assert.ok(g.propres.every(s => g.proprePos[s] === 1), 'rang réglé : 2e indice');
  E.adminAction(ctx, g, { type: 'lancer' });
  const s = g.propres[0], n = Number(s.slice(1));
  ecrire(g, n, 'Un premier indice neutre.', null, 'Un troisième indice neutre.'); // sinon un fait tiré au hasard pourrait déjà éliminer cette salle
  const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso && !g.joueurs[x].main.includes(s));
  entrer(ctx, g, P, n);
  const r1 = E.playerAction(ctx, g, P, { type: 'indice' });
  assert.doesNotMatch(r1.indice, /trop propre/, 'jamais le 1er indice');
  detour(ctx, g, P, n, 1);
  const r2 = E.playerAction(ctx, g, P, { type: 'indice' });
  assert.match(r2.indice, /trop propre/, 'le 2e indice');
  assert.ok(g.joueurs[P].elimines.includes(s));
  detour(ctx, g, P, n, 2);
  assert.doesNotMatch(E.playerAction(ctx, g, P, { type: 'indice' }).indice, /trop propre/, 'une seule fois');
  // 'hasard' : 2e ou 3e, jamais le 1er
  const h = setup(6, c => { c.sallesPropres = 5; c.rangPropre = 'hasard'; return c; }).g;
  assert.ok(h.propres.every(x => [1, 2].includes(h.proprePos[x])));
  // un joueur qui a déjà cette salle dans ses cartes reçoit un indice normal
  const Q = Object.keys(g.joueurs).find(x => g.joueurs[x].main.includes(s) && g.joueurs[x].perso !== g.solution.perso);
  if (Q) { entrer(ctx, g, Q, n); detour(ctx, g, Q, n, 1); E.playerAction(ctx, g, Q, { type: 'indice' }); detour(ctx, g, Q, n, 1); assert.doesNotMatch(E.playerAction(ctx, g, Q, { type: 'indice' }).indice, /trop propre/); }
  // réglable : 0 salle propre
  assert.equal(setup(6, c => { c.sallesPropres = 0; return c; }).g.propres.length, 0);
});

test('3 pools d\'indices communs : répartis au hasard entre les salles, sans doublon, selon leurs chances', () => {
  const salles = 11, pool = n => Array.from({ length: n }, (_, i) => `Indice ${n}-${i}`).join('\n');
  // un pool de 11 indices : chaque salle en reçoit un, tous différents, dans un ordre qui change
  const ordres = new Set();
  for (let k = 0; k < 30; k++) {
    const { g } = setup(6, c => { c.sallesPropres = 0; c.poolsIndices = [pool(11), pool(12), '']; return c; });
    const p1 = g.indicesSalle.map(x => x[0]), p2 = g.indicesSalle.map(x => x[1]);
    assert.equal(new Set(p1).size, salles, 'aucun doublon dans le pool 1');
    assert.ok(p1.every(Boolean) && p2.every(Boolean));
    assert.ok(g.indicesSalle.every(x => x[2] === null), 'pool 3 vide');
    ordres.add(p1.join('|'));
  }
  assert.ok(ordres.size > 20, 'les indices ne sont pas toujours dans les mêmes salles');
  // pool trop petit : les autres salles donnent un fait vrai tiré de la solution
  const { g, ctx } = setup(6, c => { c.sallesPropres = 0; c.poolsIndices = ['Seul indice', '', '']; return c; });
  E.adminAction(ctx, g, { type: 'lancer' });
  assert.equal(g.indicesSalle.filter(x => x[0] === 'Seul indice').length, 1);
  const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso);
  const sans = g.indicesSalle.findIndex(x => x[0] === null);
  entrer(ctx, g, P, sans);
  const t = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
  assert.ok(t && t !== 'Seul indice' && t.length > 10, t);
  // chances : « RARE | 1 » est rarement tiré quand le pool a plus d'indices que de salles
  let rare = 0, commun = 0;
  const lignes = ['RARE | 1', ...Array.from({ length: 11 }, (_, i) => `COMMUN ${i} | 100`)].join('\n');
  for (let k = 0; k < 200; k++) {
    const { g: h } = setup(6, c => { c.sallesPropres = 0; c.poolsIndices = [lignes, '', '']; return c; });
    if (h.indicesSalle.some(x => x[0] === 'RARE')) rare++;
    if (h.indicesSalle.some(x => x[0] === 'COMMUN 0')) commun++;
  }
  assert.ok(rare < 60 && commun > 150, `RARE ${rare}/200, COMMUN 0 ${commun}/200`);
  assert.deepEqual(E.lirePool('A | 30\n\nB\nC | 0\nD | x'), [{ texte: 'A', poids: 30 }, { texte: 'B', poids: 20 }, { texte: 'C', poids: 0 }, { texte: 'D | x', poids: 20 }]);
});

test('indice « {joueur} est peut-être {3perso} » : le nom d\'un autre joueur et 3 personnages dont son vrai personnage', () => {
  const { g, ctx } = setup(6, c => { c.sallesPropres = 0; return c; });
  ctx.name = p => 'Joueur-' + p;
  E.adminAction(ctx, g, { type: 'lancer' });
  ecrire(g, 0, '{joueur} est peut-être {3perso}.');
  const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso);
  entrer(ctx, g, P, 0);
  const t = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
  const m = t.match(/^Joueur-(\w+) est peut-être (.+) ou (.+) ou (.+)\.$/) || t.match(/^Joueur-(\w+) est peut-être (.+), (.+) ou (.+)\.$/);
  assert.ok(m, t);
  assert.notEqual(m[1], P, 'jamais le joueur lui-même');
  const vrai = g.cartes[g.joueurs[m[1]].perso].nom;
  assert.ok([m[2], m[3], m[4]].includes(vrai), `${t} (vrai : ${vrai})`);
});

test('{joueur} : jamais deux fois le même nom pour un joueur, noms répartis dans la partie, jamais son propre nom', () => {
  const { g, ctx } = setup(6, c => { c.sallesPropres = 0; return c; });
  ctx.name = p => 'Joueur-' + p;
  E.adminAction(ctx, g, { type: 'lancer' });
  for (let n = 0; n < 4; n++) ecrire(g, n, '{joueur} est peut-être {3perso}.');
  const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso);
  const noms = [];
  for (let n = 0; n < 4; n++) {
    E.adminAction(ctx, g, { type: 'placer', pid: P, salle: `s${n}` });
    const t = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
    noms.push(t.match(/^Joueur-(\w+)/)[1]);
  }
  assert.equal(new Set(noms).size, 4, noms.join(','));
  assert.ok(!noms.includes(P));
  // 6 joueurs : 5 autres noms au plus pour lui ; le 6e indice n'a plus de nom à donner
  const Q = Object.keys(g.joueurs).find(x => x !== P && g.joueurs[x].perso !== g.solution.perso);
  const vus = new Set();
  for (let n = 0; n < 4; n++) { E.adminAction(ctx, g, { type: 'placer', pid: Q, salle: `s${n}` }); vus.add(E.playerAction(ctx, g, Q, { type: 'indice' }).indice.match(/^Joueur-(\w+)/)?.[1]); }
  assert.ok(g.nommes && Object.values(g.nommes).every(v => v <= 2), 'les noms sont répartis entre les joueurs : ' + JSON.stringify(g.nommes));
});

test('simulateur d\'indices : 3 indices par salle, textes écrits repris, repères remplacés', () => {
  const cfg = E.defaultConfig();
  cfg.sallesPropres = 0;
  cfg.poolsIndices = [Array.from({ length: 11 }, (_, i) => `Indice ${i}`).join('\n'), Array.from({ length: 11 }, () => '{joueur} est peut-être {3perso}.').join('\n'), ''];
  const r = E.simulerIndices(cfg, 8);
  assert.equal(r.salles.length, 11);
  assert.ok(r.salles.every(s => s.indices.length === 3), 'trois indices par salle');
  for (const sl of r.salles) {
    const [a, b, c] = sl.indices;
    assert.ok(/^Indice \d+$/.test(a.texte) && a.source === 'écrit', 'pool 1 : ' + a.texte);
    assert.match(b.texte, /^\S+ est peut-être .+ ou .+/);
    assert.ok(['auto', 'secours'].includes(c.source), 'pool 3 vide : fait tiré de la solution (ou indice de secours)');
  }
  assert.equal(new Set(r.salles.map(sl => sl.indices[0].texte)).size, 11, 'les 11 indices du pool 1 sont dans 11 salles différentes');
  assert.ok(r.salles.flatMap(s => s.indices).every(i => !i.texte.includes('{')), 'aucun repère laissé tel quel');
  assert.ok(r.complices.bureau && r.complices.jeu && r.complices.grenier);
});

test('un joueur qui fait le 1er indice des 11 salles reçoit les 11 indices du pool 1, une fois chacun', () => {
  for (let k = 0; k < 20; k++) {
    const { g, ctx } = setup(6, c => { c.sallesPropres = 2; c.poolsIndices = [Array.from({ length: 11 }, (_, i) => `Premier indice numéro ${i}`).join('\n'), '', '']; return c; });
    E.adminAction(ctx, g, { type: 'lancer' });
    const P = Object.keys(g.joueurs)[0];
    const recus = [];
    for (let n = 0; n < 11; n++) { E.adminAction(ctx, g, { type: 'placer', pid: P, salle: `s${n}` }); recus.push(E.playerAction(ctx, g, P, { type: 'indice' }).indice); }
    assert.equal(new Set(recus).size, 11, recus.join(' / '));
    assert.ok(recus.every(t => /^Premier indice numéro \d+$/.test(t)), 'même dans une salle trop propre, le 1er indice vient du pool 1');
  }
});

test('sexe des personnages : « {joueur} {sexe} » dit si le personnage du joueur est une femme (réglable, jamais envoyé aux téléphones)', () => {
  // personnages réglés : tous des femmes sauf « Bob » ; marques explicites
  const noms = ['Alice | F', 'Berthe | F', 'Claire | F', 'Diane | F', 'Eve | F', 'Fanny | F', 'Bob | H'];
  assert.deepEqual(E.femmesDe(noms.join('\n')), { alice: true, berthe: true, claire: true, diane: true, eve: true, fanny: true, bob: false });
  assert.equal(E.femmesDe('Veuve Pervenche\nColonel Moutarde')['veuve pervenche'], true, 'sans marque : ceux d\'origine');
  assert.equal(E.femmesDe('Veuve Pervenche | H')['veuve pervenche'], false, 'une marque explicite l\'emporte');
  assert.deepEqual(E.personnagesDe('Léa = Le Docteur | F\nAlice | H\nBob'), ['Le Docteur', 'Alice', 'Bob']);
  const { g, ctx } = setup(6, c => { c.sallesPropres = 0; c.personnages = noms.join('\n'); return c; });
  ctx.name = p => 'Joueur-' + p;
  E.adminAction(ctx, g, { type: 'lancer' });
  ecrire(g, 0, '{joueur} {sexe}.');
  const P = Object.keys(g.joueurs)[0];
  entrer(ctx, g, P, 0);
  const t = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
  const m = t.match(/^Joueur-(\w+) (est une femme|n'est pas une femme)\.$/);
  assert.ok(m, t);
  const nomPerso = g.cartes[g.joueurs[m[1]].perso].nom;
  assert.equal(m[2] === 'est une femme', nomPerso !== 'Bob', `${nomPerso} : ${t}`);
  assert.ok(!/"femmes?":/.test(JSON.stringify(E.playerView(ctx, g, P))), 'le sexe n\'est pas dans la vue du joueur (hors indices)');
  assert.ok(!/"femmes?":/.test(JSON.stringify(E.screenView(ctx, g))));
});

test('négations : « {joueur} n\'est {nonperso} » désigne des personnages que ce joueur n\'incarne pas', () => {
  for (let k = 0; k < 40; k++) {
    const { g, ctx } = setup(8, c => { c.sallesPropres = 0; return c; });
    ctx.name = p => 'Joueur-' + p;
    E.adminAction(ctx, g, { type: 'lancer' });
    ecrire(g, 0, '{joueur} n\'est {nonperso}.', '{joueur} n\'est {2nonperso}.', '{joueur} n\'est {3nonperso}.');
    const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso);
    entrer(ctx, g, P, 0);
    const t1 = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
    detour(ctx, g, P, 0, 1);
    const t2 = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
    detour(ctx, g, P, 0, 2);
    const t3 = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
    const noms = (t, re) => { const m = t.match(re); assert.ok(m, t); return m; };
    const m1 = noms(t1, /^Joueur-(\w+) n'est pas (.+)\.$/);
    const m2 = noms(t2, /^Joueur-(\w+) n'est ni (.+) ni (.+)\.$/);
    const m3 = noms(t3, /^Joueur-(\w+) n'est ni (.+), ni (.+), ni (.+)\.$/);
    for (const [m, n] of [[m1, 1], [m2, 2], [m3, 3]]) {
      const vrai = g.cartes[g.joueurs[m[1]].perso].nom, mien = g.cartes[g.joueurs[P].perso].nom;
      assert.ok(!m.slice(2).includes(vrai), `${m[0]} : son vrai personnage est ${vrai}`);
      assert.ok(!m.slice(2).includes(mien), 'jamais le personnage du lecteur');
      assert.equal(new Set(m.slice(2)).size, n);
    }
  }
});

test('« Il est impossible que {5nonpersos} aient été là : {joueur} n\'est aucun d\'eux » : 5 innocents que ce joueur n\'incarne pas', () => {
  for (let k = 0; k < 40; k++) {
    const { g, ctx } = setup(10, c => { c.sallesPropres = 0; return c; });
    ctx.name = p => 'Joueur-' + p;
    E.adminAction(ctx, g, { type: 'lancer' });
    ecrire(g, 0, 'Il est impossible que {5nonpersos} aient été là : {joueur} n\'est aucun d\'eux.');
    const P = Object.keys(g.joueurs).find(x => g.joueurs[x].perso !== g.solution.perso);
    entrer(ctx, g, P, 0);
    const t = E.playerAction(ctx, g, P, { type: 'indice' }).indice;
    const m = t.match(/^Il est impossible que (.+) aient été là : Joueur-(\w+) n'est aucun d'eux\.$/);
    assert.ok(m, t);
    const liste = m[1].split(/, | et /);
    assert.equal(liste.length, 5, t);
    assert.equal(new Set(liste).size, 5);
    assert.ok(!liste.includes(g.cartes[g.joueurs[m[2]].perso].nom), 'pas le personnage de ce joueur');
    assert.ok(!liste.includes(g.cartes[g.solution.perso].nom), 'jamais le coupable');
    assert.ok(!liste.includes(g.cartes[g.joueurs[P].perso].nom), 'pas le personnage du lecteur');
  }
});
