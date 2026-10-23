// L'Enquête — le tueur (indices précis, auto-accusation, arme cachée, meurtres), les corps, « Quitter la salle ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/games/enquete.js';

function setup(n = 6) {
  let t = 1_800_000_000_000;
  const cfg = { ...E.defaultConfig(), taches: false };
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] ?? '?', sfx: () => {} };
  const g = E.start(ctx, pids);
  E.adminAction(ctx, g, { type: 'lancer' });
  const tueur = pids.find(p => g.joueurs[p].perso === g.solution.perso);
  return { g, ctx, pids, tueur, innocents: pids.filter(p => p !== tueur), avance: ms => { t += ms; return E.tick(ctx, g); } };
}
const placer = (ctx, g, salle, ...pids) => pids.forEach(pid => E.adminAction(ctx, g, { type: 'placer', pid, salle }));
const act = (ctx, g, p, a) => E.playerAction(ctx, g, p, a);
const code = (ctx, g, n) => E.salleView(ctx, g, n).code;

test('le tueur a des indices plus précis : deux cartes innocentées à chaque indice automatique', () => {
  const { g, ctx, tueur, innocents } = setup();
  placer(ctx, g, 's0', tueur, innocents[0]);
  act(ctx, g, tueur, { type: 'indice' });
  assert.equal(g.joueurs[tueur].elimines.length, 2);
  ctx.cfg.modeles = "« {carte} » n'a rien à voir avec le crime.";
  act(ctx, g, innocents[0], { type: 'indice' });
  assert.equal(g.joueurs[innocents[0]].elimines.length, 1);
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
  avance(ctx.cfg.rechargeArme * 1000);
  assert.equal(act(ctx, g, tueur, { type: 'tuer', cible: innocents[1] }).ok, true);
  // la victime ne joue plus et n'apparaît plus dans la salle
  assert.match(act(ctx, g, innocents[0], { type: 'indice' }).msg, /assassiné/);
  assert.ok(!E.salleView(ctx, g, n).joueurs.some(j => j.name === ctx.name(innocents[0])));
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
  g.joueurs[tueur].tueur.recharge = 0;
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
