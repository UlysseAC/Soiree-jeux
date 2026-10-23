// L'Enquête — tâches des salles : il faut réussir la tâche pour l'indice ; tâches à plusieurs (lancer, rejoindre, rôles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../server/games/enquete.js';
import * as T from '../server/games/taches.js';

function setup(n = 6) {
  let t = 1_800_000_000_000;
  const cfg = { ...E.defaultConfig(), panne: false, armesJoueurs: false };
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] ?? '?', sfx: () => {} };
  const g = E.start(ctx, pids);
  E.adminAction(ctx, g, { type: 'lancer' });
  return { g, ctx, avance: ms => { t += ms; return E.tick(ctx, g); }, now: () => t };
}
const placer = (ctx, g, salle, ...pids) => pids.forEach(pid => E.adminAction(ctx, g, { type: 'placer', pid, salle }));
const act = (ctx, g, p, a) => E.playerAction(ctx, g, p, a);

test('salles du manoir par défaut, une tâche tirée par salle ; plus d\'indice gratuit', () => {
  const { g, ctx } = setup();
  assert.equal(g.cartes.s0.nom, 'Garage');
  assert.equal(g.cartes.s10.nom, 'Pharmacie');
  assert.equal(g.taches.length, 11);
  g.taches.forEach((t, n) => assert.ok([T.SALLES[n].solo, T.SALLES[n].groupe].includes(t.id)));
  placer(ctx, g, 's0', 'p0');
  assert.match(act(ctx, g, 'p0', { type: 'indice' }).msg, /Réussis la tâche/);
});

test('tâche solo réussie : l\'indice de la salle, puis une nouvelle tâche ; pas deux fois', () => {
  const { g, ctx } = setup();
  g.taches[5] = { id: 'machine', groupe: false, params: { mot: 'MONOCLE' } };
  placer(ctx, g, 's5', 'p0');
  const v = E.playerView(ctx, g, 'p0').tache;
  assert.equal(v.nom, 'Machine à écrire');
  assert.equal(v.params.mot, 'MONOCLE');
  const r = act(ctx, g, 'p0', { type: 'tacheReussie' });
  assert.equal(r.ok, true);
  assert.ok(r.indice);
  assert.equal(g.joueurs.p0.indices, 1);
  assert.equal(E.playerView(ctx, g, 'p0').tache, null, 'plus de tâche tant qu\'il n\'est pas passé dans une autre salle');
  assert.equal(E.playerView(ctx, g, 'p0').indice.etat, 'attente');
  assert.equal(act(ctx, g, 'p0', { type: 'tacheReussie' }).ok, false);
});

test('3 indices par salle : 1er et 2e par une tâche, une autre salle avant le 2e, deux autres avant le 3e (sans tâche)', () => {
  const { g, ctx } = setup();
  ctx.cfg.sallesPropres = 0; g.propres = [];
  const ici = 's5', tache = () => { g.taches[5] = { id: 'machine', groupe: false, params: { mot: 'MONOCLE' } }; };
  tache(); placer(ctx, g, ici, 'p0');
  assert.equal(act(ctx, g, 'p0', { type: 'tacheReussie' }).ok, true);                       // 1er indice
  assert.match(act(ctx, g, 'p0', { type: 'indice' }).msg, /autre salle/, 'pas tout de suite le suivant');
  placer(ctx, g, 's1', 'p0'); placer(ctx, g, ici, 'p0');                                    // une autre salle
  tache();
  assert.equal(E.playerView(ctx, g, 'p0').tache.id, 'machine');
  assert.match(act(ctx, g, 'p0', { type: 'indice' }).msg, /tâche/, 'le 2e demande une tâche');
  assert.equal(act(ctx, g, 'p0', { type: 'tacheReussie' }).ok, true);                       // 2e indice
  assert.equal(g.joueurs.p0.indices, 2);
  placer(ctx, g, 's1', 'p0'); placer(ctx, g, ici, 'p0');                                    // une seule autre salle : trop tôt
  assert.match(act(ctx, g, 'p0', { type: 'indice' }).msg, /1 autre salle/);
  placer(ctx, g, 's2', 'p0'); placer(ctx, g, ici, 'p0');                                    // deux autres salles (s1 et s2)
  assert.equal(E.playerView(ctx, g, 'p0').tache, null, 'le 3e se demande sans tâche');
  assert.equal(act(ctx, g, 'p0', { type: 'indice' }).ok, true);                             // 3e indice
  assert.equal(g.joueurs.p0.indices, 3);
  assert.match(act(ctx, g, 'p0', { type: 'indice' }).msg, /tous les indices/);
  assert.equal(E.playerView(ctx, g, 'p0').indice.etat, 'fini');
});

test('tâche à plusieurs : lancer, rejoindre, rôles ; réussite = un indice pour chacun ; quitter la salle annule', () => {
  const { g, ctx } = setup();
  g.taches[6] = { id: 'canalisations', groupe: true, params: {} };
  placer(ctx, g, 's6', 'p0', 'p1', 'p2');
  assert.equal(act(ctx, g, 'p0', { type: 'tacheReussie' }).ok, false, 'pas en solo');
  assert.equal(act(ctx, g, 'p0', { type: 'tacheLancer' }).ok, true);
  assert.equal(E.playerView(ctx, g, 'p1').tache.etat, 'attente');
  assert.equal(act(ctx, g, 'p1', { type: 'tacheRejoindre' }).ok, true);
  assert.equal(act(ctx, g, 'p2', { type: 'tacheRejoindre' }).ok, false, 'complet');
  const v0 = E.playerView(ctx, g, 'p0').tache, v1 = E.playerView(ctx, g, 'p1').tache;
  assert.equal(v0.etat, 'jeu');
  assert.deepEqual([v0.role, v1.role], [0, 1]);
  const d = g.sessions.s6.data, n = d.n, moitie = i => (i % n < Math.ceil(n / 2) ? 0 : 1);
  assert.match(act(ctx, g, ['p0', 'p1'][1 - moitie(0)], { type: 'tache', op: 'tourner', i: 0 }).msg, /autre moitié/);
  // chacun tourne les tuyaux de sa moitié jusqu'à la bonne orientation
  let r = { ok: false };
  for (let i = 0; i < n * n && !r.indice; i++) {
    for (let q = 0; q < 3 && d.cases[i].rot !== d.sol[i] && !r.indice; q++) r = act(ctx, g, ['p0', 'p1'][moitie(i)], { type: 'tache', op: 'tourner', i });
  }
  assert.ok(r.indice);
  assert.equal(g.joueurs.p0.indices + g.joueurs.p1.indices, 2, 'chacun son indice');
  assert.equal(g.sessions.s6, undefined);
  // annulation en changeant de salle
  g.taches[6] = { id: 'canalisations', groupe: true, params: {} };
  act(ctx, g, 'p2', { type: 'tacheLancer' });
  placer(ctx, g, 's6', 'p3');
  act(ctx, g, 'p3', { type: 'tacheRejoindre' });
  assert.equal(g.sessions.s6.etat, 'jeu');
  placer(ctx, g, 's1', 'p3');
  assert.equal(g.sessions.s6, undefined);
});

test('pas assez de joueurs sans l\'indice pour un trio : la salle propose sa tâche solo', () => {
  const { g, ctx } = setup(3);
  g.taches[9] = { id: 'porte', groupe: true, params: {} };
  placer(ctx, g, 's9', 'p0', 'p1', 'p2');
  assert.equal(E.playerView(ctx, g, 'p0').tache.id, 'porte');
  g.joueurs.p2.pris.s9 = 1;
  const v = E.playerView(ctx, g, 'p0').tache;
  assert.equal(v.id, 'livres');
  assert.equal(v.groupe, false);
  assert.equal(act(ctx, g, 'p2', { type: 'tacheLancer' }).ok, false);
});

test('phase finale : une tâche réussie donne un indice, comme d\'habitude', () => {
  const { g, ctx } = setup();
  E.adminAction(ctx, g, { type: 'finale' });
  g.taches[0] = { id: 'pneus', groupe: false, params: {} };
  placer(ctx, g, 's0', 'p0');
  const r = act(ctx, g, 'p0', { type: 'tacheReussie' });
  assert.equal(g.joueurs.p0.indices, 1);
  assert.equal(r.msg.split('\n').length, 1);
});

// Chaque tâche à plusieurs se réussit avec les bons gestes.
function session(id) {
  const { g, ctx, avance, now } = setup();
  const n = Number(Object.keys(T.SALLES).find(k => T.SALLES[k].groupe === id));
  const s = `s${n}`;
  g.taches[n] = { id, groupe: true, params: {} };
  const pids = ['p0', 'p1', 'p2'].slice(0, T.GROUPES[id].n);
  placer(ctx, g, s, ...pids);
  act(ctx, g, 'p0', { type: 'tacheLancer' });
  pids.slice(1).forEach(p => act(ctx, g, p, { type: 'tacheRejoindre' }));
  const d = () => g.sessions[s]?.data;
  const fait = () => !g.sessions[s] && g.joueurs.p0.indices === 1;
  return { g, ctx, d, fait, avance, now, a: (i, o) => act(ctx, g, pids[i], { type: 'tache', ...o }) };
}

test('tâches à plusieurs : chacune se réussit', () => {
  { // roue : cric levé pendant qu'on visse
    const S = session('roue');
    assert.match(S.a(1, { op: 'visser', q: 25 }).msg, /trop basse/);
    for (let k = 0; k < 30 && !S.fait(); k++) { S.a(0, { op: 'pomper' }); S.a(0, { op: 'pomper' }); S.a(0, { op: 'pomper' }); S.a(0, { op: 'pomper' }); S.a(1, { op: 'visser', q: 25 }); S.avance(200); }
    assert.ok(S.fait(), 'roue');
  }
  { // poker : chacun trouve sa carte, 3 manches
    const S = session('poker');
    assert.equal(S.a(0, { op: 'carte', carte: S.d().mains[0].find(c => c !== S.d().doubles[0]) }).ok, false);
    for (let m = 0; m < 3; m++) { const dd = S.d().doubles; S.a(0, { op: 'carte', carte: dd[0] }); S.a(1, { op: 'carte', carte: dd[1] }); }
    assert.ok(S.fait(), 'poker');
  }
  { // table : placer selon le plan
    const S = session('table');
    S.d().plan.forEach((place, objet) => S.a(1, { op: 'placer', objet, place }));
    S.a(1, { op: 'valider' });
    assert.ok(S.fait(), 'table');
  }
  { // lampes : somme dans la zone 10 s (la zone bouge)
    const S = session('lampes');
    for (let k = 0; k < 120 && !S.fait(); k++) {
      const c = 100 + 45 * Math.sin((S.now() - S.d().debut) / 2600 + S.d().phase);
      S.a(0, { op: 'curseur', v: c / 2 }); S.a(1, { op: 'curseur', v: c / 2 });
      S.avance(100);
    }
    assert.ok(S.fait(), 'lampes');
  }
  { // soufflé : trop tôt puis au bon moment
    const S = session('souffle');
    assert.match(S.a(1, { op: 'sortir' }).msg, /Trop tôt/);
    S.avance(S.d().fenetre - S.now());
    S.a(1, { op: 'sortir' });
    assert.ok(S.fait(), 'soufflé');
  }
  { // coffre : 3 chiffres
    const S = session('coffre');
    for (let i = 0; i < 3; i++) { S.a(0, { op: 'molette', v: S.d().code[S.d().i] }); S.a(1, { op: 'stop' }); }
    assert.ok(S.fait(), 'coffre');
  }
  { // volets : 3 fois ensemble
    const S = session('volets');
    for (let i = 0; i < 3; i++) { S.a(0, { op: 'claquer', t: S.now() }); S.a(1, { op: 'claquer', t: S.now() + 300 }); S.avance(1000); }
    assert.ok(S.fait(), 'volets');
  }
  { // radio : aligné 3 s
    const S = session('radio');
    const c = S.d().cible;
    S.a(0, { op: 'gros', v: Math.round(c) }); S.a(1, { op: 'fin', v: c - Math.round(c) });
    for (let k = 0; k < 40 && !S.fait(); k++) S.avance(100);
    assert.ok(S.fait(), 'radio');
  }
  { // porte : deux leviers + code (affiché sur la tablette)
    const S = session('porte');
    S.a(0, { op: 'levier', bas: true });
    assert.match(S.a(2, { op: 'code', code: S.d().code }).msg, /leviers/);
    S.a(1, { op: 'levier', bas: true });
    const n = 9;
    assert.equal(E.salleView(S.ctx, S.g, n).tache.tablette.code, S.d().code);
    S.a(2, { op: 'code', code: S.d().code });
    assert.ok(S.fait(), 'porte');
  }
  { // cuve : jauges dans le vert 3 s, puis le code en deux moitiés
    const S = session('cuve');
    S.a(0, { op: 'temp', v: 68 });
    for (let k = 0; k < 60 && !S.d().code; k++) { if (k % 2 === 0) { S.a(1, { op: 'pomper' }); } const pr = S.d().pression; if (pr > 62) S.d().pression = 60; S.avance(100); }
    assert.ok(S.d().code, 'code apparu');
    const v0 = E.playerView(S.ctx, S.g, 'p0').tache.vue, v1 = E.playerView(S.ctx, S.g, 'p1').tache.vue;
    S.a(2, { op: 'code', code: v0.moitie + v1.moitie });
    assert.ok(S.fait(), 'cuve');
  }
});

test('réglages : tâches salle par salle, chance du solo, salle sans tâche = indice gratuit', () => {
  const { g, ctx } = setup();
  placer(ctx, g, 's0', 'p0');
  ctx.cfg.chanceSolo = 100;
  for (let k = 0; k < 20; k++) { g.taches[0] = { id: 'roue', groupe: true, params: {} }; E.adminAction(ctx, g, { type: 'nouvelleTache', salle: 's0' }); assert.equal(g.taches[0].id, 'pneus'); }
  // jamais deux fois de suite la même tâche dans une salle : on alterne
  ctx.cfg.chanceSolo = 50;
  let avant = g.taches[0];
  for (let k = 0; k < 20; k++) { E.adminAction(ctx, g, { type: 'nouvelleTache', salle: 's0' }); assert.notEqual(g.taches[0].id, avant.id); avant = g.taches[0]; }
  ctx.cfg.chanceSolo = 100;
  ctx.cfg.tachesSolo[0] = false; // plus de solo dans le garage : la salle retire sa tâche à plusieurs
  assert.equal(E.playerView(ctx, g, 'p0').tache.id, 'roue');
  ctx.cfg.tachesGroupe[0] = false; // plus aucune tâche : l'indice est gratuit
  assert.equal(E.playerView(ctx, g, 'p0').tache, null);
  assert.equal(act(ctx, g, 'p0', { type: 'indice' }).ok, true);
});

test('difficulté : facile / difficile changent les tâches (goujons, manches, chiffres, temps du solo)', () => {
  for (const [difficulte, goujons, chiffres, niveau] of [['facile', 3, 2, 0], ['normal', 5, 3, 1], ['difficile', 6, 4, 2]]) {
    const { g, ctx } = setup();
    ctx.cfg.difficulte = difficulte;
    g.taches[0] = { id: 'roue', groupe: true, params: {} };
    placer(ctx, g, 's0', 'p0', 'p1');
    act(ctx, g, 'p0', { type: 'tacheLancer' }); act(ctx, g, 'p1', { type: 'tacheRejoindre' });
    assert.equal(g.sessions.s0.data.goujons.length, goujons, difficulte);
    g.taches[5] = { id: 'coffre', groupe: true, params: {} };
    placer(ctx, g, 's5', 'p2', 'p3');
    act(ctx, g, 'p2', { type: 'tacheLancer' }); act(ctx, g, 'p3', { type: 'tacheRejoindre' });
    assert.equal(g.sessions.s5.data.code.length, chiffres);
    g.taches[8] = { id: 'radio', groupe: true, params: {} }; // après une tâche à plusieurs, la salle tire la solo
    E.adminAction(ctx, g, { type: 'nouvelleTache', salle: 's8' });
    assert.equal(g.taches[8].params.niveau, niveau, 'le téléphone reçoit le niveau pour les tâches solo');
  }
});
