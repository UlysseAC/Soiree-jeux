// Tirage au sort : seulement les connectés, 3 rounds au plus (sans le quiz), et le détective en avant-dernier pour égaliser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mj from '../server/games/minijeux.js';

const NAMES = ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé', 'Tom'];

function setup(programme, connectes = NAMES) {
  let t = Date.UTC(2026, 9, 12, 7, 0);
  const cfg = { ...mj.defaultConfig(), joueurs: NAMES.join('\n'), programme, rounds: programme.split(',').length };
  for (const s of mj.SLOTS) Object.assign(cfg.jeux[s], { type: 'manuel', joueurs: 2, points: '10, 6' });
  Object.assign(cfg.jeux.mj6, { type: 'disparu', points: '10, 6, 3, 1, 1, 1' });
  Object.assign(cfg.jeux.mj7, { type: 'quiz', questions: 'Q ?\nA\n*B\nC\nD' });
  const ctx = { now: () => t, cfg, sfx: () => {} };
  const g = mj.start(ctx);
  for (const n of connectes) mj.claim(ctx, g, `tel:${n}`, n);
  // joue un round tout de suite (annonce + commencer), places dans l'ordre
  const jouer = r => {
    mj.adminAction(ctx, g, { type: 'annoncer' });
    // tout le monde à la limite : le round attend la décision de l'admin ; ici, il le saute
    if (r.status === 'prevu' && g.attente?.raison === 'limite') mj.adminAction(ctx, g, { type: 'passer', n: r.n });
    if (r.status === 'saute') return;
    mj.adminAction(ctx, g, { type: 'commencer' });
    if (r.type === 'manuel' || r.type === 'disparu') mj.adminAction(ctx, g, { type: 'resultats', n: r.n, places: Object.fromEntries(r.equipes.map((_, i) => [i, i + 1])) });
    t += 60e3;
  };
  return { ctx, g, jouer };
}

test('seuls les joueurs connectés sont tirés au sort', () => {
  const { g, jouer } = setup('mj1,mj2,mj3', ['Léa', 'Hugo', 'Inès', 'Malik']);
  for (const r of g.rounds) jouer(r);
  const tous = g.rounds.flatMap(r => r.joueurs);
  assert.ok(tous.length > 0);
  assert.ok(tous.every(n => ['Léa', 'Hugo', 'Inès', 'Malik'].includes(n)), JSON.stringify(tous));
});

test('personne ne joue plus de 3 rounds (le quiz ne compte pas) ; un round sans joueur libre est sauté', () => {
  const { g, jouer } = setup('mj1,mj2,mj3,mj4,mj5,mj1,mj2,mj3,mj4,mj5,mj7', ['Léa', 'Hugo', 'Inès', 'Malik']);
  for (const r of g.rounds) jouer(r);
  for (const n of ['Léa', 'Hugo', 'Inès', 'Malik']) assert.ok(mj.joues(g, n) <= 3, `${n} : ${mj.joues(g, n)}`);
  assert.ok(g.rounds.some(r => r.status === 'saute'), 'des rounds sont sautés faute de joueur libre');
  assert.equal(g.rounds.at(-1).joueurs.length, 4, 'le quiz réunit tout le monde, même à 3 rounds');
});

test('détective en avant-dernier : tous ceux sous 3 rounds jouent, points ×2 pour 1 round joué, ×3 pour aucun', () => {
  // 6 connectés ; 2 rounds de 2 : 4 joueurs à 1 round, 2 joueurs à 0
  const { g, jouer } = setup('mj1,mj2,mj6,mj7');
  jouer(g.rounds[0]); jouer(g.rounds[1]);
  const r = g.rounds[2];
  jouer(r);
  assert.equal(r.joueurs.length, 6, 'tout le monde est sous 3 rounds');
  const zero = NAMES.filter(n => !g.rounds[0].joueurs.includes(n) && !g.rounds[1].joueurs.includes(n));
  for (const n of r.joueurs) {
    const attendu = zero.includes(n) ? 3 : 2;
    assert.equal(r.multi[n], attendu, n);
    const base = [10, 6, 3, 1, 1, 1][r.points[n].place - 1];
    assert.equal(r.points[n].points, base * attendu, `${n} : points ×${attendu}`);
  }
});

test('détective en avant-dernier sauté si tout le monde a déjà 3 rounds', () => {
  const { g, jouer } = setup('mj1,mj2,mj3,mj4,mj5,mj1,mj2,mj3,mj4,mj6,mj7', ['Léa', 'Hugo', 'Inès', 'Malik']);
  for (const r of g.rounds.slice(0, -1)) jouer(r);
  assert.equal(g.rounds.at(-2).status, 'saute');
});

test('limite réglée à 2 rounds : personne ne dépasse 2, et le détective complète à 2 (×2 pour qui n\'a rien joué)', () => {
  const { ctx, g, jouer } = setup('mj1,mj2,mj3,mj4,mj6,mj7', ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé']);
  ctx.cfg.roundsParJoueur = 2;
  for (const r of g.rounds.slice(0, 4)) jouer(r);
  for (const n of ['Léa', 'Hugo', 'Inès', 'Malik', 'Chloé']) assert.ok(mj.joues(g, n) <= 2, `${n} : ${mj.joues(g, n)}`);
  const det = g.rounds[4];
  jouer(det);
  for (const n of det.joueurs) assert.equal(det.multi[n], 2 - (mj.joues(g, n) - 1), n);
});

test('tout le monde à la limite : le round attend, l\'écran le dit, l\'admin peut jouer quand même (Le Mime à 4)', () => {
  const { ctx, g, jouer } = setup('mj1,mj2,mj3,mj4,mj5,mj1', ['Léa', 'Hugo', 'Inès', 'Malik']);
  Object.assign(ctx.cfg, { roundsParJoueur: 2 });
  Object.assign(ctx.cfg.jeux.mj1, { type: 'mime' });
  g.rounds[0].status = 'saute';
  for (const r of g.rounds.slice(1, 5)) jouer(r);
  for (const n of ['Léa', 'Hugo', 'Inès', 'Malik']) assert.equal(mj.joues(g, n), 2, 'tout le monde est à la limite');
  const r = g.rounds[5];
  ctx.now = () => r.at + 3600e3; // l'heure du round est passée
  mj.tick(ctx, g);
  assert.equal(r.status, 'prevu', 'pas sauté : il attend');
  assert.deepEqual(mj.screenView(ctx, g).attente, { n: 6, raison: 'limite', nom: ctx.cfg.jeux.mj1.nom, max: 2, connectes: 4, min: 4 });
  assert.equal(mj.adminAction(ctx, g, { type: 'forcer' }).ok, true);
  assert.equal(r.status, 'annonce');
  assert.equal(r.joueurs.length, 4);
  assert.equal(mj.screenView(ctx, g).attente, null);
});

test('moins de 4 joueurs connectés : le round attend au lieu d\'être sauté, puis part dès que 4 sont là', () => {
  const { ctx, g } = setup('mj1,mj2', []);
  const r = g.rounds[0];
  mj.tick(ctx, g);
  ctx.now = () => r.at;
  mj.tick(ctx, g);
  assert.equal(r.status, 'prevu');
  assert.equal(mj.screenView(ctx, g).attente.raison, 'attente');
  for (const n of ['Léa', 'Hugo', 'Inès']) mj.claim(ctx, g, `tel:${n}`, n);
  mj.tick(ctx, g);
  assert.equal(r.status, 'prevu', '3 connectés : on attend encore');
  assert.equal(mj.screenView(ctx, g).attente.connectes, 3);
  mj.claim(ctx, g, 'tel:Malik', 'Malik');
  mj.tick(ctx, g);
  assert.equal(r.status, 'annonce');
});
