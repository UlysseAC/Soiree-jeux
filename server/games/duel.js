// Jeu 2 — Duel au Far West. Voir docs/jeu2-duel-far-west.md.
import { shuffle, rand, uid, cleanCode } from '../util.js';

export const id = 'duel';
export const name = 'Duel au Far West';
export const minPlayers = 2;

const RESULT_SHOWN = 3500;   // un duel terminé reste affiché ce temps (ms)
const INTRO = 2500;          // face-à-face : noms affichés avant les bruits de pas (ms)
const DECIDE = 250;          // face-à-face : attente des autres appuis après le premier (ms)
const P2_GAP = 6000;         // face-à-face : délai entre deux duels d'un même tour (ms)

export function defaultConfig() {
  return {
    vies: 2,
    simultanes: { t1: 16, t2: 30, t3: 45 },
    seuilSimultane: 16,
    phase2: 8,
    duelsMax: 2,
    tempsTir: 20,
    delaiMin: 5,
    delaiMax: 25,
    dureesTours: [180, 180, 180, 600, 360, 300, 300, 300],
    pauses: [0, 270, 180, 120, 120, 120, 120, 120],
    pauseFaceAFace: 120,
    pasMin: 3,
    pasMax: 10,
    erreursFaceAFace: 2,
    primeTour: 100,
    bonusDeuxVies: 100,
    primeQuart: 600,
    primeDemi: 900,
    primeFinaliste: 1200,
    primeVainqueur: 1600,
    jetons: 300,
    parisMax: 3,
    coefPari: 0.3,
  };
}

export function simRoundsFor(cfg, n) {
  const s = cfg.simultanes;
  return n >= s.t3 ? 3 : n >= s.t2 ? 2 : n >= s.t1 ? 1 : 0;
}

const at = (arr, i) => arr[Math.min(i, arr.length - 1)];
const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function start(ctx, pids) {
  const cfg = ctx.cfg;
  const players = {};
  for (const p of pids) {
    players[p] = { num: cleanCode(ctx.dossards?.[p]), lives: cfg.vies, alive: true, wins: 0, elimRound: null, elimLabel: null, prime: 0, bonus: 0, errors: 0, bet: null, lastOpp: null, met: [] };
  }
  return {
    phase: 'prep',
    n0: pids.length,
    simRounds: simRoundsFor(cfg, pids.length),
    round: 0,
    players,
    rounds: [],
    duels: {},
    queue: [],
    nextDuelAt: 0,
    roundEndsAt: 0,
    pauseUntil: 0,
    after: null,
    p2: null,
    finished: false,
    winner: null,
    feed: [],
  };
}

function feed(g, ctx, text) {
  g.feed.unshift({ t: ctx.now(), text });
  g.feed.length = Math.min(g.feed.length, 30);
}
const alive = g => Object.keys(g.players).filter(p => g.players[p].alive);

// ---------- appariements ----------
// Tire des paires au hasard en évitant la revanche immédiate, puis les duels déjà joués.
export function pairUp(g, pool) {
  let best = null, bestScore = Infinity;
  for (let k = 0; k < 300 && bestScore > 0; k++) {
    const s = shuffle(pool);
    const pairs = [];
    let score = 0;
    for (let i = 0; i + 1 < s.length; i += 2) {
      const [a, b] = [s[i], s[i + 1]];
      if (g.players[a].lastOpp === b) score += 100;
      else if (g.players[a].met.includes(b)) score += 1;
      pairs.push([a, b]);
    }
    if (score < bestScore) { best = { pairs, bye: s.length % 2 ? s.at(-1) : null }; bestScore = score; }
  }
  return best;
}

// Paires d'un tour de phase 1, sans jamais risquer de passer sous `phase2` joueurs.
export function planRound(g, cfg) {
  const al = alive(g);
  const budget = al.length - cfg.phase2;
  if (budget <= 0) return { pairs: [], waiting: al };
  const risky = ([a, b]) => g.players[a].lives === 1 || g.players[b].lives === 1;
  const normal = pairUp(g, al);
  if (normal.pairs.filter(risky).length <= budget) {
    return { pairs: normal.pairs, waiting: normal.bye ? [normal.bye] : [] };
  }
  // Fin de phase 1 : uniquement des duels qui éliminent à coup sûr (1 vie contre 1 vie).
  const ones = al.filter(p => g.players[p].lives === 1);
  const twos = al.filter(p => g.players[p].lives > 1);
  const pairs = [];
  const po = pairUp(g, ones).pairs;
  while (pairs.length < budget && po.length) pairs.push(po.shift());
  const used = new Set(pairs.flat());
  const loneOne = ones.find(p => !used.has(p));
  if (pairs.length < budget && loneOne && twos.length) pairs.push([loneOne, shuffle(twos)[0]]);
  const inDuel = new Set(pairs.flat());
  return { pairs, waiting: al.filter(p => !inDuel.has(p)) };
}

function newDuel(g, ctx, a, b, kind) {
  const d = { id: uid(4), a, b, kind, round: g.round, status: 'live', startedAt: ctx.now(), fireAt: 0, winner: null, loser: null, reason: null, doneAt: 0, presses: {}, decideAt: 0 };
  if (kind === 'face') armFace(ctx, d);
  g.duels[d.id] = d;
  return d;
}

function armFace(ctx, d) {
  const cfg = ctx.cfg, now = ctx.now();
  d.status = 'steps';
  d.startedAt = now;
  d.fireAt = now + INTRO + rand(cfg.pasMin, cfg.pasMax) * 1000;
  d.presses = {};
  d.decideAt = 0;
}

const liveDuels = g => Object.values(g.duels).filter(d => !d.winner);

// ---------- phase 1 ----------
function startRound(g, ctx) {
  const cfg = ctx.cfg, now = ctx.now();
  g.round++;
  const al = alive(g);
  const type = g.round <= g.simRounds && al.length >= cfg.seuilSimultane ? 'sim' : 'seq';
  const plan = planRound(g, cfg);
  if (!plan.pairs.length) return startPhase2(g, ctx);
  const R = { n: g.round, type, duels: [], waiting: plan.waiting, eliminated: [] };
  g.rounds.push(R);
  g.phase = 'p1';
  g.roundEndsAt = now + at(cfg.dureesTours, g.round - 1) * 1000;
  if (type === 'sim') {
    for (const [a, b] of plan.pairs) R.duels.push(newDuel(g, ctx, a, b, 'num').id);
    feed(g, ctx, `Tour ${g.round} : ${plan.pairs.length} duels en même temps !`);
  } else {
    g.queue = plan.pairs;
    g.nextDuelAt = now + rand(cfg.delaiMin, cfg.delaiMax) * 1000;
    feed(g, ctx, `Tour ${g.round} commence`);
  }
}

function scheduleNext(g, ctx) {
  const cfg = ctx.cfg, now = ctx.now();
  const left = Math.max(0, g.roundEndsAt - now) / 1000;
  const slots = Math.max(1, Math.ceil(g.queue.length / cfg.duelsMax));
  const d = Math.min(rand(cfg.delaiMin, cfg.delaiMax), Math.max(cfg.delaiMin / 2, left / slots - cfg.tempsTir / 2));
  g.nextDuelAt = now + Math.max(1, d) * 1000;
}

function endRound(g, ctx) {
  const cfg = ctx.cfg, now = ctx.now();
  const R = g.rounds.at(-1);
  const next = alive(g).length <= cfg.phase2 ? 'p2' : 'p1';
  const pause = R.eliminated.length ? at(cfg.pauses, g.round - 1) : 0;
  if (pause > 0) {
    g.phase = 'pause';
    g.pauseUntil = now + pause * 1000;
    g.after = next;
    feed(g, ctx, 'Pause paris !');
  } else if (next === 'p2') startPhase2(g, ctx);
  else startRound(g, ctx);
}

// ---------- phase 2 ----------
const P2_NAMES = { 16: 'Huitièmes', 8: 'Quarts', 4: 'Demies', 2: 'Finale' };

function startPhase2(g, ctx) {
  const cfg = ctx.cfg;
  const al = alive(g);
  for (const p of al) {
    const P = g.players[p];
    P.prime = g.round * cfg.primeTour;
    if (P.lives >= 2) P.bonus = cfg.bonusDeuxVies;
    P.lives = 1;
    P.errors = cfg.erreursFaceAFace;
  }
  let size = 2;
  while (size < al.length) size *= 2;
  // S'il manque des joueurs pour remplir l'arbre, certains passent d'office (un seul par match).
  const mixed = shuffle(al);
  const byePlayers = mixed.slice(0, size - al.length);
  const pairs = pairUp(g, mixed.slice(size - al.length)).pairs;
  const slots = [
    ...byePlayers.map(a => ({ a, b: null, w: null, duel: null })),
    ...pairs.map(([a, b]) => ({ a, b, w: null, duel: null })),
  ];
  const rounds = [slots];
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => ({ a: null, b: null, w: null, duel: null })));
  g.p2 = { rounds, r: 0, size };
  g.phase = 'p2';
  feed(g, ctx, `Face-à-face ! ${al.length} joueurs`);
  // Qualifiés d'office s'il manque des adversaires.
  rounds[0].forEach((m, i) => { if (m.a && !m.b) advanceBracket(g, 0, i, m.a); });
  g.nextDuelAt = ctx.now() + P2_GAP;
}

function advanceBracket(g, r, i, w) {
  const m = g.p2.rounds[r][i];
  m.w = w;
  const nr = g.p2.rounds[r + 1];
  if (!nr) return;
  const nm = nr[i >> 1];
  if (i % 2) nm.b = w; else nm.a = w;
}

function p2RoundName(g, r) {
  return P2_NAMES[g.p2.size >> r] ?? `Tour ${r + 1}`;
}

function p2Tick(g, ctx) {
  const now = ctx.now(), cfg = ctx.cfg;
  const round = g.p2.rounds[g.p2.r];
  if (liveDuels(g).length) return false;
  const m = round.find(x => !x.w && x.a && x.b);
  if (m) {
    if (now < g.nextDuelAt) return false;
    m.duel = newDuel(g, ctx, m.a, m.b, 'face').id;
    return true;
  }
  if (round.every(x => x.w || (!x.a && !x.b))) {
    if (g.p2.r === g.p2.rounds.length - 1) {
      const w = round[0].w;
      g.players[w].prime = cfg.primeVainqueur;
      g.finished = true;
      g.winner = w;
      g.phase = 'done';
      feed(g, ctx, `🏆 ${ctx.name(w)} remporte le duel !`);
      ctx.sfx?.('victoire');
      return true;
    }
    g.p2.r++;
    g.phase = 'pause';
    g.pauseUntil = now + cfg.pauseFaceAFace * 1000;
    g.after = 'p2next';
    feed(g, ctx, 'Pause paris !');
    return true;
  }
  return false;
}

// ---------- résultats ----------
function resolve(g, ctx, d, winner, reason) {
  const cfg = ctx.cfg, now = ctx.now();
  const loser = winner === d.a ? d.b : d.a;
  Object.assign(d, { winner, loser, reason, status: 'done', doneAt: now });
  const W = g.players[winner], L = g.players[loser];
  W.wins++;
  W.lastOpp = loser; L.lastOpp = winner;
  W.met.push(loser); L.met.push(winner);
  L.lives--;
  if (L.lives <= 0) {
    L.alive = false;
    if (d.kind === 'num') {
      L.elimRound = d.round;
      L.elimLabel = `au tour ${d.round}`;
      L.prime = (d.round - 1) * cfg.primeTour;
      g.rounds.at(-1).eliminated.push(loser);
    } else {
      const label = p2RoundName(g, g.p2.r);
      L.elimLabel = label === 'Finale' ? 'en finale' : `en ${label.toLowerCase().replace(/s$/, '')}`;
      L.prime = { Quarts: cfg.primeQuart, Demies: cfg.primeDemi, Finale: cfg.primeFinaliste }[label] ?? cfg.primeQuart;
    }
    feed(g, ctx, `☠️ ${ctx.name(loser)} est éliminé`);
  } else {
    feed(g, ctx, `${ctx.name(winner)} gagne contre ${ctx.name(loser)}`);
  }
  if (d.kind === 'face') {
    const i = g.p2.rounds[g.p2.r].findIndex(m => m.duel === d.id);
    advanceBracket(g, g.p2.r, i, winner);
    g.nextDuelAt = now + P2_GAP;
  }
}

// ---------- tick ----------
export function tick(ctx, g) {
  if (g.finished || g.phase === 'prep') return false;
  const now = ctx.now(), cfg = ctx.cfg;
  let changed = false;

  for (const d of liveDuels(g)) {
    if (d.kind === 'num') {
      if (now - d.startedAt > cfg.tempsTir * 1000) { d.startedAt = now; changed = true; }
      continue;
    }
    if (d.status === 'steps' && now >= d.fireAt) { d.status = 'fire'; changed = true; }
    if (d.decideAt && now >= d.decideAt) {
      const [w] = Object.entries(d.presses).sort((x, y) => x[1] - y[1])[0];
      resolve(g, ctx, d, w, 'plus rapide');
      changed = true;
    } else if (d.status === 'fire' && now - d.fireAt > cfg.tempsTir * 1000) {
      armFace(ctx, d);
      changed = true;
    }
  }

  if (g.phase === 'pause') {
    if (now >= g.pauseUntil) {
      if (g.after === 'p2') startPhase2(g, ctx);
      else if (g.after === 'p2next') { g.phase = 'p2'; g.nextDuelAt = now + P2_GAP; }
      else startRound(g, ctx);
      return true;
    }
    return changed;
  }

  if (g.phase === 'p1') {
    if (g.queue.length && now >= g.nextDuelAt && liveDuels(g).length < cfg.duelsMax) {
      const [a, b] = g.queue.shift();
      g.rounds.at(-1).duels.push(newDuel(g, ctx, a, b, 'num').id);
      scheduleNext(g, ctx);
      changed = true;
    }
    if (!g.queue.length && !liveDuels(g).length) { endRound(g, ctx); changed = true; }
  } else if (g.phase === 'p2') {
    changed = p2Tick(g, ctx) || changed;
  }
  return changed;
}

// ---------- actions ----------
function myLiveDuel(g, p) {
  return liveDuels(g).find(d => d.a === p || d.b === p);
}

export function playerAction(ctx, g, p, a) {
  const cfg = ctx.cfg, now = ctx.now();
  const P = g.players[p];
  if (!P) return err('Tu ne joues pas à cette partie.');
  if (g.finished) return err('La partie est terminée.');

  if (a.type === 'tir') {
    const d = myLiveDuel(g, p);
    if (!d || d.kind !== 'num') return err("Tu n'es pas en duel.");
    const opp = d.a === p ? d.b : d.a;
    const v = cleanCode(a.value);
    if (!v) return err('Tape un numéro.');
    if (v === cleanCode(g.players[opp].num)) { resolve(g, ctx, d, p, 'bon numéro'); return ok('Touché ! Tu gagnes le duel.'); }
    resolve(g, ctx, d, opp, 'pistolet explosé');
    ctx.sfx?.('boom');
    return err(`💥 Mauvais numéro : ton pistolet explose !`);
  }

  if (a.type === 'gachette') {
    const d = myLiveDuel(g, p);
    if (!d || d.kind !== 'face') return err("Tu n'es pas en face-à-face.");
    // Heure d'appui mesurée sur le téléphone (horloge synchronisée), bornée pour éviter la triche.
    const t = Math.min(now, Math.max(now - 1500, Number(a.t) || now));
    if (t < d.fireAt) {
      P.errors--;
      ctx.sfx?.('boom');
      if (P.errors < 0) {
        resolve(g, ctx, d, d.a === p ? d.b : d.a, 'tir trop tôt');
        return err('💥 Trop tôt ! 3e erreur : tu perds le duel.');
      }
      feed(g, ctx, `💥 ${ctx.name(p)} a tiré trop tôt !`);
      armFace(ctx, d);
      return err(`💥 Trop tôt ! Erreurs restantes : ${P.errors}`);
    }
    if (d.presses[p] == null) d.presses[p] = t;
    if (!d.decideAt) d.decideAt = now + DECIDE;
    return ok('Pan !');
  }

  if (a.type === 'pari') {
    if (P.alive) return err('Tu es encore en jeu.');
    if (P.bet) return err('Ton pari est déjà placé.');
    const alloc = Object.entries(a.alloc || {})
      .map(([pid, m]) => [pid, Math.floor(Number(m))])
      .filter(([, m]) => m > 0);
    if (!alloc.length) return err('Mise au moins un jeton.');
    if (alloc.length > cfg.parisMax) return err(`${cfg.parisMax} joueurs au maximum.`);
    if (alloc.some(([pid]) => !g.players[pid]?.alive)) return err("Tu ne peux parier que sur des joueurs encore en jeu.");
    const total = alloc.reduce((s, [, m]) => s + m, 0);
    if (total > cfg.jetons) return err(`Tu n'as que ${cfg.jetons} $.`);
    P.bet = { at: now, alloc: alloc.map(([pid, m]) => ({ pid, mise: m, winsAt: g.players[pid].wins })) };
    return ok('Pari enregistré !');
  }
  return err('Action inconnue.');
}

export function adminAction(ctx, g, a) {
  const now = ctx.now();
  if (a.type === 'num') {
    const P = g.players[a.pid];
    if (!P) return err('Joueur inconnu.');
    const v = cleanCode(a.value);
    if (v && Object.entries(g.players).some(([p, x]) => p !== a.pid && cleanCode(x.num) === v)) return err(`Le numéro ${v} est déjà pris.`);
    P.num = v;
    return ok('Numéro enregistré.');
  }
  if (a.type === 'lancer') {
    if (g.phase !== 'prep') return err('Déjà lancé.');
    const missing = Object.keys(g.players).filter(p => !g.players[p].num);
    if (missing.length) return err(`Numéro manquant pour : ${missing.map(ctx.name).join(', ')}`);
    startRound(g, ctx);
    return ok('C\'est parti !');
  }
  if (a.type === 'passerPause') {
    if (g.phase !== 'pause') return err('Pas de pause en cours.');
    g.pauseUntil = now;
    return ok('Pause terminée.');
  }
  if (a.type === 'duelSuivant') {
    g.nextDuelAt = now;
    return ok('Prochain duel lancé.');
  }
  if (a.type === 'rejouer') {
    const d = g.duels[a.duel];
    if (!d || d.winner) return err('Duel introuvable ou terminé.');
    if (d.kind === 'face') armFace(ctx, d); else d.startedAt = now;
    return ok('Duel relancé.');
  }
  if (a.type === 'forcer') {
    const d = g.duels[a.duel];
    if (!d || d.winner || (a.winner !== d.a && a.winner !== d.b)) return err('Impossible.');
    resolve(g, ctx, d, a.winner, 'décision de l\'arbitre');
    return ok('Résultat enregistré.');
  }
  if (a.type === 'terminer') {
    g.finished = true;
    g.phase = 'done';
    return ok('Partie arrêtée.');
  }
  return err('Action inconnue.');
}

// ---------- vues ----------
function betValue(g, cfg, P) {
  if (!P.bet) return 0;
  return Math.round(P.bet.alloc.reduce((s, x) => s + x.mise * (1 + cfg.coefPari * (g.players[x.pid].wins - x.winsAt)), 0));
}

function bettors(ctx, g) {
  return Object.entries(g.players)
    .filter(([, P]) => P.bet)
    .map(([p, P]) => ({ pid: p, name: ctx.name(p), value: betValue(g, ctx.cfg, P) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'fr'));
}

// Les numéros de dossard ne sortent jamais vers les téléphones ni l'écran : seulement vers l'admin.
function duelView(ctx, g, d, withNums = false) {
  const P = x => ({ pid: x, name: ctx.name(x), lives: g.players[x].lives, errors: g.players[x].errors, ...(withNums ? { num: g.players[x].num } : {}) });
  return {
    id: d.id, kind: d.kind, status: d.status, startedAt: d.startedAt, fireAt: d.status === 'fire' || d.winner ? d.fireAt : 0,
    a: P(d.a), b: P(d.b), winner: d.winner, reason: d.reason, doneAt: d.doneAt,
    title: d.kind === 'face' ? p2RoundName(g, g.p2.r).replace(/s$/, '') : `Tour ${d.round}`,
  };
}

function shownDuels(ctx, g) {
  const now = ctx.now();
  return Object.values(g.duels)
    .filter(d => !d.winner || now - d.doneAt < RESULT_SHOWN)
    .map(d => duelView(ctx, g, d));
}

function primesTable(cfg, g) {
  return {
    tour: cfg.primeTour, quart: cfg.primeQuart, demi: cfg.primeDemi, finaliste: cfg.primeFinaliste, vainqueur: cfg.primeVainqueur,
  };
}

function bracketView(ctx, g) {
  if (!g.p2) return null;
  const P = x => (x ? { pid: x, name: ctx.name(x), num: g.players[x].num } : null);
  return {
    r: g.p2.r,
    rounds: g.p2.rounds.map((round, r) => ({
      name: p2RoundName(g, r),
      matches: round.map(m => ({ a: P(m.a), b: P(m.b), w: m.w, live: !!(m.duel && !g.duels[m.duel].winner) })),
    })),
  };
}

export function screenView(ctx, g) {
  const cfg = ctx.cfg;
  const al = alive(g).map(p => ({ pid: p, name: ctx.name(p), lives: g.players[p].lives }))
    .sort((a, b) => b.lives - a.lives || a.name.localeCompare(b.name, 'fr'));
  return {
    phase: g.phase, round: g.round, roundType: g.rounds.at(-1)?.type ?? null,
    roundEndsAt: g.roundEndsAt, pauseUntil: g.phase === 'pause' ? g.pauseUntil : 0,
    alive: al, total: g.n0,
    duels: shownDuels(ctx, g),
    rounds: g.rounds.filter(R => R.type === 'seq').slice(-2).map(R => ({
      n: R.n,
      duels: R.duels.map(id => g.duels[id]).map(d => ({ a: ctx.name(d.a), b: ctx.name(d.b), w: d.winner ? ctx.name(d.winner) : null })),
    })),
    roundDuels: g.phase === 'p1' ? (g.rounds.at(-1)?.duels ?? []).map(id => g.duels[id]).map(d => ({
      a: ctx.name(d.a), b: ctx.name(d.b), w: d.winner ? ctx.name(d.winner) : null,
    })) : [],
    bracket: bracketView(ctx, g),
    bettors: bettors(ctx, g).slice(0, 10),
    primes: primesTable(cfg, g),
    phase2Size: cfg.phase2,
    finished: g.finished,
    winner: g.winner ? { name: ctx.name(g.winner), prime: g.players[g.winner].prime + g.players[g.winner].bonus } : null,
    feed: g.feed.slice(0, 6),
    maxLives: cfg.vies,
  };
}

export function playerView(ctx, g, p) {
  const P = g.players[p];
  if (!P) return { spectator: true, finished: g.finished };
  const cfg = ctx.cfg, now = ctx.now();
  const d = myLiveDuel(g, p);
  const last = Object.values(g.duels).filter(x => x.winner && (x.a === p || x.b === p) && now - x.doneAt < 8000).sort((x, y) => y.doneAt - x.doneAt)[0];
  const v = {
    num: P.num, lives: P.lives, maxLives: cfg.vies, alive: P.alive, phase: g.phase, round: g.round,
    errors: P.errors, pauseUntil: g.phase === 'pause' ? g.pauseUntil : 0,
    duel: d ? duelView(ctx, g, d) : null,
    last: last ? { won: last.winner === p, reason: last.reason, opp: ctx.name(last.winner === p ? last.loser : last.winner) } : null,
    finished: g.finished, winner: g.winner ? ctx.name(g.winner) : null, iWon: g.winner === p,
    prime: P.prime + P.bonus, elimLabel: P.elimLabel,
  };
  if (!P.alive || g.finished) {
    const board = bettors(ctx, g);
    v.bet = {
      jetons: cfg.jetons, max: cfg.parisMax, coef: cfg.coefPari,
      placed: P.bet ? P.bet.alloc.map(x => ({
        name: ctx.name(x.pid), mise: x.mise, wins: g.players[x.pid].wins - x.winsAt, alive: g.players[x.pid].alive,
        value: Math.round(x.mise * (1 + cfg.coefPari * (g.players[x.pid].wins - x.winsAt))),
      })) : null,
      value: betValue(g, cfg, P),
      rank: P.bet ? board.findIndex(b => b.pid === p) + 1 : 0,
      count: board.length,
      targets: P.bet ? [] : alive(g).map(x => ({ pid: x, name: ctx.name(x), lives: g.players[x].lives }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    };
  }
  return v;
}

export function adminView(ctx, g) {
  const cfg = ctx.cfg;
  return {
    ...screenView(ctx, g),
    queue: g.queue.length,
    nextDuelAt: g.nextDuelAt,
    simRounds: g.simRounds,
    liveDuels: liveDuels(g).map(d => duelView(ctx, g, d, true)),
    players: Object.entries(g.players).map(([p, P]) => ({
      pid: p, name: ctx.name(p), num: P.num, lives: P.lives, alive: P.alive, wins: P.wins,
      elimLabel: P.elimLabel, prime: P.prime + P.bonus, bet: betValue(g, cfg, P), hasBet: !!P.bet,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}

export function results(ctx, g) {
  return Object.entries(g.players).map(([p, P]) => ({
    pid: p, name: ctx.name(p), prime: P.prime + P.bonus, paris: betValue(g, ctx.cfg, P), won: g.winner === p,
  }));
}
