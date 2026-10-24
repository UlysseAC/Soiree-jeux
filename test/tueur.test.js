// L'Enquête — le tueur (indices précis, auto-accusation, arme cachée, meurtres), les corps, « Quitter la salle ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/games/enquete.js';

function setup(n = 6, arme = 'Poignard') {
  let t = 1_800_000_000_000;
  const cfg = { ...E.defaultConfig(), taches: false, panne: false };
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] ?? '?', sfx: () => {} };
  const g = E.start(ctx, pids);
  E.adminAction(ctx, g, { type: 'lancer' });
  g.solution.arme = Object.keys(g.cartes).find(c => g.cartes[c].nom === arme);
  const tueur = pids.find(p => g.joueurs[p].perso === g.solution.perso);
  return { g, ctx, pids, tueur, innocents: pids.filter(p => p !== tueur), avance: ms => { t += ms; return E.tick(ctx, g); } };
}
const placer = (ctx, g, salle, ...pids) => pids.forEach(pid => E.adminAction(ctx, g, { type: 'placer', pid, salle }));
const act = (ctx, g, p, a) => E.playerAction(ctx, g, p, a);
const code = (ctx, g, n) => E.salleView(ctx, g, n).code;
// Les indices qu'une salle porte (1er, 2e, 3e), une fois la partie créée.
const ecrire = (g, n, ...textes) => { g.indicesSalle[n] = [0, 1, 2].map(k => textes[k] ?? null); };

test('le tueur a des indices plus précis : deux cartes innocentées à chaque indice automatique', () => {
  const { g, ctx, tueur, innocents } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  placer(ctx, g, 's0', tueur, innocents[0]);
  act(ctx, g, tueur, { type: 'indice' });
  assert.equal(g.joueurs[tueur].elimines.length, 2);
  // un innocent reçoit un fait de la salle (au plus 1 carte éliminée)
  act(ctx, g, innocents[0], { type: 'indice' });
  assert.ok(g.joueurs[innocents[0]].elimines.length <= 1);
});

test('auto-accusation : seconde chance si seul le personnage est juste ; juste = tueur actif en secret', () => {
  const { g, ctx, tueur } = setup();
  const sol = g.solution, autreArme = Object.keys(g.cartes).find(c => g.cartes[c].type === 'arme' && c !== sol.arme);
  const r1 = act(ctx, g, tueur, { type: 'accuser', salle: sol.salle, perso: sol.perso, arme: autreArme });
  assert.equal(r1.ok, false);
  assert.match(r1.msg, /seconde chance/);
  assert.equal(g.joueurs[tueur].accuse, undefined ?? null);
  const avant = g.feed.length;
  const r2 = act(ctx, g, tueur, { type: 'accuser', ...sol });
  assert.equal(r2.tueur, true);
  assert.equal(g.finished, false, 'la partie continue');
  assert.equal(g.feed.length, avant, 'rien à l\'écran');
  const v = E.playerView(ctx, g, tueur).secret;
  assert.equal(v.armeRecup, false);
  assert.ok(v.cache);
});

test('tueur actif : arme récupérée en scannant la salle de la cachette, meurtre dans la même salle, recharge', () => {
  const { g, ctx, tueur, innocents, avance } = setup();
  act(ctx, g, tueur, { type: 'accuser', ...g.solution });
  const cache = g.joueurs[tueur].tueur.cache, n = Number(cache.slice(1));
  placer(ctx, g, cache, innocents[0], innocents[1]);
  g.joueurs[tueur].salle = null;
  assert.match(act(ctx, g, tueur, { type: 'tuer', cible: innocents[0] }).msg, /Scanne/);
  act(ctx, g, tueur, { type: 'entrer', salle: n, code: code(ctx, g, n) });
  assert.equal(g.joueurs[tueur].tueur.arme, true);
  g.joueurs[innocents[0]].indices = 4;
  assert.equal(E.playerView(ctx, g, tueur).presents.find(x => x.pid === innocents[0]).indices, 4, 'le tueur voit qui a beaucoup d\'indices');
  assert.equal(E.playerView(ctx, g, innocents[1]).presents[0].indices, undefined, 'les autres non');
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: innocents[0] }).ok, true);
  assert.ok(g.joueurs[innocents[0]].mort);
  assert.match(act(ctx, g, tueur, { type: 'tuer', cible: innocents[1] }).msg, /pas prête/);
  avance(20e3);
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: innocents[1] }).ok, true);
  // la victime ne joue plus ; son nom reste dans la salle
  assert.match(act(ctx, g, innocents[0], { type: 'indice' }).msg, /assassiné/);
  assert.ok(E.salleView(ctx, g, n).joueurs.some(j => j.name === ctx.name(innocents[0])), 'son nom reste affiché dans la salle');
});

test('corps : 1er scan = « corps trouvé » à l\'écran, 2e innocent = victime identifiée ; chacun récupère ses cartes', () => {
  const { g, ctx, tueur, innocents } = setup();
  act(ctx, g, tueur, { type: 'accuser', ...g.solution });
  g.joueurs[tueur].tueur.arme = true;
  placer(ctx, g, 's2', tueur, innocents[0]);
  act(ctx, g, tueur, { type: 'tuer', cible: innocents[0] });
  const m = E.playerView(ctx, g, innocents[0]).mort;
  assert.equal(act(ctx, g, innocents[1], { type: 'corps', victime: m.victime, c: 'faux' }).ok, false);
  const r = act(ctx, g, innocents[1], { type: 'corps', victime: m.victime, c: m.jeton });
  assert.ok(r.ok);
  assert.ok(g.joueurs[innocents[0]].main.every(c => g.joueurs[innocents[1]].vus[c]), 'cartes récupérées');
  assert.match(g.feed[0].text, /corps a été trouvé dans : /);
  act(ctx, g, tueur, { type: 'corps', victime: m.victime, c: m.jeton }); // le tueur fait semblant : ne compte pas
  assert.ok(!g.feed[0].text.includes('victime est'));
  act(ctx, g, innocents[2], { type: 'corps', victime: m.victime, c: m.jeton });
  assert.match(g.feed[0].text, new RegExp(`victime est ${ctx.name(innocents[0])} \\(`));
  assert.equal(act(ctx, g, innocents[2], { type: 'corps', victime: m.victime, c: m.jeton }).ok, false, 'une seule fois');
});

test('plus aucun innocent en vie : le tueur l\'emporte', () => {
  const { g, ctx, tueur, innocents } = setup(3);
  act(ctx, g, tueur, { type: 'accuser', ...g.solution });
  Object.assign(g.joueurs[tueur].tueur, { arme: true });
  placer(ctx, g, 's1', tueur, ...innocents);
  act(ctx, g, tueur, { type: 'tuer', cible: innocents[0] });
  g.joueurs[tueur].tueur.usage = null;
  act(ctx, g, tueur, { type: 'tuer', cible: innocents[1] });
  assert.equal(g.finished, true);
  assert.equal(g.winner, tueur);
});

test('« Quitter la salle » : chrono pendant lequel on reste dans la salle ; oublier = immobilisé', () => {
  const { g, ctx, innocents, avance } = setup();
  const p = innocents[0], q = innocents[1];
  act(ctx, g, p, { type: 'entrer', salle: 1, code: code(ctx, g, 1) });
  act(ctx, g, q, { type: 'entrer', salle: 1, code: code(ctx, g, 1) });
  assert.equal(ctx.cfg.delaiQuitter, 10);
  assert.equal(act(ctx, g, p, { type: 'quitter' }).ok, true);
  assert.equal(g.joueurs[p].salle, 's1', 'il reste dans la salle pendant le chrono');
  assert.ok(E.salleView(ctx, g, 1).joueurs.some(j => j.name === ctx.name(p)));
  assert.ok(E.playerView(ctx, g, p).quitteA > 0);
  assert.match(act(ctx, g, p, { type: 'entrer', salle: 2, code: code(ctx, g, 2) }).msg, /attends la fin du chrono/);
  avance(9000);
  assert.equal(g.joueurs[p].salle, 's1');
  avance(1500);
  assert.equal(g.joueurs[p].salle, null);
  assert.ok(!E.salleView(ctx, g, 1).joueurs.some(j => j.name === ctx.name(p)));
  // délai réglable (0 = tout de suite)
  ctx.cfg.delaiQuitter = 0;
  act(ctx, g, q, { type: 'quitter' });
  assert.equal(g.joueurs[q].salle, null);
  // scanner une autre salle sans avoir appuyé sur « Quitter » : immobilisé
  act(ctx, g, p, { type: 'entrer', salle: 2, code: code(ctx, g, 2) });
  const r = act(ctx, g, p, { type: 'entrer', salle: 3, code: code(ctx, g, 3) });
  assert.match(r.msg, /oublié de quitter/);
  assert.match(act(ctx, g, p, { type: 'indice' }).msg, /immobilisé/);
  avance(ctx.cfg.penaliteOubli * 1000);
  assert.equal(act(ctx, g, p, { type: 'indice' }).ok, true);
});

test('panne de courant : une salle chacun d\'abord (2 pour certaines), un code par joueur sur la tablette, tous le tapent pour commencer', () => {
  for (const n of [12, 14]) {
    let t = 1_800_000_000_000;
    const cfg = { ...E.defaultConfig(), taches: false };
    const names = {};
    const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
    const ctx = { now: () => t, cfg, name: p => names[p], sfx: () => {} };
    const g = E.start(ctx, pids);
    E.adminAction(ctx, g, { type: 'lancer' });
    assert.equal(g.phase, 'panne');
    const parSalle = {};
    for (const p of pids) (parSalle[g.panne.salles[p]] ??= []).push(p);
    assert.equal(Object.keys(parSalle).length, 11, 'chaque salle a au moins un occupant');
    assert.ok(Object.values(parSalle).every(x => x.length <= 4));
    assert.equal(new Set(Object.values(g.panne.codes)).size, n, 'un code par joueur');
    // la tablette montre les codes de sa salle, sans noms ; l'enquête n'a pas commencé
    const s0 = Object.keys(parSalle)[0], i0 = Number(s0.slice(1));
    const v = E.salleView(ctx, g, i0);
    assert.deepEqual(v.panne.codes, parSalle[s0].map(p => g.panne.codes[p]).sort());
    assert.equal(v.code, null);
    assert.ok(!JSON.stringify(v).includes('J0'));
    // le téléphone indique la salle (jamais le code) ; rien d'autre n'est possible
    const mv = E.playerView(ctx, g, 'p0');
    assert.equal(mv.panne.salle, g.cartes[g.panne.salles.p0].nom);
    assert.ok(!JSON.stringify(mv).includes(g.panne.codes.p0));
    assert.match(act(ctx, g, 'p0', { type: 'indice' }).msg, /plombs/);
    assert.match(act(ctx, g, 'p0', { type: 'panne', code: '0000' }).msg, /Mauvais code/);
    // chacun tape son code
    pids.forEach((p, k) => {
      const r = act(ctx, g, p, { type: 'panne', code: g.panne.codes[p] });
      assert.equal(r.ok, true);
      assert.equal(g.phase, k === n - 1 ? 'enquete' : 'panne');
    });
    assert.equal(act(ctx, g, 'p0', { type: 'panne', code: g.panne.codes.p0 }).ok, false);
    assert.ok(pids.every(p => g.joueurs[p].salle === g.panne.salles[p]), 'chacun est dans sa salle');
    assert.ok(g.endsAt > t, 'le chrono démarre à la réparation');
  }
});

test('panne : le code d\'un voisin de salle est refusé ; l\'admin peut forcer le début', () => {
  let t = 1_800_000_000_000;
  const cfg = { ...E.defaultConfig(), taches: false };
  const ctx = { now: () => t, cfg, name: p => p, sfx: () => {} };
  const pids = Array.from({ length: 14 }, (_, i) => 'p' + i);
  const g = E.start(ctx, pids);
  E.adminAction(ctx, g, { type: 'lancer' });
  const [a, b] = pids.filter(p => pids.some(q => q !== p && g.panne.salles[q] === g.panne.salles[p]));
  const voisin = pids.find(q => q !== a && g.panne.salles[q] === g.panne.salles[a]);
  assert.match(act(ctx, g, a, { type: 'panne', code: g.panne.codes[voisin] }).msg, /quelqu'un d'autre/);
  act(ctx, g, a, { type: 'panne', code: g.panne.codes[a] });
  assert.equal(g.phase, 'panne');
  assert.equal(E.adminAction(ctx, g, { type: 'commencer' }).ok, true);
  assert.equal(g.phase, 'enquete');
  assert.ok(pids.every(p => g.joueurs[p].salle === g.panne.salles[p]), 'les absents sont placés');
  void b;
});

// ---------- les armes du tueur ----------
const armer = (ctx, g, tueur) => { act(ctx, g, tueur, { type: 'accuser', ...g.solution }); g.joueurs[tueur].tueur.arme = true; };

test('poignard : au plus 2 victimes par salle, puis rechargement une fois la salle quittée', () => {
  const { g, ctx, tueur, innocents, avance } = setup();
  armer(ctx, g, tueur);
  placer(ctx, g, 's1', tueur, ...innocents.slice(0, 3));
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: innocents[0] }).ok, true);
  avance(20e3);
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: innocents[1] }).ok, true);
  avance(20e3);
  assert.match(act(ctx, g, tueur, { type: 'tuer', cible: innocents[2] }).msg, /plus t'en servir/);
  act(ctx, g, tueur, { type: 'quitter' }); avance(11e3);
  act(ctx, g, tueur, { type: 'entrer', salle: 2, code: code(ctx, g, 2) });
  placer(ctx, g, 's2', innocents[2]);
  assert.match(act(ctx, g, tueur, { type: 'tuer', cible: innocents[2] }).msg, /recharge/);
  avance(ctx.cfg.armesReglages[0].tueur.recharge * 1000);
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: innocents[2] }).ok, true);
});

test('chandelier : le 1er coup assomme (bloqué dans la salle), le 2e tue ; l\'assommé se réveille', () => {
  const { g, ctx, tueur, innocents, avance } = setup(6, 'Chandelier');
  armer(ctx, g, tueur);
  const [v, w] = innocents;
  placer(ctx, g, 's1', tueur, v, w);
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: v }).ok, true);
  assert.ok(!g.joueurs[v].mort);
  assert.ok(E.playerView(ctx, g, v).assomme);
  assert.match(act(ctx, g, v, { type: 'quitter' }).msg, /assommé/);
  assert.match(act(ctx, g, v, { type: 'entrer', salle: 3, code: code(ctx, g, 3) }).msg, /assommé/);
  avance(20e3);
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: v }).ok, true);
  assert.ok(g.joueurs[v].mort);
  // une autre victime assommée puis laissée : elle se réveille et peut partir
  avance(20e3);
  g.joueurs[tueur].tueur.usage = null;
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: w }).ok, true);
  avance(61e3);
  assert.equal(act(ctx, g, w, { type: 'quitter' }).ok, true);
});

test('poison : la victime ne sait rien et meurt dans les salles suivantes', () => {
  const { g, ctx, tueur, innocents, avance } = setup(6, 'Poison');
  armer(ctx, g, tueur);
  const [v] = innocents;
  placer(ctx, g, 's1', tueur, v);
  const r = act(ctx, g, tueur, { type: 'tuer', cible: v });
  assert.equal(r.ok, true);
  assert.ok(g.joueurs[v].poison && !g.joueurs[v].mort);
  assert.match(act(ctx, g, tueur, { type: 'tuer', cible: v }).msg, /déjà empoisonné|recharge|prêt/);
  g.joueurs[v].poison.restant = 2;
  const va = n => { act(ctx, g, v, { type: 'quitter' }); avance(11e3); return act(ctx, g, v, { type: 'entrer', salle: n, code: code(ctx, g, n) }); };
  va(2); assert.ok(!g.joueurs[v].mort);
  va(3); assert.ok(g.joueurs[v].mort, 'mort à la 2e salle visitée');
  assert.equal(g.joueurs[v].mort.salle, 's3');
  // 0 salle : il meurt en quittant la salle où il a été empoisonné
  const w = innocents[1];
  placer(ctx, g, 's1', w);
  g.joueurs[tueur].tueur.usage = null; g.joueurs[tueur].tueur.pret = 0;
  act(ctx, g, tueur, { type: 'entrer', salle: 1, code: code(ctx, g, 1) });
  act(ctx, g, tueur, { type: 'tuer', cible: w });
  g.joueurs[w].poison.restant = 0;
  act(ctx, g, w, { type: 'quitter' }); avance(11e3);
  assert.ok(g.joueurs[w].mort);
  assert.equal(g.joueurs[w].mort.salle, 's1');
});

test('corde : piège pour le prochain qui entre, corde récupérée sur le cadavre', () => {
  const { g, ctx, tueur, innocents, avance } = setup(6, 'Corde');
  armer(ctx, g, tueur);
  assert.equal(g.joueurs[tueur].tueur.cordes, ctx.cfg.armesReglages[3].tueur.effet);
  placer(ctx, g, 's4', tueur, innocents[1]);
  assert.match(act(ctx, g, tueur, { type: 'tuer', cible: innocents[1] }).msg, /piège/);
  assert.equal(act(ctx, g, tueur, { type: 'piege' }).ok, true);
  assert.equal(g.joueurs[tueur].tueur.cordes, 1);
  const [v] = innocents;
  const r = act(ctx, g, v, { type: 'entrer', salle: 4, code: code(ctx, g, 4) });
  assert.match(r.msg, /corde/);
  assert.ok(g.joueurs[v].mort?.corde);
  const m = E.playerView(ctx, g, v).mort;
  assert.match(act(ctx, g, tueur, { type: 'corps', victime: v, c: m.jeton }).msg, /récupères ta corde/);
  assert.equal(g.joueurs[tueur].tueur.cordes, 2);
});

test('revolver : tue n\'importe qui du même étage, le coup de feu annonce l\'étage', () => {
  const { g, ctx, tueur, innocents } = setup(6, 'Revolver');
  armer(ctx, g, tueur);
  const [loin, proche, autre] = innocents;
  placer(ctx, g, 's5', tueur);         // rez-de-chaussée
  placer(ctx, g, 's2', proche);        // rez-de-chaussée, autre salle
  placer(ctx, g, 's8', loin);          // étage
  const cibles = E.playerView(ctx, g, tueur).secret.cibles.map(c => c.pid);
  assert.ok(cibles.includes(proche) && !cibles.includes(loin));
  assert.match(act(ctx, g, tueur, { type: 'tuer', cible: loin }).msg, /étage/);
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: proche }).ok, true);
  assert.ok(g.joueurs[proche].mort);
  assert.match(g.feed[0].text, /coup de feu.*Rez-de-chaussée/);
  assert.match(E.playerView(ctx, g, autre).bruit.etage, /Rez-de-chaussée/);
  assert.match(E.playerView(ctx, g, autre).notes[0].texte, /coup de feu/);
});

// ---------- les armes des joueurs ----------
const arme = (g, nomArme) => Number(Object.keys(g.cartes).find(c => g.cartes[c].nom === nomArme).slice(1));
const equiper = (ctx, g, p, nomArme) => { const i = arme(g, nomArme); g.joueurs[p].arme = { i, reste: nomArme === 'Corde' ? 2 : 0, usage: null, pret: 0 }; };

test('armes de joueur : apparition dans les salles, ramasser, poser', () => {
  const { g, ctx, innocents, avance } = setup();
  ctx.cfg.apparitionArme = 100; ctx.cfg.premiereArme = 100; g.planArmes = null; // le calendrier est refait avec ces délais
  avance(1); assert.equal(Object.keys(g.armesSol || {}).length, 0, 'pas avant le délai de la première arme');
  avance(101e3);
  const [salle, i] = Object.entries(g.armesSol)[0];
  placer(ctx, g, salle, innocents[0], innocents[1]);
  assert.ok(E.playerView(ctx, g, innocents[0]).armeIci);
  assert.equal(act(ctx, g, innocents[0], { type: 'ramasser' }).ok, true);
  assert.equal(act(ctx, g, innocents[1], { type: 'ramasser' }).ok, false, 'une seule personne la prend');
  assert.equal(E.playerView(ctx, g, innocents[0]).monArme.nom, g.cartes[`a${i}`].nom);
  assert.equal(act(ctx, g, innocents[0], { type: 'poserArme' }).ok, true);
  assert.equal(g.armesSol[salle], Number(i));
});

test('armes de joueur : menace = donner une carte jamais donnée, sans rien en retour ; l\'arme finit par se casser', () => {
  const { g, ctx, innocents, avance } = setup();
  const [a, b] = innocents;
  placer(ctx, g, 's1', a, b);
  equiper(ctx, g, a, 'Hache');
  g.joueurs[a].arme.reste = 3;
  const reprise = () => { avance(300e3); g.joueurs[a].arme.usage = null; g.joueurs[a].arme.pret = 0; };
  assert.equal(act(ctx, g, a, { type: 'viser', cible: b }).ok, true);
  assert.ok(E.playerView(ctx, g, b).menace);
  assert.match(act(ctx, g, b, { type: 'quitter' }).msg, /menacé/);
  const [c1, c2, c3] = g.joueurs[b].main;
  assert.equal(act(ctx, g, b, { type: 'donner', carte: 'zz' }).ok, false);
  assert.equal(act(ctx, g, b, { type: 'donner', carte: c1 }).ok, true);
  assert.ok(g.joueurs[a].vus[c1].includes(b));
  assert.equal(Object.keys(g.joueurs[b].vus).length, 0, 'rien en retour');
  // 2e menace : la carte déjà donnée n\'est plus proposée
  reprise();
  assert.equal(act(ctx, g, a, { type: 'viser', cible: b }).ok, true);
  assert.deepEqual(E.playerView(ctx, g, b).menace.main.map(c => c.id).sort(), [c2, c3].sort());
  assert.equal(act(ctx, g, b, { type: 'donner', carte: c1 }).ok, false, 'déjà donnée');
  // temps écoulé : une carte non encore donnée est choisie au hasard
  avance(61e3);
  assert.equal(g.menaces.at(-1).etat, 'faite');
  assert.notEqual(g.menaces.at(-1).carte, c1);
  // 3e menace, puis plus aucune carte à donner
  reprise();
  assert.match(act(ctx, g, a, { type: 'viser', cible: b }).msg, /restante|se casse/);
  act(ctx, g, b, { type: 'donner', carte: E.playerView(ctx, g, b).menace.main[0].id });
  assert.equal(g.joueurs[a].arme, null, 'arme cassée au bout de 3 utilisations');
  equiper(ctx, g, a, 'Hache');
  assert.match(act(ctx, g, a, { type: 'viser', cible: b }).msg, /déjà donné toutes ses cartes/);
});

test('armes de joueur : chandelier assomme, corde lie les mains (cordes limitées), poison brouille le prochain indice', () => {
  const { g, ctx, innocents, avance } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  const [a, b, c] = innocents;
  placer(ctx, g, 's1', a, b, c);
  equiper(ctx, g, a, 'Chandelier');
  assert.equal(act(ctx, g, a, { type: 'viser', cible: b }).ok, true);
  assert.match(act(ctx, g, b, { type: 'quitter' }).msg, /immobilisé/);
  avance(61e3);
  assert.equal(act(ctx, g, b, { type: 'quitter' }).ok, true);
  equiper(ctx, g, a, 'Corde');
  assert.equal(act(ctx, g, a, { type: 'viser', cible: c }).ok, true);
  assert.equal(E.playerView(ctx, g, c).liens, 'corde');
  assert.equal(g.joueurs[a].arme.reste, 1);
  equiper(ctx, g, a, 'Poison');
  assert.equal(act(ctx, g, a, { type: 'viser', cible: c }).ok, true);
  avance(61e3);
  const r = act(ctx, g, c, { type: 'indice' });
  assert.match(r.msg, /illisible/);
  assert.equal(g.joueurs[c].aveugle, false);
});

// ---------- questions : jamais deux fois la même carte ; les morts restent affichés ----------
test('question : on ne montre jamais deux fois la même carte à la même personne ; plus rien de nouveau = réponse « rien de nouveau »', () => {
  const { g, ctx, innocents, avance } = setup();
  const [a, b] = innocents;
  placer(ctx, g, 's1', a, b);
  const [c1] = g.joueurs[b].main, type = g.cartes[c1].type;
  const autre = t => Object.keys(g.cartes).find(id => g.cartes[id].type === t && !g.joueurs[b].main.includes(id));
  const q = { perso: type === 'perso' ? c1 : autre('perso'), arme: type === 'arme' ? c1 : autre('arme') };
  // b a déjà montré c1 à a
  (g.joueurs[a].vus[c1] ??= []).push(b);
  g.joueurs[a].nextAsk = 0;
  const r = act(ctx, g, a, { type: 'interroger', cible: b, ...q });
  assert.equal(r.ok, true);
  const dejaVu = type === 'salle' ? false : true;
  if (type !== 'salle' && g.joueurs[b].main.filter(c => [g.joueurs[b].salle, q.perso, q.arme].includes(c)).every(c => c === c1)) {
    assert.match(r.msg, /rien de nouveau/);
    assert.equal(g.questions.at(-1).etat, 'repondue');
    assert.equal(E.playerView(ctx, g, a).mesQuestions[0].rien, true);
  }
});

test('un mort reste affiché dans sa salle ; son nom n\'est barré qu\'après le premier scan du corps', () => {
  const { g, ctx, tueur, innocents } = setup();
  armer(ctx, g, tueur);
  const [v, w] = innocents;
  placer(ctx, g, 's1', tueur, v, w);
  act(ctx, g, tueur, { type: 'tuer', cible: v });
  const nom = ctx.name(v);
  const vue = () => E.screenView(ctx, g).salles[1].joueurs.find(j => j.name === nom);
  assert.ok(vue(), 'toujours affiché à l\'écran');
  assert.equal(vue().barre, false);
  assert.ok(E.salleView(ctx, g, 1).joueurs.some(j => j.name === nom), 'et sur la tablette');
  assert.ok(E.playerView(ctx, g, w).presents.some(p => p.pid === v && !p.barre));
  // interroger un mort : sans réponse, personne ne sait qu'il est mort
  g.joueurs[w].nextAsk = 0;
  const persos = Object.keys(g.cartes).filter(c => g.cartes[c].type === 'perso'), armes = Object.keys(g.cartes).filter(c => g.cartes[c].type === 'arme');
  assert.equal(act(ctx, g, w, { type: 'interroger', cible: v, perso: persos[0], arme: armes[0] }).ok, true);
  assert.equal(g.questions.at(-1).etat, 'attente');
  // le corps est trouvé : le nom est barré
  const m = E.playerView(ctx, g, v).mort;
  act(ctx, g, w, { type: 'corps', victime: v, c: m.jeton });
  assert.equal(vue().barre, true);
  assert.equal(E.playerView(ctx, g, w).presents.find(p => p.pid === v).barre, true);
});

test('indices : jamais « … » (plus rien à éliminer = phrase claire)', () => {
  const { g, ctx, innocents } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  const p = innocents[0];
  // le joueur connaît déjà toutes les cartes hors solution
  for (const c of Object.keys(g.cartes)) if (!Object.values(g.solution).includes(c)) (g.joueurs[p].elimines.push(c));
  g.indicesSalle = g.indicesSalle.map(() => [null, null, null]);
  g.auto = g.auto.map(() => []);
  placer(ctx, g, 's2', p);
  const r = act(ctx, g, p, { type: 'indice' });
  assert.ok(r.ok);
  assert.ok(!r.msg.includes('…'), r.msg);
});

// ---------- rejoindre en cours de partie, liens permanents ----------
test('rejoindre en cours : un personnage que personne ne joue, qu\'il tient en main ; plus de place = refusé', () => {
  const { g, ctx } = setup(6);
  assert.equal(E.peutRejoindre(ctx, g).ok, true);
  ctx.name = p => ({ n1: 'Nouveau' })[p] ?? 'J';
  const r = E.ajouterJoueur(ctx, g, 'n1');
  assert.equal(r.ok, true);
  const J = g.joueurs.n1;
  assert.ok(!Object.values(g.joueurs).filter(x => x !== J).some(x => x.perso === J.perso), 'personnage jamais joué par un autre');
  assert.ok(J.main.includes(J.perso), 'il tient la carte de son personnage');
  assert.equal(J.main.length, 3);
  assert.ok(!Object.values(g.solution).includes(J.perso));
  ctx.cfg.rejoindreEnCours = false;
  assert.equal(E.peutRejoindre(ctx, g).ok, false);
  ctx.cfg.rejoindreEnCours = true;
  ctx.cfg.personnages = Object.values(g.cartes).filter(c => c.type === 'perso').map(c => c.nom).join('\n');
  assert.equal(E.peutRejoindre(ctx, g).ok, false, 'tous les personnages sont pris');
});

test('lien permanent d\'une salle : on entre sans le code qui change ; désactivable', () => {
  const { g, ctx } = setup();
  const p = 'p0', c = E.codeFixe(g, 3);
  assert.equal(act(ctx, g, p, { type: 'entrer', salle: 3, code: c }).ok, true);
  assert.equal(g.joueurs[p].salle, 's3');
  assert.equal(act(ctx, g, 'p1', { type: 'entrer', salle: 4, code: c }).ok, false, 'le code est propre à la salle');
  assert.equal(E.adminView(ctx, g).liensSalles.length, 11);
  ctx.cfg.liensSalles = false;
  assert.equal(act(ctx, g, 'p2', { type: 'entrer', salle: 3, code: c }).ok, false);
  assert.equal(E.adminView(ctx, g).liensSalles.length, 0);
});

// ---------- les complices ----------
const SALLE = { bureau: 5, jeu: 1, grenier: 8 };
const voir = (ctx, g, p) => E.playerView(ctx, g, p).complice;
const trouver = (ctx, g, p) => { // le joueur obtient l'indice du Bureau, puis les infos de la Salle de jeu et du Grenier
  placer(ctx, g, `s${SALLE.bureau}`, p);
  ctx.cfg.taches = false;
  act(ctx, g, p, { type: 'indice' });
  scanner(ctx, g, p, SALLE.jeu); scanner(ctx, g, p, SALLE.grenier);
};
const scanner = (ctx, g, p, n) => { ctx.cfg.delaiQuitter = 0; act(ctx, g, p, { type: 'quitter' }); return act(ctx, g, p, { type: 'entrer', salle: n, code: code(ctx, g, n) }); };

test('complices : deux par deux (trio en cercle si impair), chacun a le sien', () => {
  for (const n of [6, 7]) {
    const { g, pids } = setup(n);
    assert.ok(pids.every(p => g.joueurs[p].complice && g.joueurs[p].complice !== p));
    const mutuels = pids.filter(p => g.joueurs[g.joueurs[p].complice].complice === p).length;
    assert.equal(mutuels, n % 2 ? n - 3 : n, `${n} joueurs`);
  }
});

test('complices : le Bureau débloque le bouton, la Salle de jeu et le Grenier donnent les infos (une fois chacune)', () => {
  const { g, ctx, innocents } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  const p = innocents[0], c = g.joueurs[p].complice;
  assert.equal(voir(ctx, g, p), null, 'pas de bouton au départ');
  assert.doesNotMatch(scanner(ctx, g, p, SALLE.jeu).msg, /complice/, 'rien avant le Bureau');
  assert.equal(act(ctx, g, p, { type: 'complice', op: 'chercher' }).ok, false, 'pas avant le Bureau');
  placer(ctx, g, `s${SALLE.bureau}`, p);
  ctx.cfg.taches = false;
  const r = act(ctx, g, p, { type: 'indice' });
  assert.match(r.msg, /complice/);
  assert.equal(voir(ctx, g, p).pret, false);
  const r1 = scanner(ctx, g, p, SALLE.jeu); // l'info arrive en scannant le QR code de la salle
  assert.match(r1.msg, new RegExp(g.cartes[g.joueurs[c].perso].nom));
  assert.equal(act(ctx, g, p, { type: 'complice', op: 'chercher' }).ok, false, 'une seule fois');
  assert.equal(voir(ctx, g, p).nom, null, 'son nom reste secret tant qu\'il manque le Grenier');
  assert.equal(scanner(ctx, g, p, 2).ok, true);
  assert.match(scanner(ctx, g, p, SALLE.grenier).msg, new RegExp(ctx.name(c)));
  assert.equal(voir(ctx, g, p).pret, true);
  assert.equal(voir(ctx, g, p).nom, ctx.name(c));
});

test('complices : dans la même salle, chacun donne une carte à l\'autre (une seule fois)', () => {
  const { g, ctx, pids } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  const a = pids.find(p => g.joueurs[g.joueurs[p].complice].complice === p), b = g.joueurs[a].complice;
  trouver(ctx, g, a);
  placer(ctx, g, 's3', a);
  assert.equal(act(ctx, g, a, { type: 'complice', op: 'echanger', carte: g.joueurs[a].main[0] }).ok, false, 'son complice n\'est pas là / pas prêt');
  trouver(ctx, g, b);
  placer(ctx, g, 's3', a, b);
  assert.equal(voir(ctx, g, a).ici, true);
  const ca = g.joueurs[a].main[0], cb = g.joueurs[b].main[0];
  assert.equal(act(ctx, g, a, { type: 'complice', op: 'echanger', carte: 'zz' }).ok, false);
  assert.equal(act(ctx, g, a, { type: 'complice', op: 'echanger', carte: ca }).ok, true);
  assert.ok(!g.joueurs[b].vus[ca], 'pas encore : il faut que les deux aient choisi');
  assert.equal(voir(ctx, g, b).sonChoix, true);
  assert.match(act(ctx, g, b, { type: 'complice', op: 'echanger', carte: cb }).msg, /Échange fait/);
  assert.ok(g.joueurs[b].vus[ca].includes(a) && g.joueurs[a].vus[cb].includes(b));
  assert.equal(act(ctx, g, a, { type: 'complice', op: 'echanger', carte: ca }).ok, false, 'une seule fois');
});

test('complices : le tueur propose, le complice choisit ; accepté, il doit trouver une arme', () => {
  const { g, ctx, tueur } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  armer(ctx, g, tueur);
  const c = g.joueurs[tueur].complice;
  trouver(ctx, g, tueur); trouver(ctx, g, c);
  placer(ctx, g, 's4', tueur);
  assert.equal(voir(ctx, g, tueur).peutRecruter, false, 'pas dans la même salle');
  placer(ctx, g, 's4', tueur, c);
  assert.equal(voir(ctx, g, tueur).peutRecruter, true);
  assert.equal(voir(ctx, g, c).peutRecruter, false, 'seul le tueur propose');
  assert.equal(act(ctx, g, c, { type: 'complice', op: 'recruter' }).ok, false);
  assert.equal(act(ctx, g, tueur, { type: 'complice', op: 'recruter' }).ok, true);
  assert.ok(!g.joueurs[c].tueur, 'rien tant qu\'il n\'a pas accepté');
  assert.equal(E.playerView(ctx, g, c).propositionTueur.de, ctx.name(tueur));
  assert.equal(voir(ctx, g, tueur).recrutement, 'attente');
  // il faut être dans la même salle pour répondre
  placer(ctx, g, 's6', c);
  assert.equal(act(ctx, g, c, { type: 'complice', op: 'accepter' }).ok, false);
  placer(ctx, g, 's4', c);
  assert.equal(act(ctx, g, c, { type: 'complice', op: 'accepter' }).ok, true);
  assert.equal(g.joueurs[c].tueur.recrue, true);
  const s = E.playerView(ctx, g, c).secret;
  assert.equal(s.recrue, true);
  assert.equal(s.armeRecup, false, 'pas d\'arme au départ');
  assert.equal(voir(ctx, g, tueur).recrutement, 'accepte');
  const victime = Object.keys(g.joueurs).find(x => x !== tueur && x !== c);
  placer(ctx, g, 's4', victime);
  assert.match(act(ctx, g, c, { type: 'tuer', cible: victime }).msg, /pas d'arme/);
  // il ramasse une arme qui traîne : elle sert alors comme arme de tueur
  g.armesSol = { s4: Number(Object.keys(g.cartes).find(k => g.cartes[k].nom === 'Poignard').slice(1)) };
  assert.equal(act(ctx, g, c, { type: 'ramasser' }).ok, true);
  assert.equal(E.playerView(ctx, g, c).secret.armeRecup, true);
  assert.equal(act(ctx, g, c, { type: 'tuer', cible: victime }).ok, true);
  assert.ok(g.joueurs[victime].mort);
  assert.equal(act(ctx, g, tueur, { type: 'complice', op: 'recruter' }).ok, false, 'une seule proposition');
});

test('complices : le complice peut refuser de devenir tueur', () => {
  const { g, ctx, tueur } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  armer(ctx, g, tueur);
  const c = g.joueurs[tueur].complice;
  trouver(ctx, g, tueur); trouver(ctx, g, c);
  placer(ctx, g, 's4', tueur, c);
  act(ctx, g, tueur, { type: 'complice', op: 'recruter' });
  assert.equal(act(ctx, g, c, { type: 'complice', op: 'refuser' }).ok, true);
  assert.ok(!g.joueurs[c].tueur);
  assert.equal(E.playerView(ctx, g, c).propositionTueur, null);
  assert.equal(voir(ctx, g, tueur).recrutement, 'refuse');
  assert.equal(act(ctx, g, tueur, { type: 'complice', op: 'recruter' }).ok, false, 'pas de nouvelle proposition');
});

test('victime d\'un complice recruté : le corps désigne 5 personnages dont celui du meurtrier ; pas pour le tueur d\'origine', () => {
  const { g, ctx, tueur } = setup(8);
  ctx.cfg.sallesPropres = 0; g.propres = [];
  armer(ctx, g, tueur);
  const c = g.joueurs[tueur].complice;
  const [v, w, x] = Object.keys(g.joueurs).filter(p => p !== tueur && p !== c);
  placer(ctx, g, 's4', tueur, v);
  act(ctx, g, tueur, { type: 'tuer', cible: v });
  const m0 = E.playerView(ctx, g, v).mort;
  assert.doesNotMatch(act(ctx, g, w, { type: 'corps', victime: v, c: m0.jeton }).msg, /meurtrier/, 'tueur d\'origine : pas de liste');
  // le complice devient tueur et tue avec une arme ramassée
  g.joueurs[c].tueur = { actif: true, recrue: true, cache: null, arme: false, pret: 0, usage: null, victimes: 0 };
  g.joueurs[c].arme = { i: Number(Object.keys(g.cartes).find(k => g.cartes[k].nom === 'Poignard').slice(1)), reste: 3, usage: null, pret: 0 };
  placer(ctx, g, 's5', c, x);
  assert.equal(act(ctx, g, c, { type: 'tuer', cible: x }).ok, true);
  const m = E.playerView(ctx, g, x).mort;
  const r = act(ctx, g, w, { type: 'corps', victime: x, c: m.jeton });
  assert.match(r.msg, /meurtrier est l'un de ces personnages/);
  const liste = g.joueurs[x].mort.suspects;
  assert.equal(liste.length, 5);
  assert.ok(liste.includes(g.joueurs[c].perso), 'le vrai meurtrier y est');
  assert.ok(!liste.includes(g.joueurs[x].perso), 'pas la victime');
  assert.match(g.joueurs[w].notes[0].texte, /meurtrier/);
});

test('une seule arme à la fois : ramasser une deuxième est refusé, le tueur ne cumule pas son arme du crime', () => {
  const { g, ctx, tueur, innocents } = setup();
  const i = Number(Object.keys(g.cartes).find(k => g.cartes[k].nom === 'Hache').slice(1));
  const [a] = innocents;
  placer(ctx, g, 's2', a);
  g.armesSol = { s2: i };
  assert.equal(act(ctx, g, a, { type: 'ramasser' }).ok, true);
  g.armesSol = { s2: i };
  assert.match(act(ctx, g, a, { type: 'ramasser' }).msg, /déjà une arme/);
  assert.equal(g.armesSol.s2, i, 'l\'arme reste par terre');
  // le tueur qui a récupéré l'arme du crime ne peut plus ramasser
  armer(ctx, g, tueur);
  placer(ctx, g, 's3', tueur);
  g.armesSol = { s3: i };
  assert.match(act(ctx, g, tueur, { type: 'ramasser' }).msg, /arme du crime/);
});

// ---------- 13 joueurs au départ, un 14e arrive ----------
test('13 joueurs puis un 14e : personnage libre, carte en main, complice, échange à sens unique', () => {
  const { g, ctx, pids } = setup(13);
  ctx.cfg.sallesPropres = 0; g.propres = [];
  assert.equal(E.peutRejoindre(ctx, g).ok, true, 'la liste a 14 personnages : un est libre');
  ctx.name = p => (p === 'n14' ? 'Quatorzième' : `J${p.slice(1)}`);
  assert.equal(E.ajouterJoueur(ctx, g, 'n14').ok, true);
  const N = g.joueurs.n14;
  assert.equal(Object.keys(g.joueurs).length, 14);
  assert.equal(new Set(Object.values(g.joueurs).map(J => J.perso)).size, 14, '14 personnages différents');
  assert.ok(N.main.includes(N.perso) && N.main.length === 3);
  assert.equal(E.peutRejoindre(ctx, g).ok, false, 'plus de personnage libre');
  assert.ok(N.complice && N.complice !== 'n14');
  // il retrouve son complice (qui n'a pas forcément fait sa propre enquête) et lui donne une carte
  const cplc = N.complice;
  trouver(ctx, g, 'n14');
  placer(ctx, g, 's3', 'n14', cplc);
  const v = voir(ctx, g, 'n14');
  assert.equal(v.ici, true);
  const carte = N.main[1];
  assert.match(act(ctx, g, 'n14', { type: 'complice', op: 'echanger', carte }).msg, /Tu as donné/);
  assert.ok(g.joueurs[cplc].vus[carte].includes('n14'));
  assert.equal(act(ctx, g, 'n14', { type: 'complice', op: 'echanger', carte }).ok, false, 'une seule fois');
  // les autres complices (paires et trio) continuent de marcher
  const mutuels = pids.filter(p => g.joueurs[g.joueurs[p].complice].complice === p);
  assert.ok(mutuels.length >= 10);
});

// ---------- complices : un seul a tout trouvé ; armes prévues par un indice ----------
test('complices : dès que l\'un a tout trouvé et que l\'autre a débloqué la 1re étape, ils peuvent échanger', () => {
  const { g, ctx, pids } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  const a = pids.find(p => g.joueurs[g.joueurs[p].complice].complice === p), b = g.joueurs[a].complice;
  // a a tout trouvé ; b n'a rien débloqué : pas encore
  trouver(ctx, g, a);
  placer(ctx, g, 's3', a, b);
  assert.equal(voir(ctx, g, a).ici, false);
  assert.equal(act(ctx, g, a, { type: 'complice', op: 'echanger', carte: g.joueurs[a].main[0] }).ok, false);
  // b passe au Bureau (1re étape) seulement
  placer(ctx, g, `s${SALLE.bureau}`, b); ctx.cfg.taches = false; act(ctx, g, b, { type: 'indice' });
  placer(ctx, g, 's3', b);
  assert.equal(voir(ctx, g, b).pret, false, 'b ne sait pas encore qui est son complice');
  assert.equal(voir(ctx, g, b).ici, true, 'mais il sait qu\'il est avec lui');
  assert.equal(voir(ctx, g, a).ici, true);
  const ca = g.joueurs[a].main[0], cb = g.joueurs[b].main[0];
  assert.equal(act(ctx, g, a, { type: 'complice', op: 'echanger', carte: ca }).ok, true);
  assert.match(act(ctx, g, b, { type: 'complice', op: 'echanger', carte: cb }).msg, /Échange fait/);
  assert.ok(g.joueurs[b].vus[ca].includes(a) && g.joueurs[a].vus[cb].includes(b));
});

test('indice « {lieu_arme} / {heure_arme} » : la prochaine arme prévue au calendrier apparaît bien là, à ce moment', () => {
  const { g, ctx, pids, avance } = setup(6);
  ctx.cfg.sallesPropres = 0; ctx.cfg.premiereArme = 300; ctx.cfg.apparitionArme = 200; g.planArmes = null;
  avance(1);
  ecrire(g, 0, 'Une arme apparaîtra dans {lieu_arme} vers {heure_arme}.');
  const P = pids.find(p => g.joueurs[p].perso !== g.solution.perso);
  scanner(ctx, g, P, 0);
  const t = act(ctx, g, P, { type: 'indice' }).indice;
  const m = t.match(/^Une arme apparaîtra dans (.+) vers (\d\dh\d\d)\.$/);
  assert.ok(m, t);
  const prevue = g.planArmes.find(e => !e.fait);
  assert.equal(m[1], g.cartes[prevue.salle].nom);
  assert.equal(m[2], new Date(prevue.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h'));
  avance(301e3);
  assert.equal(g.armesSol[prevue.salle] != null, true, 'l\'arme est apparue à la salle annoncée');
});
