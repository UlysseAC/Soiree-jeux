// Pendant le tirage au sort sur l'écran (2 s par bobine), les téléphones ne savent pas encore qui joue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];

function setup(joueurs = 2) {
  let t = Date.UTC(2026, 9, 12, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), programme: 'mj1' };
  Object.assign(cfg.jeux.mj1, { type: 'manuel', joueurs });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  NAMES.forEach((n, i) => mj.claim(ctx, g, `p${i}`, n));
  mj.adminAction(ctx, g, { type: 'annoncer' });
  const r = g.rounds[0];
  return { ctx, g, r, pid: n => `p${NAMES.indexOf(n)}`, at: ms => { t = ms; } };
}

test('pendant le tirage, ni « à toi de jouer » ni les noms sur les téléphones', () => {
  const { ctx, g, r, pid, at } = setup();
  const [a] = r.joueurs;
  const spect = NAMES.find(n => !r.joueurs.includes(n));
  at(r.annonceAt + 3999); // 2 joueurs : le tirage dure 4 s
  assert.equal(mj.playerView(ctx, g, pid(a)).monTour, null);
  assert.equal(mj.playerView(ctx, g, pid(a)).actif.tirage, true);
  assert.deepEqual(mj.playerView(ctx, g, pid(spect)).actif.joueurs, []);
  assert.ok(!JSON.stringify(mj.playerView(ctx, g, pid(spect))).includes(`"${a}"`), 'le nom du joueur tiré n\'apparaît pas');
  at(r.annonceAt + 4000);
  assert.equal(mj.playerView(ctx, g, pid(a)).monTour.n, r.n, 'à la fin des bobines, le joueur est prévenu');
  assert.deepEqual(mj.playerView(ctx, g, pid(spect)).actif.joueurs, r.joueurs);
});

test('quand tout le monde joue, pas de tirage : les téléphones sont prévenus tout de suite', () => {
  const { ctx, g, r, pid } = setup(0);
  assert.equal(r.joueurs.length, NAMES.length);
  assert.equal(mj.playerView(ctx, g, pid(NAMES[0])).monTour.n, r.n);
});
