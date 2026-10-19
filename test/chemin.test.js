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

test('répartition : détectives proportionnels, toujours 15 étapes par équipe', () => {
  assert.equal(chemin.detectivesFor(2), 0);
  assert.equal(chemin.detectivesFor(3), 1);
  assert.equal(chemin.detectivesFor(8), 1);
  assert.equal(chemin.detectivesFor(15), 1);
  assert.equal(chemin.detectivesFor(16), 1);
  assert.equal(chemin.detectivesFor(17), 2);
  assert.equal(chemin.detectivesFor(20), 5);
  assert.equal(chemin.detectivesFor(24), 9);
  const s = chemin.split(Array.from({ length: 17 }, (_, i) => i));
  assert.equal(s.A.randoms.length + s.A.detectives.length + s.B.randoms.length + s.B.detectives.length, 17);
  assert.deepEqual([s.A.detectives.length, s.B.detectives.length], [1, 1], '9 et 8 joueurs : 1 détective chacun, plus de détective « en trop »');
  for (const n of [4, 9, 17, 31, 40]) {
    const { g } = setup(n);
    for (const T of ['A', 'B']) assert.equal(g.teams[T].chain.length, 15, `${n} joueurs : 15 étapes pour l'équipe ${T}`);
  }
});

test('étapes à tour de rôle : jamais deux de suite, bien espacées, autant chacun à une près', () => {
  const r = ['a', 'b', 'c', 'd', 'e', 'f'];
  const ch = chemin.chaineDe(r);
  assert.deepEqual(ch, ['a', 'b', 'c', 'd', 'e', 'f', 'a', 'b', 'c', 'd', 'e', 'f', 'a', 'b', 'c']);
  for (const n of [2, 3, 4, 5, 7, 8, 11, 14, 15]) {
    const c = chemin.chaineDe(r.concat('ghijklmnop'.split('')).slice(0, n));
    const nb = c.reduce((m, p) => ({ ...m, [p]: (m[p] || 0) + 1 }), {});
    assert.ok(Math.max(...Object.values(nb)) - Math.min(...Object.values(nb)) <= 1, `${n} randoms : autant d'étapes chacun à une près`);
    assert.ok(c.every((p, i) => i === 0 || p !== c[i - 1]), `${n} randoms : jamais deux étapes de suite`);
    assert.equal(Object.keys(nb).length, n, 'tout le monde a au moins une étape');
  }
});

test('un seul random : il enchaîne les 15 étapes sans se donner de numéro', () => {
  const { g, ctx } = setup(2, c => { c.teams.A.steps.forEach((s, i) => { s.code = String(1000 + i); }); c.final.code = '9999'; return c; });
  const team = g.teams.A, p = team.chain[0];
  assert.ok(team.chain.every(x => x === p));
  for (let i = 0; i < 15; i++) {
    assert.equal(team.stage, 'hint', `étape ${i + 1} : indice tout de suite`);
    assert.equal(chemin.playerAction(ctx, g, p, { type: 'code', value: i === 14 ? '9999' : String(1000 + i) }).ok, true);
  }
  assert.equal(g.winner, 'A');
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
  const { g, ctx, cfg, advance } = setup(34, c => { c.armes.pistolet.code = '111'; c.armes.gilet.code = '222'; c.armes.fumigene.code = '333'; c.bandage.code = '444'; return c; });
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
  const { g, ctx } = setup(34, c => { c.armes.menottes.code = '5'; c.cles.B[0].code = '71'; return c; });
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
  const { g, ctx } = setup(34, c => { c.armes.pistolet.code = '1'; return c; });
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

test('indice bonus : le joueur suivant attend la pénalité avant de voir son indice', () => {
  const { g, ctx, advance } = setup(8, c => {
    for (const T of ['A', 'B']) c.teams[T].steps.forEach((s, i) => { s.code = String(1000 + i); s.aide = 'Regarde sous le tapis'; s.indice = 'Indice ' + i; });
    return c;
  });
  const team = g.teams.A;
  const [p0, p1, p2] = team.chain;
  assert.equal(chemin.playerView(ctx, g, p0).random.aide, '');
  assert.ok(chemin.playerAction(ctx, g, p0, { type: 'aide' }).ok);
  assert.equal(chemin.playerView(ctx, g, p0).random.aide, 'Regarde sous le tapis');
  assert.ok(chemin.playerAction(ctx, g, p0, { type: 'code', value: '1000' }).ok);
  assert.equal(chemin.playerView(ctx, g, p0).random.penalite, 60);
  assert.ok(chemin.playerAction(ctx, g, p1, { type: 'numero', value: team.nums[1] }).ok);
  let v = chemin.playerView(ctx, g, p1).random;
  assert.ok(v.attente);
  assert.equal(v.indice, undefined);
  assert.equal(chemin.playerAction(ctx, g, p1, { type: 'code', value: '1001' }).ok, false);
  advance(59_000);
  assert.ok(chemin.playerView(ctx, g, p1).random.attente);
  advance(1_000);
  v = chemin.playerView(ctx, g, p1).random;
  assert.equal(v.attente, undefined);
  assert.equal(v.indice, 'Indice 1');
  // Sans indice bonus, pas de pénalité pour le suivant.
  assert.ok(chemin.playerAction(ctx, g, p1, { type: 'code', value: '1001' }).ok);
  assert.ok(chemin.playerAction(ctx, g, p2, { type: 'numero', value: team.nums[2] }).ok);
  assert.equal(chemin.playerView(ctx, g, p2).random.attente, undefined);
});

test('joueur parti : ses étapes sont réparties entre les autres, jamais deux de suite', () => {
  const { g, ctx } = setup(12); // 6 randoms par équipe (avant 1 détective) : 5 randoms, 3 étapes chacun
  const team = g.teams.A, parti = team.chain[1];
  const avant = team.chain.filter(x => x === parti).length;
  assert.ok(avant >= 2);
  const r = chemin.adminAction(ctx, g, { type: 'remplacer', pid: parti, remplacant: 'auto' });
  assert.equal(r.ok, true, r.msg);
  assert.ok(!team.chain.includes(parti));
  assert.ok(team.chain.every((p, i) => i === 0 || p !== team.chain[i - 1]), team.chain.join(' '));
  const nb = Object.values(team.chain.reduce((m, p) => ({ ...m, [p]: (m[p] || 0) + 1 }), {}));
  assert.ok(Math.max(...nb) - Math.min(...nb) <= 1, 'toujours bien réparti');
});

test('débloquer : donne le numéro au joueur qui l\'attend (il fait SON étape), sinon valide l\'étape sans le code ; tout est dans l\'historique', () => {
  const { g, ctx } = setup(10, c => { for (const T of ['A', 'B']) c.teams[T].steps.forEach((s, i) => { s.code = String(1000 + i); }); return c; });
  const team = g.teams.A, [p0, p1] = team.chain;
  assert.equal(chemin.playerAction(ctx, g, p0, { type: 'code', value: '1000' }).ok, true);
  assert.equal(team.stage, 'number', `${ctx.name(p1)} attend son numéro`);
  let v = chemin.adminView(ctx, g).teams.A;
  assert.match(v.debloquer, new RegExp(`^Donner son numéro à ${ctx.name(p1)}`));
  assert.equal(chemin.adminAction(ctx, g, { type: 'validerEtape', team: 'A' }).ok, true);
  assert.equal(team.cur, 1, 'l\'étape de p1 n\'est pas sautée');
  assert.equal(team.stage, 'hint', 'p1 voit son indice');
  v = chemin.adminView(ctx, g).teams.A;
  assert.match(v.debloquer, new RegExp(`^Valider l'étape 2 de ${ctx.name(p1)} sans le code`));
  chemin.adminAction(ctx, g, { type: 'validerEtape', team: 'A' });
  assert.equal(team.cur, 2);
  const h = chemin.adminView(ctx, g).histo.map(x => x.text);
  assert.deepEqual(h, [`Admin : étape 2 de ${ctx.name(p1)} validée sans le code`, `Admin : numéro donné à ${ctx.name(p1)}, il voit l'indice de l'étape 2`, `${ctx.name(p0)} a validé l'étape 1 avec le bon code`]);
});
