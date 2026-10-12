// Jeu 4 — Les Mini-Jeux. Voir docs/jeu4-mini-jeux.md.
// Une journée de rounds à heures régulières. À chaque round : un mini-jeu et des joueurs tirés au sort,
// en priorité ceux qui ont le moins joué, pour que tout le monde joue autant (à un round près).
// Les participants sont une liste de noms saisie par l'admin ; chacun « prend » son nom sur son téléphone.
import { normName } from '../util.js';

export const id = 'minijeux';
export const name = 'Les Mini-Jeux';
export const minPlayers = 0;
export const classementSoiree = false; // classement de la journée, séparé de celui de la soirée

export const SLOTS = ['mj1', 'mj2', 'mj3', 'mj4', 'mj5', 'mj6'];
const MAX_ROSTER = 200;
const MAX_ROUNDS = 60;

export function defaultConfig() {
  return {
    joueurs: '', // un nom par ligne
    debut: '10:00',
    fin: '18:00',
    decalage: 0, // fuseau horaire du navigateur de l'admin (getTimezoneOffset, en minutes)
    annonce: 300, // les joueurs sont tirés au sort et annoncés X secondes avant le round
    resultats: 45, // durée d'affichage des résultats d'un round sur l'écran
    rounds: 12,
    programme: [...SLOTS, ...SLOTS].join(','), // mini-jeu de chaque round, dans l'ordre
    jeux: Object.fromEntries(SLOTS.map((s, i) => [s, {
      actif: true, // utilisé par « remplir automatiquement »
      nom: `Mini-jeu ${i + 1}`,
      regles: '',
      joueurs: 2, // par round ; 0 = tout le monde
      duree: 600, // indicatif : affiché comme temps de jeu
      points: '10, 6, 3, 1', // points par place
    }])),
  };
}

// ---------- outils ----------
const key = n => normName(n);
const pairKey = (a, b) => [key(a), key(b)].sort().join('|');

// Liste des participants : un nom par ligne, sans doublon.
export function roster(cfg) {
  const seen = new Set(), out = [];
  for (const line of String(cfg.joueurs || '').split(/\r?\n/)) {
    const n = line.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (n.length < 1 || seen.has(key(n))) continue;
    seen.add(key(n));
    out.push(n);
    if (out.length >= MAX_ROSTER) break;
  }
  return out;
}

const activeSlots = cfg => { const a = SLOTS.filter(s => cfg.jeux[s]?.actif); return a.length ? a : SLOTS; };

// Programme des rounds : celui saisi par l'admin, complété en boucle avec les mini-jeux utilisés.
export function program(cfg) {
  const n = Math.max(1, Math.min(MAX_ROUNDS, Math.round(Number(cfg.rounds) || 1)));
  const chosen = String(cfg.programme || '').split(',').map(s => s.trim()).filter(s => SLOTS.includes(s));
  const fill = activeSlots(cfg);
  return Array.from({ length: n }, (_, i) => chosen[i] ?? fill[i % fill.length]);
}

export const pointsOf = (cfg, slot) => String(cfg.jeux[slot]?.points || '').split(/[,;\s]+/).map(Number).filter(Number.isFinite);
const sizeOf = (cfg, slot, total) => {
  const j = Math.round(Number(cfg.jeux[slot]?.joueurs) || 0);
  return j > 0 ? Math.min(j, total) : total;
};

// Heure « HH:MM » du jour, dans le fuseau de l'admin, en millisecondes.
export function tsAt(hhmm, decalage, now) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  const local = new Date(now - decalage * 60000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + ((h || 0) * 60 + (m || 0)) * 60000 + decalage * 60000;
}

// Heures des rounds : réparties à intervalles égaux entre le début et la fin de la journée.
// Si l'heure de début est déjà passée, la journée part de maintenant (le temps d'annoncer le premier round).
export function schedule(cfg, now, count) {
  const lead = cfg.annonce * 1000;
  let debut = tsAt(cfg.debut, cfg.decalage, now);
  let fin = tsAt(cfg.fin, cfg.decalage, now);
  if (fin <= debut) fin += 24 * 3600e3;
  const start = Math.max(debut, now + lead);
  const spacing = fin - start >= count * 60e3 ? (fin - start) / count : 15 * 60e3;
  return { at: Array.from({ length: count }, (_, i) => Math.round(start + i * spacing)), spacing, late: start > debut };
}

const activeRound = g => g.rounds.find(r => r.status === 'annonce' || r.status === 'jeu');
const nextRound = g => g.rounds.find(r => r.status === 'prevu');
const startAtOf = (cfg, r) => Math.max(r.at, r.annonceAt + Math.min(cfg.annonce * 1000, 120e3));

// ---------- départ ----------
export function start(ctx) {
  const now = ctx.now(), cfg = ctx.cfg;
  const prog = program(cfg);
  const { at, spacing, late } = schedule(cfg, now, prog.length);
  return {
    startedAt: now,
    spacing,
    late,
    claims: {}, // nom (normalisé) -> pid du téléphone
    rounds: prog.map((jeu, i) => ({ n: i + 1, jeu, at: at[i], status: 'prevu', joueurs: [], places: null, points: null, annonceAt: 0, debutAt: 0, finAt: 0 })),
    played: {}, // nom normalisé -> rounds joués
    pairs: {}, // « a|b » -> rounds joués ensemble
    scores: {}, // nom normalisé -> points
    finished: false,
  };
}

// ---------- tirage au sort ----------
// Choisit n joueurs : d'abord ceux qui ont le moins joué, puis ceux qui n'ont pas joué le round d'avant,
// puis ceux qui ont un téléphone connecté, puis ceux qui ont le moins joué avec les joueurs déjà choisis ; le hasard départage.
export function draw(g, names, n, prevKeys = new Set(), rand = Math.random) {
  const r = new Map(names.map(nm => [nm, rand()]));
  const sel = [];
  const score = nm => [
    g.played[key(nm)] || 0,
    prevKeys.has(key(nm)) ? 1 : 0,
    g.claims[key(nm)] ? 0 : 1,
    sel.reduce((s, o) => s + (g.pairs[pairKey(nm, o)] || 0), 0),
    r.get(nm),
  ];
  const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
  while (sel.length < n) {
    let best = null, bestS = null;
    for (const nm of names) {
      if (sel.includes(nm)) continue;
      const s = score(nm);
      if (!best || less(s, bestS)) { best = nm; bestS = s; }
    }
    if (!best) break;
    sel.push(best);
  }
  return sel;
}

function prevPlayers(g, r) {
  const before = g.rounds.filter(x => x.n < r.n && (x.status === 'fini' || x.status === 'jeu')).at(-1);
  return new Set((before?.joueurs || []).map(key));
}

function count(g, players, d) {
  for (const p of players) g.played[key(p)] = Math.max(0, (g.played[key(p)] || 0) + d);
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const k = pairKey(players[i], players[j]);
    g.pairs[k] = Math.max(0, (g.pairs[k] || 0) + d);
  }
}

function announce(ctx, g, r) {
  const names = roster(ctx.cfg);
  r.joueurs = draw(g, names, sizeOf(ctx.cfg, r.jeu, names.length), prevPlayers(g, r));
  r.status = 'annonce';
  r.annonceAt = ctx.now();
  ctx.sfx?.('annonce');
}

function begin(ctx, g, r) {
  r.status = 'jeu';
  r.debutAt = ctx.now();
  count(g, r.joueurs, 1);
}

// ---------- déroulement ----------
export function tick(ctx, g) {
  if (g.finished) return false;
  const now = ctx.now(), cfg = ctx.cfg;
  const active = activeRound(g);
  if (active) {
    if (active.status === 'annonce' && now >= startAtOf(cfg, active)) { begin(ctx, g, active); return true; }
    return false;
  }
  // On laisse les résultats du round précédent à l'écran avant d'annoncer le suivant.
  const last = g.rounds.filter(r => r.status === 'fini').sort((a, b) => b.finAt - a.finAt)[0];
  if (last && now - last.finAt < cfg.resultats * 1000) return false;
  const next = nextRound(g);
  if (!next) {
    g.finished = true;
    g.finishedAt = now;
    ctx.sfx?.('victoire');
    return true;
  }
  if (now >= next.at - cfg.annonce * 1000) { announce(ctx, g, next); return true; }
  return false;
}

// ---------- téléphones ----------
// Un téléphone prend un nom de la liste. Un nom déjà pris par un autre téléphone est refusé.
export function claim(ctx, g, pid, nom) {
  const names = roster(ctx.cfg);
  const found = names.find(n => key(n) === key(nom));
  if (!found) return { ok: false, msg: "Ce nom n'est pas dans la liste." };
  const k = key(found);
  if (g.claims[k] && g.claims[k] !== pid) return { ok: false, msg: 'Ce nom est déjà pris sur un autre téléphone. Demande à l\'organisateur.' };
  for (const [kk, p] of Object.entries(g.claims)) if (p === pid) delete g.claims[kk];
  g.claims[k] = pid;
  return { ok: true, msg: `Bienvenue ${found} !` };
}

const ok = msg => ({ ok: true, msg });
const err = msg => ({ ok: false, msg });

export function playerAction(ctx, g, pid, a) {
  if (a.type === 'pasMoi') {
    for (const [k, p] of Object.entries(g.claims)) if (p === pid) delete g.claims[k];
    return ok('Choisis ton nom dans la liste.');
  }
  return err('Action inconnue.');
}

// ---------- admin ----------
function placesPoints(cfg, r, places) {
  const pts = pointsOf(cfg, r.jeu);
  const out = {};
  for (const p of r.joueurs) {
    const place = Math.round(Number(places?.[p]));
    if (!(place >= 1 && place <= r.joueurs.length)) return null;
    out[p] = { place, points: pts[place - 1] ?? 0 };
  }
  return out;
}

export function adminAction(ctx, g, a) {
  const now = ctx.now(), cfg = ctx.cfg;
  const r = a.n != null ? g.rounds.find(x => x.n === Number(a.n)) : null;
  switch (a.type) {
    case 'annoncer': { // tirer au sort et annoncer le prochain round tout de suite
      if (activeRound(g)) return err('Un round est déjà en cours.');
      const next = nextRound(g);
      if (!next) return err('Plus de round prévu.');
      if (!roster(cfg).length) return err('Ajoute d\'abord des participants dans les réglages.');
      // Annoncé à la main : le round commence peu après (le temps que les joueurs arrivent), pas à son heure prévue.
      next.at = Math.min(next.at, now + Math.min(cfg.annonce * 1000, 120e3));
      announce(ctx, g, next);
      return ok(`Round ${next.n} annoncé : il commence dans ${Math.round((startAtOf(cfg, next) - now) / 60000) || 1} min.`);
    }
    case 'commencer': {
      const act = activeRound(g);
      if (!act || act.status !== 'annonce') return err('Aucun round annoncé.');
      begin(ctx, g, act);
      return ok(`Round ${act.n} commencé.`);
    }
    case 'retirer': // retire un joueur d'un round annoncé ou en cours, sans le remplacer
    case 'remplacer': {
      if (!r || (r.status !== 'annonce' && r.status !== 'jeu')) return err('Ce round ne peut plus être modifié.');
      const i = r.joueurs.indexOf(a.ancien);
      if (i < 0) return err('Joueur introuvable dans ce round.');
      const neu = a.type === 'remplacer' ? roster(cfg).find(n => key(n) === key(a.nouveau)) : null;
      if (a.type === 'remplacer' && !neu) return err('Choisis un remplaçant.');
      if (neu && r.joueurs.some(p => key(p) === key(neu))) return err('Ce joueur est déjà dans le round.');
      if (r.status === 'jeu') count(g, r.joueurs, -1);
      if (neu) r.joueurs[i] = neu; else r.joueurs.splice(i, 1);
      if (r.status === 'jeu') count(g, r.joueurs, 1);
      return ok(neu ? `${neu} remplace ${a.ancien}.` : `${a.ancien} retiré du round.`);
    }
    case 'ajouter': { // ajoute un joueur à un round annoncé ou en cours
      if (!r || (r.status !== 'annonce' && r.status !== 'jeu')) return err('Ce round ne peut plus être modifié.');
      const neu = roster(cfg).find(n => key(n) === key(a.nouveau));
      if (!neu) return err('Choisis un joueur.');
      if (r.joueurs.some(p => key(p) === key(neu))) return err('Ce joueur est déjà dans le round.');
      if (r.status === 'jeu') count(g, r.joueurs, -1);
      r.joueurs.push(neu);
      if (r.status === 'jeu') count(g, r.joueurs, 1);
      return ok(`${neu} ajouté au round.`);
    }
    case 'resultats': { // places des joueurs ; corrige aussi un round déjà terminé
      if (!r || (r.status !== 'jeu' && r.status !== 'fini')) return err('Ce round n\'est pas en cours.');
      const res = placesPoints(cfg, r, a.places);
      if (!res) return err('Donne une place à chaque joueur.');
      if (r.points) for (const [p, v] of Object.entries(r.points)) g.scores[key(p)] = (g.scores[key(p)] || 0) - v.points;
      for (const [p, v] of Object.entries(res)) g.scores[key(p)] = (g.scores[key(p)] || 0) + v.points;
      r.points = res;
      if (r.status === 'jeu') { r.status = 'fini'; r.finAt = now; }
      return ok(`Résultats du round ${r.n} enregistrés.`);
    }
    case 'passer': {
      if (!r || r.status === 'fini' || r.status === 'saute') return err('Ce round ne peut pas être sauté.');
      if (r.status === 'jeu') count(g, r.joueurs, -1);
      r.status = 'saute';
      r.finAt = now;
      return ok(`Round ${r.n} sauté.`);
    }
    case 'decaler': { // décale tous les rounds pas encore commencés
      const sec = Number(a.sec) || 0;
      for (const x of g.rounds) if (x.status === 'prevu' || x.status === 'annonce') x.at += sec * 1000;
      return ok(sec > 0 ? `Planning retardé de ${Math.round(sec / 60)} min.` : `Planning avancé de ${Math.round(-sec / 60)} min.`);
    }
    case 'liberer': {
      delete g.claims[key(a.nom)];
      return ok(`${a.nom} peut reprendre son nom sur un autre téléphone.`);
    }
    case 'terminer': {
      for (const x of g.rounds) if (x.status === 'prevu' || x.status === 'annonce') x.status = 'saute';
      const act = activeRound(g);
      if (act) { count(g, act.joueurs, -1); act.status = 'saute'; }
      g.finished = true;
      g.finishedAt = now;
      return ok('Journée terminée.');
    }
  }
  return err('Action inconnue.');
}

// ---------- vues ----------
function ranking(ctx, g) {
  const rows = roster(ctx.cfg).map(n => ({ nom: n, points: g.scores[key(n)] || 0, joues: g.played[key(n)] || 0 }));
  rows.sort((a, b) => b.points - a.points || a.nom.localeCompare(b.nom, 'fr'));
  rows.forEach((r, i) => { r.rang = i && rows[i - 1].points === r.points ? rows[i - 1].rang : i + 1; });
  return rows;
}

// Nombre de rounds que chacun devrait jouer (au mieux, à un près).
export function expected(cfg, g) {
  const total = roster(cfg).length;
  if (!total) return { min: 0, max: 0 };
  const slots = g.rounds.filter(r => r.status !== 'saute').reduce((s, r) => s + (r.status === 'prevu' ? sizeOf(cfg, r.jeu, total) : r.joueurs.length), 0);
  return { min: Math.floor(slots / total), max: Math.ceil(slots / total) };
}

function roundView(ctx, r, withRules = false) {
  const j = ctx.cfg.jeux[r.jeu] || {};
  const v = {
    n: r.n, jeu: r.jeu, nom: j.nom, at: r.at, status: r.status, joueurs: r.joueurs,
    startAt: r.status === 'annonce' ? startAtOf(ctx.cfg, r) : r.debutAt || r.at,
    taille: sizeOf(ctx.cfg, r.jeu, roster(ctx.cfg).length), duree: j.duree, debutAt: r.debutAt, finAt: r.finAt,
    points: r.points,
  };
  if (withRules) v.regles = j.regles;
  return v;
}

function common(ctx, g) {
  const act = activeRound(g), next = nextRound(g);
  const recent = !act && g.rounds.filter(r => r.status === 'fini' && ctx.now() - r.finAt < ctx.cfg.resultats * 1000).sort((a, b) => b.finAt - a.finAt)[0];
  return {
    finished: g.finished,
    spacing: g.spacing,
    late: g.late,
    actif: act ? roundView(ctx, act, true) : null,
    prochain: next ? roundView(ctx, next, true) : null,
    recent: recent ? roundView(ctx, recent) : null,
    total: g.rounds.length,
    faits: g.rounds.filter(r => r.status === 'fini').length,
  };
}

export function screenView(ctx, g) {
  const names = roster(ctx.cfg);
  return {
    ...common(ctx, g),
    rounds: g.rounds.map(r => roundView(ctx, r)),
    classement: ranking(ctx, g),
    inscrits: names.filter(n => g.claims[key(n)]).length,
    participants: names.map(n => ({ nom: n, connecte: !!g.claims[key(n)] })),
  };
}

export function adminView(ctx, g) {
  const names = roster(ctx.cfg);
  return {
    ...screenView(ctx, g),
    attendu: expected(ctx.cfg, g),
    joueurs: ranking(ctx, g).map(r => ({ ...r, connecte: !!g.claims[key(r.nom)] })),
    sansTelephone: names.filter(n => !g.claims[key(n)]),
  };
}

export function playerView(ctx, g, pid) {
  const names = roster(ctx.cfg);
  const mine = pid ? Object.entries(g.claims).find(([, p]) => p === pid)?.[0] : null;
  const nom = mine ? names.find(n => key(n) === mine) : null;
  if (!nom) return { claim: true, libres: names.filter(n => !g.claims[key(n)]).sort((a, b) => a.localeCompare(b, 'fr')), finished: g.finished };
  const c = common(ctx, g);
  const rows = ranking(ctx, g);
  const me = rows.find(r => key(r.nom) === mine);
  const inRound = r => r?.joueurs.some(p => key(p) === mine);
  const dernier = g.rounds.filter(r => r.status === 'fini' && inRound(r)).sort((a, b) => b.finAt - a.finAt)[0];
  return {
    nom,
    points: me.points,
    rang: me.rang,
    sur: rows.length,
    joues: me.joues,
    attendu: expected(ctx.cfg, g),
    monTour: inRound(c.actif) ? c.actif : null,
    actif: c.actif,
    prochain: c.prochain,
    dernier: dernier ? { n: dernier.n, nom: ctx.cfg.jeux[dernier.jeu]?.nom, place: dernier.points?.[dernier.joueurs.find(p => key(p) === mine)]?.place, points: dernier.points?.[dernier.joueurs.find(p => key(p) === mine)]?.points } : null,
    finished: g.finished,
    podium: g.finished ? rows.slice(0, 3) : null,
    annonce: ctx.cfg.annonce,
  };
}

// Ce jeu ne compte pas dans le classement de la soirée.
export function results() { return []; }
