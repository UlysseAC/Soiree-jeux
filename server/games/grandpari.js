// Jeu 3 — Le Grand Pari : trois sports sur lesquels on parie, et des investissements entre les sports.
import { Worker } from 'node:worker_threads';
import { randomInt } from 'node:crypto';
import * as chevaux from './sports/chevaux.js';
import * as foot from './sports/foot.js';
import * as boxe from './sports/boxe.js';

export const id = 'grandpari';
export const name = 'Le Grand Pari';
export const minPlayers = 2;

export const SPORTS = [
  { id: 'chevaux', name: 'Course de chevaux', icon: '🏇' },
  { id: 'foot', name: 'Match de foot', icon: '⚽' },
  { id: 'boxe', name: 'Battle royale de boxe', icon: '🥊' },
];
const ODDS_SIMS = 120;

const J = (nom, attaque, defense) => ({ nom, attaque, defense });

export function defaultConfig() {
  return {
    argentDepart: 1000,
    intervalle: 900,
    fermeture: 15,
    resultats: 15,
    miseMin: 10,
    chevaux: {
      noms: ['Tonnerre', 'Éclair', 'Pégase', 'Caramel', 'Bijou', 'Comète', 'Rafale', 'Mistral'],
      gains: [3, 1.5, 0.5, 0, 0, 0, 0, 0],
      duree: 45,
      tours: 2,
    },
    foot: {
      duree: 150,
      coteVainqueur: 2,
      marge: 0.1,
      equipes: [
        { nom: 'FC Barcelone', couleur: '#a50044', bord: '#004d98', joueurs: [J('Joan García', .1, .7), J('Cubarsí', .35, .8), J('Olmo', .55, .6), J('Raphinha', .8, .4), J('Lamine Yamal', .9, .3)] },
        { nom: 'Real Madrid', couleur: '#f5f5f5', bord: '#c9a227', joueurs: [J('Courtois', .1, .7), J('Rüdiger', .3, .8), J('Valverde', .55, .6), J('Vinícius', .8, .4), J('Mbappé', .9, .3)] },
      ],
    },
    boxe: { duree: 120, premier: 8, top3: 3, top25: 1.5, top50: 1 },
    invest: {
      seuils: { t10: 3, t20: 4, t35: 5, min: 2 },
      catalogue: [
        { nom: 'Food-truck de tacos', emoji: '🌮', gain: 1.8, investisseurs: 40, parJoueur: 150, remboursement: 70 },
        { nom: 'Start-up de trottinettes', emoji: '🚀', gain: 3, investisseurs: 60, parJoueur: 300, remboursement: 20 },
        { nom: 'Brasserie artisanale', emoji: '🍺', gain: 1.5, investisseurs: 30, parJoueur: 100, remboursement: 90 },
        { nom: "Festival d'été", emoji: '🎸', gain: 2.2, investisseurs: 50, parJoueur: 200, remboursement: 50 },
        { nom: 'Appartement à Biarritz', emoji: '🏠', gain: 1.4, investisseurs: 25, parJoueur: 250, remboursement: 95 },
        { nom: 'Studio de jeux vidéo', emoji: '🎮', gain: 2.5, investisseurs: 50, parJoueur: 200, remboursement: 40 },
        { nom: 'Cryptomonnaie douteuse', emoji: '🪙', gain: 4, investisseurs: 35, parJoueur: 150, remboursement: 0 },
        { nom: 'Vignoble bordelais', emoji: '🍷', gain: 1.6, investisseurs: 30, parJoueur: 150, remboursement: 80 },
        { nom: 'Location de yachts', emoji: '🛥️', gain: 2, investisseurs: 45, parJoueur: 300, remboursement: 60 },
        { nom: 'Boulangerie de quartier', emoji: '🥐', gain: 1.3, investisseurs: 20, parJoueur: 80, remboursement: 100 },
      ],
    },
  };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });
const money = n => `${Math.round(n).toLocaleString('fr-FR')} $`;

export function investCount(cfg, n) {
  const s = cfg.invest.seuils;
  return n >= 35 ? s.t35 : n >= 20 ? s.t20 : n >= 10 ? s.t10 : s.min;
}

// Multiplicateur de gain d'un pari boxe selon la place obtenue.
export function boxeMult(cfg, place, n) {
  const b = cfg.boxe;
  if (place === 1) return b.premier;
  if (place <= 3) return b.top3;
  if (place <= Math.ceil(n * .25)) return b.top25;
  if (place <= Math.ceil(n * .5)) return b.top50;
  return 0;
}

// Cotes du foot à partir des matchs simulés : cote = (1 − marge) / probabilité.
export function footOdds(cfg, counts, N) {
  const c = p => Math.max(1.1, Math.min(50, Math.round((1 - cfg.foot.marge) / ((p + .5) / (N + 1)) * 10) / 10));
  const equipes = cfg.foot.equipes;
  return {
    nul: c(counts.nul),
    buteur: equipes.map((T, ti) => T.joueurs.map(j => c(counts.scorer[`${ti}:${j.nom}`] || 0))),
    buts: [0, 1, 2, 3, 4].map(k => c(counts.total[k] || 0)),
  };
}

function computeFootOdds(g, cfg) {
  g.oddsPending = true;
  const seed = randomInt(1e9);
  let w;
  try {
    w = new Worker(new URL('./sports/odds-worker.js', import.meta.url), { workerData: { cfg: cfg.foot, n: ODDS_SIMS, seed } });
  } catch (e) {
    g.oddsPending = false;
    return;
  }
  w.on('message', counts => { g.odds = footOdds(cfg, counts, ODDS_SIMS); g.oddsPending = false; });
  w.on('error', e => { console.error('Calcul des cotes :', e); g.oddsPending = false; });
}

function newBlock(g, cfg, k) {
  const n = g.order.length;
  const count = investCount(cfg, n);
  const cat = cfg.invest.catalogue.map((c, i) => ({ c, i })).filter(({ i }) => !g.usedCat.includes(i));
  const pool = cat.length >= count ? cat : cfg.invest.catalogue.map((c, i) => ({ c, i }));
  const picked = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(randomInt(pool.length), 1)[0]);
  g.usedCat.push(...picked.map(p => p.i));
  g.blocks.push({
    k, settled: false,
    items: picked.map(({ c }, j) => ({
      id: `${k}-${j}`, nom: c.nom, emoji: c.emoji, gain: c.gain, remb: c.remboursement,
      needInvestors: Math.max(2, Math.ceil(c.investisseurs / 100 * n)),
      needAmount: Math.round(n * c.parJoueur / 10) * 10,
      stakes: {}, status: 'ouvert',
    })),
  });
}

export function start(ctx, pids) {
  const cfg = ctx.cfg, now = ctx.now();
  const g = {
    t0: now,
    order: pids.slice(),
    wallets: Object.fromEntries(pids.map(p => [p, cfg.argentDepart])),
    phase: 'entre',
    k: 0,
    sports: SPORTS.map((s, i) => ({ ...s, at: now + (i + 1) * cfg.intervalle * 1000, status: 'avenir', startAt: 0, endAt: 0, seed: randomInt(1e9), result: null })),
    replays: {},
    odds: null,
    oddsPending: false,
    bets: [],
    blocks: [],
    usedCat: [],
    resultUntil: 0,
    feed: [],
    finished: false,
    seq: 0,
  };
  newBlock(g, cfg, 0);
  computeFootOdds(g, cfg);
  return g;
}

const cur = g => g.sports[g.k];
const closeAt = (g, cfg) => cur(g).at - cfg.fermeture * 1000;
const bettingOpen = (g, ctx) => g.phase === 'entre' && ctx.now() < closeAt(g, ctx.cfg);

function feed(g, ctx, text) { g.feed.unshift({ t: ctx.now(), text }); g.feed.length = Math.min(g.feed.length, 20); }

function settleBlock(g, ctx, k) {
  const b = g.blocks.find(x => x.k === k);
  if (!b || b.settled) return;
  b.settled = true;
  for (const it of b.items) {
    const stakes = Object.entries(it.stakes);
    const total = stakes.reduce((s, [, m]) => s + m, 0);
    it.total = total;
    const success = total >= it.needAmount && stakes.length >= it.needInvestors;
    it.status = success ? 'reussi' : 'echoue';
    for (const [p, m] of stakes) g.wallets[p] += Math.round(success ? m * it.gain : m * it.remb / 100);
    if (stakes.length) feed(g, ctx, `${it.emoji} ${it.nom} : ${success ? `réussi, ×${it.gain} !` : `échoué, ${it.remb} % remboursés`}`);
  }
}

function startSport(g, ctx) {
  const cfg = ctx.cfg, now = ctx.now();
  const sp = cur(g);
  settleBlock(g, ctx, g.k);
  let replay;
  if (sp.id === 'chevaux') replay = chevaux.simulate(cfg.chevaux, sp.seed);
  else if (sp.id === 'foot') replay = foot.simulate(cfg.foot, sp.seed);
  else replay = boxe.simulate({ noms: g.order.map(ctx.name), duree: cfg.boxe.duree }, sp.seed);
  g.replays[g.k] = replay;
  sp.result = replay.result;
  sp.status = 'encours';
  sp.startAt = now + 1500;
  sp.endAt = sp.startAt + replay.duration * 1000 + 2000;
  g.phase = 'sport';
  feed(g, ctx, `${sp.icon} ${sp.name} : c'est parti !`);
}

function betWins(g, cfg, bet, sp) {
  const r = sp.result;
  switch (bet.type) {
    case 'cheval': return cfg.chevaux.gains[r.order.indexOf(bet.sel)] ?? 0;
    case 'vainqueur': return r.winner === bet.sel ? bet.cote : 0;
    case 'nul': return r.winner === 'nul' ? bet.cote : 0;
    case 'buteur': { const [ti, i] = bet.sel; const n = cfg.foot.equipes[ti].joueurs[i].nom; return r.goals.some(x => x.ti === ti && x.n === n) ? bet.cote : 0; }
    case 'buts': return Math.min(4, r.score[0] + r.score[1]) === bet.sel ? bet.cote : 0;
    case 'boxeur': return boxeMult(cfg, r.places[bet.sel], r.places.length);
    default: return 0;
  }
}

function settleSport(g, ctx) {
  const cfg = ctx.cfg;
  const sp = cur(g);
  sp.status = 'fini';
  for (const b of g.bets.filter(x => x.k === g.k && x.payout == null)) {
    b.mult = betWins(g, cfg, b, sp);
    b.payout = Math.round(b.mise * b.mult);
    g.wallets[b.pid] += b.payout;
  }
  g.phase = 'resultat';
  g.resultUntil = ctx.now() + cfg.resultats * 1000;
}

export function tick(ctx, g) {
  if (g.finished) return false;
  const now = ctx.now();
  if (g.phase === 'entre' && now >= cur(g).at) { startSport(g, ctx); return true; }
  if (g.phase === 'sport' && now >= cur(g).endAt) { settleSport(g, ctx); return true; }
  if (g.phase === 'resultat' && now >= g.resultUntil) {
    if (g.k >= g.sports.length - 1) {
      g.phase = 'fini';
      g.finished = true;
      g.winner = richest(g)[0];
      ctx.sfx?.('victoire');
      return true;
    }
    g.k++;
    g.phase = 'entre';
    newBlock(g, ctx.cfg, g.k);
    return true;
  }
  return false;
}

// ---------- actions des joueurs ----------
function betLabel(cfg, g, b) {
  const eq = cfg.foot.equipes;
  switch (b.type) {
    case 'cheval': return `${cfg.chevaux.noms[b.sel]} (n°${b.sel + 1})`;
    case 'vainqueur': return `Victoire ${eq[b.sel].nom}`;
    case 'nul': return 'Match nul';
    case 'buteur': return `${eq[b.sel[0]].joueurs[b.sel[1]].nom} marque`;
    case 'buts': return `${b.sel === 4 ? '4 buts ou plus' : `${b.sel} but${b.sel > 1 ? 's' : ''}`} dans le match`;
    case 'boxeur': return `${g.names?.[b.sel] ?? ''}`;
    default: return '';
  }
}

export function playerAction(ctx, g, p, a) {
  const cfg = ctx.cfg, now = ctx.now();
  if (!(p in g.wallets)) return err('Tu ne joues pas à cette partie.');
  if (g.finished) return err('La partie est terminée.');
  const mise = Math.floor(Number(a.mise));

  if (a.type === 'pari') {
    if (!bettingOpen(g, ctx)) return err('Les paris sont fermés pour ce sport.');
    if (!(mise >= cfg.miseMin)) return err(`Mise minimum : ${money(cfg.miseMin)}.`);
    if (mise > g.wallets[p]) return err(`Tu n'as que ${money(g.wallets[p])}.`);
    const sp = cur(g);
    const bet = { id: ++g.seq, pid: p, k: g.k, sport: sp.id, type: a.bet, mise, payout: null, at: now };
    if (sp.id === 'chevaux') {
      const i = Number(a.sel);
      if (a.bet !== 'cheval' || !(i >= 0 && i < cfg.chevaux.noms.length)) return err('Choisis un cheval.');
      Object.assign(bet, { sel: i, cote: cfg.chevaux.gains[0] });
    } else if (sp.id === 'foot') {
      if (a.bet === 'vainqueur') {
        const s = Number(a.sel);
        if (s !== 0 && s !== 1) return err('Choisis une équipe.');
        Object.assign(bet, { sel: s, cote: cfg.foot.coteVainqueur });
      } else {
        if (!g.odds) return err('Les cotes sont en cours de calcul, réessaie dans quelques secondes.');
        if (a.bet === 'nul') Object.assign(bet, { sel: null, cote: g.odds.nul });
        else if (a.bet === 'buteur') {
          const [ti, i] = String(a.sel).split(':').map(Number);
          const c = g.odds.buteur[ti]?.[i];
          if (!c) return err('Choisis un joueur.');
          Object.assign(bet, { sel: [ti, i], cote: c });
        } else if (a.bet === 'buts') {
          const k = Number(a.sel);
          if (!(k >= 0 && k <= 4)) return err('Choisis un nombre de buts.');
          Object.assign(bet, { sel: k, cote: g.odds.buts[k] });
        } else return err('Pari inconnu.');
      }
    } else {
      const i = Number(a.sel);
      if (a.bet !== 'boxeur' || !(i >= 0 && i < g.order.length)) return err('Choisis un combattant.');
      Object.assign(bet, { sel: i, cote: cfg.boxe.premier });
    }
    g.wallets[p] -= mise;
    g.bets.push(bet);
    return ok(`Pari enregistré : ${money(mise)}.`);
  }

  if (a.type === 'investir') {
    const block = g.blocks.find(b => b.k === g.k && !b.settled);
    if (!block || g.phase !== 'entre') return err('Pas d\'investissement ouvert en ce moment.');
    const it = block.items.find(x => x.id === a.item);
    if (!it) return err('Investissement introuvable.');
    if (!(mise >= cfg.miseMin)) return err(`Minimum : ${money(cfg.miseMin)}.`);
    if (mise > g.wallets[p]) return err(`Tu n'as que ${money(g.wallets[p])}.`);
    g.wallets[p] -= mise;
    it.stakes[p] = (it.stakes[p] || 0) + mise;
    return ok(`${money(mise)} investis dans ${it.nom}.`);
  }
  return err('Action inconnue.');
}

export function adminAction(ctx, g, a) {
  const now = ctx.now();
  if (a.type === 'lancerSport') {
    if (g.phase !== 'entre') return err('Un sport est déjà en cours.');
    cur(g).at = now;
    tick(ctx, g);
    return ok('C\'est parti !');
  }
  if (a.type === 'decaler') {
    if (g.phase !== 'entre') return err('Attends la fin du sport en cours.');
    const d = Number(a.sec || 0) * 1000;
    for (const s of g.sports.slice(g.k)) s.at = Math.max(now + 20000, s.at + d);
    return ok('Horaires décalés.');
  }
  if (a.type === 'terminer') {
    g.phase = 'fini';
    g.finished = true;
    g.winner = richest(g)[0];
    return ok('Partie terminée.');
  }
  return err('Action inconnue.');
}

// ---------- vues ----------
function richest(g) {
  return Object.entries(g.wallets).sort((a, b) => b[1] - a[1]).map(([pid]) => pid);
}

function blockView(g, p) {
  const b = g.blocks.find(x => x.k === g.k) ?? g.blocks.at(-1);
  if (!b) return null;
  return {
    k: b.k, settled: b.settled, until: g.sports[b.k].at,
    items: b.items.map(it => {
      const stakes = Object.values(it.stakes);
      return {
        id: it.id, nom: it.nom, emoji: it.emoji, gain: it.gain, remb: it.remb,
        needInvestors: it.needInvestors, needAmount: it.needAmount,
        investors: stakes.length, total: stakes.reduce((s, m) => s + m, 0),
        status: it.status, mine: p ? it.stakes[p] || 0 : undefined,
      };
    }),
  };
}

function options(ctx, g) {
  const cfg = ctx.cfg, sp = cur(g);
  if (sp.id === 'chevaux') {
    return { chevaux: cfg.chevaux.noms.map((n, i) => ({ i, nom: n, couleur: chevaux.COLORS[i] })), gains: cfg.chevaux.gains };
  }
  if (sp.id === 'foot') {
    return {
      equipes: cfg.foot.equipes.map(T => ({ nom: T.nom, couleur: T.couleur, bord: T.bord, joueurs: T.joueurs.map(j => j.nom) })),
      coteVainqueur: cfg.foot.coteVainqueur, odds: g.odds, oddsPending: !g.odds,
    };
  }
  const n = g.order.length;
  return {
    boxeurs: g.order.map((pid, i) => ({ i, nom: ctx.name(pid), couleur: boxe.colorFor(i, n) })),
    gains: { premier: cfg.boxe.premier, top3: cfg.boxe.top3, top25: cfg.boxe.top25, top50: cfg.boxe.top50, n25: Math.ceil(n * .25), n50: Math.ceil(n * .5) },
  };
}

function sportsView(g) {
  return g.sports.map(s => ({ id: s.id, name: s.name, icon: s.icon, at: s.at, status: s.status, startAt: s.startAt, endAt: s.endAt }));
}

function resultView(ctx, g, k) {
  const sp = g.sports[k];
  if (!sp?.result) return null;
  const r = sp.result, cfg = ctx.cfg;
  if (sp.id === 'chevaux') return { sport: sp.id, podium: r.order.slice(0, 3).map(i => ({ nom: cfg.chevaux.noms[i], couleur: chevaux.COLORS[i], mult: cfg.chevaux.gains[r.order.indexOf(i)] })) };
  if (sp.id === 'foot') return { sport: sp.id, score: r.score, equipes: cfg.foot.equipes.map(T => T.nom), goals: r.goals, winner: r.winner };
  const n = g.order.length;
  const podium = r.places.map((pl, i) => ({ pl, i })).sort((a, b) => a.pl - b.pl).slice(0, 3)
    .map(({ i, pl }) => ({ nom: ctx.name(g.order[i]), couleur: boxe.colorFor(i, n), place: pl, kos: r.kos[i] }));
  return { sport: sp.id, podium };
}

function sportGains(g, k) {
  const by = {};
  for (const b of g.bets.filter(x => x.k === k && x.payout != null)) by[b.pid] = (by[b.pid] || 0) + b.payout - b.mise;
  return by;
}

export function screenView(ctx, g) {
  const cfg = ctx.cfg;
  const top = richest(g).slice(0, 10).map(p => ({ pid: p, name: ctx.name(p), value: g.wallets[p] }));
  const v = {
    phase: g.phase, k: g.k, sports: sportsView(g), closeAt: closeAt(g, cfg),
    block: g.phase === 'entre' ? blockView(g) : null,
    richest: top, finished: g.finished,
    betsCount: g.bets.filter(b => b.k === g.k).length,
    betsTotal: g.bets.filter(b => b.k === g.k).reduce((s, b) => s + b.mise, 0),
    feed: g.feed.slice(0, 6),
    options: g.phase === 'entre' ? options(ctx, g) : null,
  };
  if (g.phase === 'sport' || g.phase === 'resultat') v.replay = { k: g.k, startAt: cur(g).startAt, sport: cur(g).id };
  if (g.phase === 'resultat') {
    v.result = resultView(ctx, g, g.k);
    const gains = sportGains(g, g.k);
    v.bigWinners = Object.entries(gains).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, x]) => ({ name: ctx.name(p), gain: x }));
  }
  if (g.finished) v.final = richest(g).map(p => ({ name: ctx.name(p), value: g.wallets[p] }));
  return v;
}

export function playerView(ctx, g, p) {
  if (!(p in g.wallets)) return { spectator: true, finished: g.finished };
  const cfg = ctx.cfg, now = ctx.now();
  const sp = cur(g);
  const rank = richest(g).indexOf(p) + 1;
  const fighter = g.order.indexOf(p);
  const names = g.order.map(ctx.name);
  const withNames = { ...g, names };
  const v = {
    wallet: g.wallets[p], rank, count: g.order.length,
    phase: g.phase, k: g.k, sports: sportsView(g),
    sport: { id: sp.id, name: sp.name, icon: sp.icon, at: sp.at, closeAt: closeAt(g, cfg) },
    open: bettingOpen(g, ctx),
    miseMin: cfg.miseMin,
    options: options(ctx, g),
    block: blockView(g, p),
    bets: g.bets.filter(b => b.pid === p).sort((a, b) => b.id - a.id).map(b => ({
      id: b.id, k: b.k, icon: g.sports[b.k].icon, label: betLabel(cfg, withNames, b), mise: b.mise, cote: b.cote, payout: b.payout,
    })),
    fighter: sp.id === 'boxe' && fighter >= 0 ? { couleur: boxe.colorFor(fighter, g.order.length) } : null,
    finished: g.finished,
    result: g.phase === 'resultat' ? resultView(ctx, g, g.k) : null,
    lastGain: g.phase === 'resultat' ? sportGains(g, g.k)[p] ?? null : null,
  };
  if (g.finished) v.final = { rank, wallet: g.wallets[p], start: cfg.argentDepart };
  void now;
  return v;
}

export function adminView(ctx, g) {
  const cfg = ctx.cfg;
  return {
    ...screenView(ctx, g),
    oddsPending: g.oddsPending, odds: g.odds,
    block: blockView(g),
    players: richest(g).map(p => ({
      pid: p, name: ctx.name(p), wallet: g.wallets[p],
      bets: g.bets.filter(b => b.pid === p && b.k === g.k).reduce((s, b) => s + b.mise, 0),
    })),
    sportBets: g.sports.map((s, k) => ({ name: s.name, icon: s.icon, count: g.bets.filter(b => b.k === k).length, total: g.bets.filter(b => b.k === k).reduce((x, b) => x + b.mise, 0) })),
    argentDepart: cfg.argentDepart,
  };
}

// Données lourdes (le film d'un sport), envoyées une seule fois à l'écran public.
export function data(ctx, g, q) {
  const k = Number(q?.k);
  if (!g.replays[k] || g.sports[k].status === 'avenir') return null;
  return g.replays[k];
}

export function results(ctx, g) {
  return Object.entries(g.wallets).map(([pid, w]) => ({ pid, name: ctx.name(pid), argent: w, won: g.winner === pid }));
}
