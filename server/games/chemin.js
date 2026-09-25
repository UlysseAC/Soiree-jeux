// Jeu 1 — Le Chemin. Voir docs/jeu1-le-chemin.md.
import { shuffle, randomCode, cleanCode } from '../util.js';

export const id = 'chemin';
export const name = 'Le Chemin';
export const minPlayers = 2;

const TEAMS = ['A', 'B'];
const other = t => (t === 'A' ? 'B' : 'A');

export const WEAPONS = {
  pistolet: { label: 'Pistolet', icon: '🔫', target: true },
  menottes: { label: 'Menottes', icon: '⛓️', target: true },
  loupe: { label: 'Loupe', icon: '🔍', target: true },
  fumigene: { label: 'Fumigène', icon: '💨', target: false },
  gilet: { label: 'Gilet pare-balles', icon: '🦺', target: false },
  voyance: { label: 'Don de voyance', icon: '🔮', target: false, passive: true },
};
const BLOCK_LABEL = { pistolet: 'Touché par un pistolet', menottes: 'Menotté', fumigene: 'Dans la fumée' };

export function defaultConfig() {
  const steps = () => Array.from({ length: 14 }, (_, i) => ({
    numero: '',
    indice: i === 0 ? 'Tu es le premier ! ' : '',
    code: '',
    longue: false,
  }));
  return {
    teams: { A: { steps: steps(), finalNumero: '' }, B: { steps: steps(), finalNumero: '' } },
    final: { indice: '', code: '', longue: false },
    armes: {
      pistolet: { code: '', duree: 240, recharge: 300 },
      fumigene: { code: '', duree: 60, recharge: 600 },
      menottes: { code: '' },
      loupe: { code: '', recharge: 180 },
      gilet: { code: '', duree: 60, recharge: 480 },
      voyance: { code: '' },
    },
    cles: {
      A: [{ code: '', lieu: '' }, { code: '', lieu: '' }, { code: '', lieu: '' }],
      B: [{ code: '', lieu: '' }, { code: '', lieu: '' }, { code: '', lieu: '' }],
    },
    bandage: { code: '', lieu: '', reduction: 60 },
    antiFumigene: { code: '', lieu: '', fraction: 0.33 },
    immunite: 120,
    safeZone: { duree: 300, lieu: 'la cuisine' },
    dureeMax: 3600,
    erreursNumero: 3,
    blocageErreurs: 30,
  };
}

// Détectives par équipe selon sa taille (0 sous 6 joueurs, 5 à 20, 15 randoms max).
export function detectivesFor(n) {
  if (n < 6) return 0;
  return Math.max(Math.floor(1 + (n - 6) * 2 / 7), n - 15);
}

// Répartition : 2 équipes, même nombre de randoms (étapes) dans chacune.
export function split(pids) {
  const s = shuffle(pids);
  const half = Math.ceil(s.length / 2);
  const groups = { A: s.slice(0, half), B: s.slice(half) };
  const R = Math.min(...TEAMS.map(t => groups[t].length - detectivesFor(groups[t].length)));
  const out = {};
  for (const t of TEAMS) out[t] = { randoms: groups[t].slice(0, R), detectives: groups[t].slice(R) };
  return out;
}

// Étape affichée et config de l'étape pour l'index `i` d'une chaîne de longueur R.
// La dernière étape est toujours l'étape 15, commune aux deux équipes.
export function stepOf(cfg, team, i, R) {
  if (i === R - 1) return { label: 15, conf: cfg.final, numero: cfg.teams[team].finalNumero };
  const conf = cfg.teams[team].steps[i];
  return { label: i + 1, conf, numero: conf.numero };
}

export function start(ctx, pids) {
  const cfg = ctx.cfg;
  const parts = split(pids);
  const now = ctx.now();
  const g = {
    startedAt: now,
    endsAt: now + cfg.dureeMax * 1000,
    finished: false,
    winner: null,
    endReason: null,
    roles: {},
    teams: {},
    det: {},
    st: {},
    keysUsed: { A: [], B: [] },
    feed: [],
  };
  for (const t of TEAMS) {
    const chain = parts[t].randoms;
    const R = chain.length;
    const taken = new Set();
    const nums = chain.map((_, i) => {
      if (i === 0) return null;
      let n = cleanCode(stepOf(cfg, t, i, R).numero);
      if (!n || taken.has(n)) n = randomCode(4, taken);
      taken.add(n);
      return n;
    });
    g.teams[t] = {
      chain, nums, cur: 0, stage: 'hint',
      skipped: chain.map(() => false), done: chain.map(() => null),
      finishedAt: null, protectUntil: 0, pending: [],
    };
    for (const p of chain) g.roles[p] = { team: t, role: 'random' };
    for (const p of parts[t].detectives) {
      g.roles[p] = { team: t, role: 'detective' };
      g.det[p] = { inv: {}, notes: [], visions: [] };
    }
  }
  for (const p of pids) g.st[p] = { block: null, immuneUntil: 0, safeUntil: 0, errors: 0, lockUntil: 0 };
  return g;
}

// ---------- état ----------
const isBlocked = (g, p, now) => {
  const b = g.st[p]?.block;
  return !!b && (b.until == null || b.until > now);
};
const available = (g, p, now) =>
  !isBlocked(g, p, now) && g.st[p].immuneUntil <= now && g.st[p].safeUntil <= now;

function progress(team) {
  return team.done.filter((d, i) => d && !team.skipped[i]).length;
}

function feed(g, ctx, text) {
  g.feed.unshift({ t: ctx.now(), text });
  g.feed.length = Math.min(g.feed.length, 30);
}

function advance(g, ctx, T, fromIndex) {
  const team = g.teams[T];
  let j = fromIndex + 1;
  while (j < team.chain.length && team.skipped[j]) j++;
  team.cur = j;
  team.stage = 'number';
  if (j >= team.chain.length) {
    team.finishedAt = ctx.now();
    const clean = !team.skipped.some(Boolean);
    if (clean && !g.winner) finish(g, ctx, T, 'chemin');
    else if (!clean) feed(g, ctx, `L'équipe ${T} a fini la chaîne, avec une étape sautée`);
  }
}

function finish(g, ctx, winner, reason) {
  g.finished = true;
  g.winner = winner;
  g.endReason = reason;
  g.finishedAt = ctx.now();
  if (winner) feed(g, ctx, `🏆 L'équipe ${winner} gagne !`);
  ctx.sfx?.('victoire');
}

function applyBlock(g, ctx, p, type) {
  const cfg = ctx.cfg, now = ctx.now();
  const until = type === 'menottes' ? null : now + cfg.armes[type].duree * 1000;
  g.st[p].block = { type, until, from: now, antidoteUsed: false };
  const T = g.roles[p].team;
  if (type !== 'fumigene') feed(g, ctx, `${WEAPONS[type].icon} Quelqu'un de l'équipe ${T} a été ${type === 'menottes' ? 'menotté' : 'touché'} !`);
  notifyVoyants(g, ctx, T, [p], type);
}

function applyFumigene(g, ctx, T) {
  const now = ctx.now();
  const hit = Object.keys(g.roles).filter(p => g.roles[p].team === T && available(g, p, now));
  for (const p of hit) {
    g.st[p].block = { type: 'fumigene', until: now + ctx.cfg.armes.fumigene.duree * 1000, from: now, antidoteUsed: false };
  }
  feed(g, ctx, `💨 L'équipe ${T} est dans la fumée !`);
  if (hit.length) notifyVoyants(g, ctx, T, hit, 'fumigene');
}

function antidoteLieu(g, cfg, T, type) {
  if (type === 'pistolet') return cfg.bandage.lieu ? `Un bandage se trouve ${cfg.bandage.lieu}.` : '';
  if (type === 'fumigene') return cfg.antiFumigene.lieu ? `L'antidote se trouve ${cfg.antiFumigene.lieu}.` : '';
  const i = cfg.cles[T].findIndex((k, idx) => k.code && !g.keysUsed[T].includes(idx));
  if (i < 0) return 'Il ne reste plus de clé.';
  return cfg.cles[T][i].lieu ? `La clé se trouve ${cfg.cles[T][i].lieu}.` : '';
}

function notifyVoyants(g, ctx, T, victims, type) {
  const names = victims.map(ctx.name).join(', ');
  const lieu = antidoteLieu(g, ctx.cfg, T, type);
  for (const [p, d] of Object.entries(g.det)) {
    if (g.roles[p].team !== T || !d.inv.voyance) continue;
    d.visions.unshift({ t: ctx.now(), text: `${names} : ${BLOCK_LABEL[type].toLowerCase()}. ${lieu}`.trim() });
    d.visions.length = Math.min(d.visions.length, 10);
  }
}

// ---------- tick ----------
export function tick(ctx, g) {
  if (g.finished) return false;
  const now = ctx.now();
  let changed = false;
  for (const [p, s] of Object.entries(g.st)) {
    if (s.block && s.block.until != null && s.block.until <= now) {
      s.block = null;
      s.immuneUntil = now + ctx.cfg.immunite * 1000;
      changed = true;
    }
  }
  for (const T of TEAMS) {
    const team = g.teams[T];
    if (team.pending.length && team.protectUntil <= now) {
      for (const a of team.pending) {
        if (a.type === 'fumigene') applyFumigene(g, ctx, T);
        else if (available(g, a.target, now)) applyBlock(g, ctx, a.target, a.type);
      }
      team.pending = [];
      changed = true;
    }
  }
  if (now >= g.endsAt) {
    const [a, b] = TEAMS.map(T => g.teams[T]);
    const pa = progress(a), pb = progress(b);
    let w = null;
    if (pa !== pb) w = pa > pb ? 'A' : 'B';
    else {
      const last = t => Math.max(0, ...t.done.filter(Boolean));
      if (pa > 0) w = last(a) <= last(b) ? 'A' : 'B';
    }
    finish(g, ctx, w, 'temps');
    changed = true;
  }
  return changed;
}

// ---------- actions joueurs ----------
const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, p, a) {
  const now = ctx.now(), cfg = ctx.cfg;
  if (g.finished) return err('La partie est terminée.');
  const role = g.roles[p];
  if (!role) return err("Tu ne joues pas à cette partie.");
  const s = g.st[p];

  if (a.type === 'antidote') return antidote(ctx, g, p, cleanCode(a.value));
  if (isBlocked(g, p, now)) return err('Tu es bloqué, tu ne peux rien faire.');

  if (a.type === 'numero' || a.type === 'code') {
    const T = role.team, team = g.teams[T];
    const i = team.cur;
    const mine = team.chain[i] === p;
    const v = cleanCode(a.value);
    if (a.type === 'numero') {
      if (s.lockUntil > now) return err('Trop d\'erreurs, attends un peu.');
      if (mine && team.stage === 'number' && v === team.nums[i]) {
        team.stage = 'hint';
        s.errors = 0;
        return ok('Numéro correct !');
      }
      s.errors++;
      if (s.errors >= cfg.erreursNumero) {
        s.errors = 0;
        s.lockUntil = now + cfg.blocageErreurs * 1000;
        return err(`Numéro incorrect. Trop d'erreurs : attends ${cfg.blocageErreurs} s.`);
      }
      return err('Numéro incorrect.');
    }
    const step = stepOf(cfg, T, i, team.chain.length);
    if (mine && team.stage === 'hint' && v && v === cleanCode(step.conf.code)) {
      team.done[i] = now;
      advance(g, ctx, T, i);
      if (!g.finished) feed(g, ctx, `✅ Équipe ${T} : étape ${progress(team)} / ${team.chain.length}`);
      return ok('Code correct !');
    }
    return err('Code incorrect.');
  }

  if (role.role !== 'detective') return err('Action réservée aux détectives.');
  const d = g.det[p];

  if (a.type === 'arme') {
    const v = cleanCode(a.value);
    const w = Object.keys(WEAPONS).find(k => v && cleanCode(cfg.armes[k].code) === v);
    if (!w) return err('Ce code ne correspond à aucune arme.');
    if (d.inv[w]) return err(`Tu as déjà : ${WEAPONS[w].label}.`);
    d.inv[w] = { cd: 0, used: false };
    return ok(`${WEAPONS[w].icon} ${WEAPONS[w].label} ajouté !`);
  }

  if (a.type === 'attaque') {
    const w = a.arme, inv = d.inv[w];
    if (!inv || !WEAPONS[w] || WEAPONS[w].passive) return err("Tu n'as pas cette arme.");
    if (inv.cd > now) return err('Arme en recharge.');
    if (w === 'menottes' && inv.used) return err('Menottes déjà utilisées.');
    const recharge = (cfg.armes[w].recharge ?? 0) * 1000;
    const myT = role.team;

    if (w === 'gilet') {
      g.teams[myT].protectUntil = now + cfg.armes.gilet.duree * 1000;
      inv.cd = now + recharge;
      feed(g, ctx, `🦺 L'équipe ${myT} enfile ses gilets`);
      return ok('Ton équipe est protégée.');
    }
    if (w === 'fumigene') {
      const T = other(myT);
      inv.cd = now + recharge;
      if (g.teams[T].protectUntil > now) {
        g.teams[T].pending.push({ type: 'fumigene' });
        feed(g, ctx, `💨 Un fumigène arrive sur l'équipe ${T}…`);
        return ok("L'équipe adverse a un gilet : le fumigène partira à la fin du gilet.");
      }
      applyFumigene(g, ctx, T);
      return ok('Fumigène lancé !');
    }

    const t = a.target;
    if (!g.roles[t] || t === p) return err('Choisis une cible.');
    if (w === 'loupe') {
      inv.cd = now + recharge;
      const r = g.roles[t];
      const text = `${ctx.name(t)} : ${r.role === 'random' ? 'random' : 'détective'}, équipe ${r.team}`;
      d.notes.unshift({ t: now, text });
      return ok(text);
    }
    if (!available(g, t, now)) return err('Cible indisponible.');
    const T = g.roles[t].team;
    if (w === 'menottes') inv.used = true; else inv.cd = now + recharge;
    if (g.teams[T].protectUntil > now) {
      g.teams[T].pending.push({ type: w, target: t });
      return ok(`${ctx.name(t)} est protégé par un gilet : l'attaque partira à la fin du gilet.`);
    }
    applyBlock(g, ctx, t, w);
    return ok(`${ctx.name(t)} est ${w === 'menottes' ? 'menotté' : 'touché'} !`);
  }
  return err('Action inconnue.');
}

function antidote(ctx, g, p, v) {
  const now = ctx.now(), cfg = ctx.cfg, s = g.st[p];
  const b = s.block;
  if (!b || !isBlocked(g, p, now)) return err("Tu n'es pas bloqué.");
  if (!v) return err('Tape un code.');
  const release = () => { s.block = null; s.immuneUntil = now + cfg.immunite * 1000; };
  if (b.type === 'menottes') {
    const T = g.roles[p].team;
    const i = cfg.cles[T].findIndex((k, idx) => cleanCode(k.code) === v && !g.keysUsed[T].includes(idx));
    if (i < 0) return err('Ce code ne libère pas des menottes.');
    g.keysUsed[T].push(i);
    release();
    return ok('Libéré !');
  }
  const anti = b.type === 'pistolet' ? cfg.bandage : cfg.antiFumigene;
  if (cleanCode(anti.code) !== v) return err('Ce code ne marche pas contre ça.');
  if (b.antidoteUsed) return err('Tu as déjà utilisé un antidote.');
  b.antidoteUsed = true;
  const cut = b.type === 'pistolet' ? cfg.bandage.reduction * 1000 : cfg.antiFumigene.fraction * cfg.armes.fumigene.duree * 1000;
  b.until -= cut;
  if (b.until <= now) release();
  return ok('Antidote utilisé !');
}

// ---------- actions orga / admin ----------
export function orgaAction(ctx, g, a) {
  const now = ctx.now();
  if (a.type === 'safe') {
    if (!g.st[a.pid]) return err('Joueur inconnu dans cette partie.');
    if (isBlocked(g, a.pid, now)) return err('Ce joueur est bloqué : il doit se libérer avant.');
    const dur = Number(a.duree) > 0 ? Number(a.duree) : ctx.cfg.safeZone.duree;
    g.st[a.pid].safeUntil = now + dur * 1000;
    return ok(`${ctx.name(a.pid)} est en safe zone.`);
  }
  if (a.type === 'finSafe') {
    if (g.st[a.pid]) g.st[a.pid].safeUntil = 0;
    return ok('Safe zone retirée.');
  }
  return err('Action inconnue.');
}

export function adminAction(ctx, g, a) {
  const now = ctx.now();
  if (a.type === 'safe' || a.type === 'finSafe') return orgaAction(ctx, g, a);
  if (a.type === 'liberer') {
    const s = g.st[a.pid];
    if (s?.block) { s.block = null; s.immuneUntil = now + ctx.cfg.immunite * 1000; }
    return ok('Libéré.');
  }
  if (a.type === 'validerEtape') {
    const team = g.teams[a.team];
    if (!team || team.cur >= team.chain.length) return err('Rien à valider.');
    team.done[team.cur] = now;
    advance(g, ctx, a.team, team.cur);
    return ok('Étape validée.');
  }
  if (a.type === 'remplacer') {
    const T = g.roles[a.pid]?.team;
    if (!T || g.roles[a.remplacant]?.team !== T) return err('Le remplaçant doit être de la même équipe.');
    const team = g.teams[T];
    let n = 0;
    team.chain.forEach((p, i) => { if (p === a.pid && i >= team.cur) { team.chain[i] = a.remplacant; n++; } });
    if (!n) return err("Ce joueur n'a plus d'étape à jouer.");
    return ok(`${ctx.name(a.remplacant)} remplace ${ctx.name(a.pid)}.`);
  }
  if (a.type === 'sauter') {
    const T = g.roles[a.pid]?.team;
    if (!T) return err('Joueur inconnu.');
    const team = g.teams[T];
    let n = 0;
    team.chain.forEach((p, i) => {
      if (p !== a.pid || i < team.cur || team.skipped[i]) return;
      team.skipped[i] = true;
      n++;
    });
    if (!n) return err("Ce joueur n'a plus d'étape à jouer.");
    if (team.skipped[team.cur]) {
      advance(g, ctx, T, team.cur);
      if (team.cur < team.chain.length) team.stage = 'hint';
    }
    return ok('Étape sautée.');
  }
  if (a.type === 'terminer') {
    g.endsAt = now;
    tick(ctx, g);
    return ok('Partie terminée.');
  }
  return err('Action inconnue.');
}

// ---------- vues ----------
function blockView(g, p, now) {
  const b = g.st[p].block;
  if (!b || !isBlocked(g, p, now)) return null;
  return { type: b.type, label: BLOCK_LABEL[b.type], until: b.until, antidoteUsed: b.antidoteUsed };
}

export function playerView(ctx, g, p) {
  const role = g.roles[p];
  if (!role) return { spectator: true, finished: g.finished, winner: g.winner };
  const now = ctx.now(), cfg = ctx.cfg, s = g.st[p];
  const T = role.team, team = g.teams[T], R = team.chain.length;
  const v = {
    team: T, role: role.role, finished: g.finished, winner: g.winner,
    block: blockView(g, p, now),
    safeUntil: s.safeUntil > now ? s.safeUntil : 0,
    immuneUntil: s.immuneUntil > now ? s.immuneUntil : 0,
    lockUntil: s.lockUntil > now ? s.lockUntil : 0,
    protectUntil: team.protectUntil > now ? team.protectUntil : 0,
    fumigeneArrive: team.pending.some(x => x.type === 'fumigene') ? team.protectUntil : 0,
  };
  const idx = team.chain.map((x, i) => (x === p ? i : -1)).filter(i => i >= 0);
  if (idx.length) {
    const r = { total: R };
    const active = idx.find(i => i === team.cur);
    const nextMine = idx.find(i => i > team.cur);
    let prev = team.cur - 1;
    while (prev >= 0 && team.skipped[prev]) prev--;
    if (active !== undefined) {
      const step = stepOf(cfg, T, active, R);
      r.step = step.label;
      r.stage = team.stage;
      if (team.stage === 'hint') {
        r.indice = step.conf.indice;
        r.longue = step.conf.longue;
        r.safeLieu = cfg.safeZone.lieu;
      }
    } else if (prev >= 0 && team.chain[prev] === p && team.cur < R && team.stage === 'number') {
      r.stage = 'sent';
      r.next = { name: ctx.name(team.chain[team.cur]), numero: team.nums[team.cur] };
    } else if (nextMine !== undefined) {
      r.stage = 'waiting';
    } else {
      r.stage = 'done';
    }
    v.random = r;
  }
  if (role.role === 'detective') {
    const d = g.det[p];
    v.detective = {
      mates: Object.keys(g.det).filter(x => x !== p && g.roles[x].team === T).map(ctx.name),
      inv: Object.entries(d.inv).map(([k, x]) => ({
        id: k, ...WEAPONS[k],
        cd: x.cd > now ? x.cd : 0,
        used: x.used,
      })),
      targets: Object.keys(g.roles).filter(x => x !== p).map(x => ({
        id: x, name: ctx.name(x),
        off: isBlocked(g, x, now) ? 'bloqué' : g.st[x].safeUntil > now ? 'safe zone' : g.st[x].immuneUntil > now ? 'immunisé' : '',
      })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      notes: d.notes.slice(0, 8),
      visions: d.visions.slice(0, 5),
    };
  }
  return v;
}

export function screenView(ctx, g) {
  const teams = {};
  for (const T of TEAMS) {
    const t = g.teams[T];
    teams[T] = { progress: progress(t), total: t.chain.length, cur: Math.min(t.cur, t.chain.length), skipped: t.skipped.filter(Boolean).length };
  }
  const v = { teams, feed: g.feed.slice(0, 7), endsAt: g.endsAt, startedAt: g.startedAt, finished: g.finished, winner: g.winner };
  if (g.finished && g.winner) {
    const t = g.teams[g.winner];
    v.winners = {
      chain: t.chain.map(ctx.name),
      detectives: Object.keys(g.det).filter(p => g.roles[p].team === g.winner).map(ctx.name),
      duration: g.finishedAt - g.startedAt,
    };
  }
  return v;
}

export function adminView(ctx, g) {
  const now = ctx.now();
  const teams = {};
  for (const T of TEAMS) {
    const t = g.teams[T];
    teams[T] = {
      ...screenView(ctx, g).teams[T],
      stage: t.stage,
      protectUntil: t.protectUntil > now ? t.protectUntil : 0,
      chain: t.chain.map((p, i) => ({
        pid: p, name: ctx.name(p), step: stepOf(ctx.cfg, T, i, t.chain.length).label, numero: t.nums[i],
        state: t.skipped[i] ? 'sautée' : t.done[i] ? 'faite' : i === t.cur ? (t.stage === 'hint' ? 'en cours' : 'attend son numéro') : '',
      })),
      detectives: Object.keys(g.det).filter(p => g.roles[p].team === T).map(p => ({
        pid: p, name: ctx.name(p), inv: Object.keys(g.det[p].inv).map(k => WEAPONS[k].icon).join(' '),
      })),
      keysUsed: g.keysUsed[T].length,
    };
  }
  const players = Object.keys(g.roles).map(p => {
    const s = g.st[p];
    return {
      pid: p, name: ctx.name(p), team: g.roles[p].team, role: g.roles[p].role,
      block: blockView(g, p, now),
      safeUntil: s.safeUntil > now ? s.safeUntil : 0,
      immuneUntil: s.immuneUntil > now ? s.immuneUntil : 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return { teams, players, feed: g.feed.slice(0, 15), endsAt: g.endsAt, finished: g.finished, winner: g.winner };
}

export function orgaView(ctx, g) {
  const now = ctx.now();
  return {
    lieu: ctx.cfg.safeZone.lieu,
    duree: ctx.cfg.safeZone.duree,
    players: Object.keys(g.roles).map(p => ({
      pid: p, name: ctx.name(p),
      blocked: isBlocked(g, p, now),
      safeUntil: g.st[p].safeUntil > now ? g.st[p].safeUntil : 0,
    })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}

// Résumé pour le classement de la soirée.
export function results(ctx, g) {
  return Object.keys(g.roles).map(p => ({ pid: p, name: ctx.name(p), team: g.roles[p].team, won: g.winner === g.roles[p].team }));
}
