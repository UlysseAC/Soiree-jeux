import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as chemin from '../server/games/chemin.js';

function setup(n, tweak = c => c) {
  let t = 1_000_000;
  const cfg = tweak(chemin.defaultConfig());
  const names = {};
  const pids = Array.from({ length: n }, (_, i) => { names['p' + i] = 'J' + i; return 'p' + i; });
  const ctx = { now: () => t, cfg, name: p => names[p] };
  const g = chemin.start(ctx, pids);
  return { g, ctx, cfg, advance: ms => { t += ms; chemin.tick(ctx, g); } };
}

test('répartition : détectives proportionnels et même nombre d\'étapes', () => {
  assert.equal(chemin.detectivesFor(5), 0);
  assert.equal(chemin.detectivesFor(6), 1);
  assert.equal(chemin.detectivesFor(8), 1);
  assert.equal(chemin.detectivesFor(20), 5);
  assert.equal(chemin.detectivesFor(24), 9);
  const s = chemin.split(Array.from({ length: 17 }, (_, i) => i));
  assert.equal(s.A.randoms.length, s.B.randoms.length);
  assert.equal(s.A.randoms.length + s.A.detectives.length + s.B.randoms.length + s.B.detectives.length, 17);
});

test('la dernière étape est toujours l\'étape 15', () => {
  const cfg = chemin.defaultConfig();
  assert.equal(chemin.stepOf(cfg, 'A', 6, 8).label, 7);
  assert.equal(chemin.stepOf(cfg, 'A', 7, 8).label, 15);
});

test('une chaîne complète fait gagner l\'équipe', () => {
  const { g, ctx, cfg } = setup(8, c => {
    for (const T of ['A', 'B']) c.teams[T].steps.forEach((s, i) => { s.code = String(1000 + i); });
    c.final.code = '9999';
    return c;
  });
  const team = g.teams.A;
  const R = team.chain.length;
  for (let i = 0; i < R; i++) {
    const p = team.chain[i];
    if (i > 0) {
      assert.equal(chemin.playerAction(ctx, g, p, { type: 'numero', value: '0000' }).ok, false);
      assert.equal(chemin.playerAction(ctx, g, p, { type: 'numero', value: team.nums[i] }).ok, true);
    }
    const code = i === R - 1 ? '9999' : String(1000 + i);
    // Un autre joueur ne peut pas valider l'étape à sa place.
    const other = team.chain[(i + 1) % R];
    if (other !== p) assert.equal(chemin.playerAction(ctx, g, other, { type: 'code', value: code }).ok, false);
    const r = chemin.playerAction(ctx, g, p, { type: 'code', value: code });
    assert.equal(r.ok, true, r.msg);
    if (i < R - 1) {
      const v = chemin.playerView(ctx, g, p);
      assert.equal(v.random.stage, 'sent');
      assert.equal(v.random.next.numero, team.nums[i + 1]);
    }
  }
  assert.equal(g.winner, 'A');
  assert.ok(g.finished);
});

test('pistolet, immunité, gilet et fumigène en attente', () => {
  const { g, ctx, cfg, advance } = setup(16, c => { c.armes.pistolet.code = '111'; c.armes.gilet.code = '222'; c.armes.fumigene.code = '333'; c.bandage.code = '444'; return c; });
  const detA = Object.keys(g.det).find(p => g.roles[p].team === 'A');
  const detB = Object.keys(g.det).find(p => g.roles[p].team === 'B');
  const victim = g.teams.B.chain[0];
  assert.equal(chemin.playerAction(ctx, g, detA, { type: 'arme', value: '111' }).ok, true);
  assert.equal(chemin.playerAction(ctx, g, detA, { type: 'attaque', arme: 'pistolet', target: victim }).ok, true);
  assert.equal(chemin.playerAction(ctx, g, victim, { type: 'code', value: '0' }).ok, false);
  assert.equal(chemin.playerView(ctx, g, victim).block.type, 'pistolet');
  // Bandage : −60 s.
  const before = g.st[victim].block.until;
  assert.equal(chemin.playerAction(ctx, g, victim, { type: 'antidote', value: '444' }).ok, true);
  assert.equal(g.st[victim].block.until, before - 60_000);
  advance(cfg.armes.pistolet.duree * 1000);
  assert.equal(g.st[victim].block, null);
  assert.ok(g.st[victim].immuneUntil > ctx.now());

  // Gilet de l'équipe B, puis fumigène de A : en attente jusqu'à la fin du gilet.
  chemin.playerAction(ctx, g, detB, { type: 'arme', value: '222' });
  chemin.playerAction(ctx, g, detB, { type: 'attaque', arme: 'gilet' });
  chemin.playerAction(ctx, g, detA, { type: 'arme', value: '333' });
  chemin.playerAction(ctx, g, detA, { type: 'attaque', arme: 'fumigene' });
  assert.equal(g.teams.B.pending.length, 1);
  assert.equal(g.st[detB].block, null);
  advance(cfg.armes.gilet.duree * 1000);
  assert.equal(g.st[detB].block?.type, 'fumigene');
  // La victime immunisée n'est pas touchée par le fumigène.
  assert.equal(g.st[victim].block, null);
});

test('menottes : une clé de son équipe libère, une seule fois', () => {
  const { g, ctx } = setup(16, c => { c.armes.menottes.code = '5'; c.cles.B[0].code = '71'; return c; });
  const detA = Object.keys(g.det).find(p => g.roles[p].team === 'A');
  const victim = g.teams.B.chain[1];
  chemin.playerAction(ctx, g, detA, { type: 'arme', value: '5' });
  assert.equal(chemin.playerAction(ctx, g, detA, { type: 'attaque', arme: 'menottes', target: victim }).ok, true);
  assert.equal(chemin.playerAction(ctx, g, detA, { type: 'attaque', arme: 'menottes', target: g.teams.B.chain[2] }).ok, false);
  assert.equal(chemin.playerAction(ctx, g, victim, { type: 'antidote', value: '72' }).ok, false);
  assert.equal(chemin.playerAction(ctx, g, victim, { type: 'antidote', value: '71' }).ok, true);
  assert.deepEqual(g.keysUsed.B, [0]);
});

test('safe zone : impossible à viser', () => {
  const { g, ctx } = setup(16, c => { c.armes.pistolet.code = '1'; return c; });
  const detA = Object.keys(g.det).find(p => g.roles[p].team === 'A');
  const t = g.teams.B.chain[0];
  assert.equal(chemin.orgaAction(ctx, g, { type: 'safe', pid: t, duree: 300 }).ok, true);
  chemin.playerAction(ctx, g, detA, { type: 'arme', value: '1' });
  const r = chemin.playerAction(ctx, g, detA, { type: 'attaque', arme: 'pistolet', target: t });
  assert.equal(r.ok, false);
  assert.equal(g.det[detA].inv.pistolet.cd, 0, "l'arme n'est pas consommée");
});

test('joueur parti : sauter une étape empêche de gagner en finissant', () => {
  const { g, ctx } = setup(8, c => { c.teams.A.steps.forEach((s, i) => { s.code = String(i + 10); }); c.final.code = '99'; return c; });
  const team = g.teams.A;
  const R = team.chain.length;
  assert.equal(chemin.adminAction(ctx, g, { type: 'sauter', pid: team.chain[0] }).ok, true);
  assert.equal(team.cur, 1);
  assert.equal(team.stage, 'hint');
  for (let i = 1; i < R; i++) {
    const p = team.chain[i];
    if (i > 1) chemin.playerAction(ctx, g, p, { type: 'numero', value: team.nums[i] });
    chemin.playerAction(ctx, g, p, { type: 'code', value: i === R - 1 ? '99' : String(i + 10) });
  }
  assert.equal(team.finishedAt > 0, true);
  assert.equal(g.winner, null);
});
