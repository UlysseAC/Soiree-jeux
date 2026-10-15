import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';
import { objetsOf } from '../server/games/minijeux/disparu.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé'];

function setup(opts = {}) {
  let t = Date.UTC(2026, 9, 13, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), decalage: -120, programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'disparu', joueurs: 3, manchesMemo: 3, objetsDepart: 6, objetsPlus: 2, tempsMemo: 15, tempsReponse: 20, melangeDes: 3, ...opts });
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
const jusquA = (s, phase) => { for (let k = 0; k < 10 && s.r.mem.phase !== phase; k++) s.at(s.r.mem.fin); };

test('objets : « emoji nom » un par ligne, l\'emoji est facultatif, sans doublon', () => {
  assert.deepEqual(objetsOf({ objets: '🍎 Pomme\n\nGuitare\n🍎 pomme\n✂️ Ciseaux' }), [{ emoji: '🍎', nom: 'Pomme' }, { emoji: '', nom: 'Guitare' }, { emoji: '✂️', nom: 'Ciseaux' }]);
});

test('une manche : la scène, le noir, la question sans l\'objet disparu, puis les réponses et les points', () => {
  const s = setup();
  const { g, ctx, r, pid } = s;
  const [a, b, c] = r.joueurs;
  assert.equal(r.mem.phase, 'memorise');
  assert.equal(mj.screenView(ctx, g).etat.scene.length, 6);
  assert.equal(mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: 0 }).ok, false, 'pas encore');
  jusquA(s, 'question');
  const cur = r.mem.cur, manquant = cur.manquant.nom;
  const ecran = mj.screenView(ctx, g).etat;
  assert.equal(ecran.scene, undefined);
  assert.equal(ecran.apres.filter(Boolean).length, 5, 'un objet en moins');
  assert.ok(!JSON.stringify(ecran).includes(manquant), 'l\'écran ne dit pas lequel');
  const choix = mj.playerView(ctx, g, pid(a)).etat.choix;
  assert.equal(choix.length, 4);
  assert.ok(choix.some(o => o.nom === manquant));
  for (const o of choix) if (o.nom !== manquant) assert.ok(!cur.scene.some(x => x.nom === o.nom), 'les leurres n\'étaient pas dans la scène');
  const bon = choix.findIndex(o => o.nom === manquant), faux = choix.findIndex(o => o.nom !== manquant);
  s.at(s.now() + 2000);
  assert.equal(mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: bon }).ok, true);
  assert.equal(mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: faux }).ok, false, 'une seule réponse');
  s.at(s.now() + 8000);
  mj.playerAction(ctx, g, pid(b), { type: 'repondre', choix: bon });
  mj.playerAction(ctx, g, pid(c), { type: 'repondre', choix: faux });
  s.at(s.now()); // tout le monde a répondu : révélation tout de suite
  assert.equal(r.mem.phase, 'revelation');
  assert.equal(r.mem.scores[a], 100 + 45, 'rapide : presque tout le bonus');
  assert.equal(r.mem.scores[b], 100 + 25, 'à mi-temps : la moitié du bonus');
  assert.equal(r.mem.scores[c], 0);
  const rev = mj.screenView(ctx, g).etat;
  assert.equal(rev.manquant.nom, manquant);
  assert.deepEqual(rev.reponses.map(x => x.nom), [a, b, c]);
});

test('les manches deviennent plus dures, et les objets changent de place à partir de la 3e ; le meilleur score gagne', () => {
  const s = setup();
  const { g, ctx, r, pid } = s;
  const [a, b, c] = r.joueurs;
  const tailles = [];
  for (let k = 1; k <= 3; k++) {
    tailles.push(r.mem.cur.scene.length);
    jusquA(s, 'question');
    const apres = r.mem.cur.apres;
    if (k < 3) assert.equal(apres.length, r.mem.cur.scene.length, 'avec un trou à la place de l\'objet disparu');
    else assert.equal(apres.length, r.mem.cur.scene.length - 1, 'mélangés, sans trou');
    const choix = r.mem.cur.choix, bon = choix.findIndex(o => o.nom === r.mem.cur.manquant.nom);
    mj.playerAction(ctx, g, pid(a), { type: 'repondre', choix: bon });
    if (k === 1) mj.playerAction(ctx, g, pid(b), { type: 'repondre', choix: bon });
    jusquA(s, k < 3 ? 'memorise' : 'fini');
  }
  assert.deepEqual(tailles, [6, 8, 10]);
  assert.equal(r.status, 'fini');
  assert.equal(r.points[a].place, 1);
  assert.equal(r.points[b].place, 2);
  assert.equal(r.points[c].place, 3);
});
