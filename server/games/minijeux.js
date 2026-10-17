// Jeu 4 — Les Mini-Jeux. Voir docs/jeu4-mini-jeux.md.
// Une journée de rounds à heures régulières. À chaque round : un mini-jeu et des joueurs tirés au sort,
// en priorité ceux qui ont le moins joué, pour que tout le monde joue autant (à un round près).
// Les participants sont une liste de noms saisie par l'admin ; chacun « prend » son nom sur son téléphone.
import { normName } from '../util.js';
import * as definition from './minijeux/definition.js';
import * as temple from './minijeux/temple.js';
import * as mime from './minijeux/mime.js';
import * as dragon from './minijeux/dragon.js';
import * as anecdote from './minijeux/anecdote.js';
import * as disparu from './minijeux/disparu.js';
import * as quiz from './minijeux/quiz.js';

// Types de mini-jeux : « manuel » (l'organisateur saisit les places) ou un mini-jeu programmé.
export const TYPES = { definition, temple, mime, dragon, anecdote, disparu, quiz };
export const TYPE_LABELS = { manuel: 'Manuel (tu saisis les places)', definition: definition.label, temple: temple.label, mime: mime.label, dragon: dragon.label, anecdote: anecdote.label, disparu: disparu.label, quiz: quiz.label };
const typeOf = (cfg, slot) => TYPES[cfg.jeux[slot]?.type] || null;
// Format d'un mini-jeu : fixé par son type (Le Mime : des duos ; les autres jeux automatiques : chacun pour soi), sinon celui saisi par l'admin.
export const formatOf = (cfg, slot) => { const T = typeOf(cfg, slot); return T ? T.format?.(cfg.jeux[slot]) || null : parseFormat(cfg.jeux[slot]?.format); };

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
      type: 'manuel', // manuel | definition | temple | mime | dragon | anecdote | disparu
      nom: `Mini-jeu ${i + 1}`,
      regles: '',
      format: '', // '' = chacun pour soi (avec « joueurs ») ; sinon équipes, ex. « 2v2 », « 3v1 », « 1v1v1v1 »
      joueurs: 2, // chacun pour soi : joueurs par round ; 0 = tout le monde
      duree: 600, // indicatif : affiché comme temps de jeu
      points: '10, 6, 3, 1', // points par place
      ...definition.defaults, // La Définition : mots inventés, manches, temps
      ...temple.defaults, // Le Temple aztèque : obstacles, pièges, étapes, vies, temps
      ...mime.defaults, // Le Mime : mots à mimer, nombre de duos, temps
      ...dragon.defaults, // La Chasse au dragon : équipes, vies, munitions, dragon, durée
      ...disparu.defaults, // Qu'est-ce qui a changé ? : objets, manches, temps
      ...quiz.defaults, // Le Quiz : questions, temps
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
// Format d'équipes : « 2v2 » -> [2, 2], « 3v1 » -> [3, 1], « 1v1v1v1 » -> [1, 1, 1, 1]. Vide ou invalide : chacun pour soi.
export function parseFormat(f) {
  const t = String(f || '').toLowerCase().replace(/\s+/g, '').replace(/vs|contre|x/g, 'v');
  if (!/^\d{1,2}(v\d{1,2})+$/.test(t)) return null;
  const sizes = t.split('v').map(Number);
  if (sizes.some(n => n < 1 || n > 10) || sizes.length > 8) return null;
  return sizes;
}
export const formatLabel = sizes => (!sizes ? 'Chacun pour soi' : sizes.every(n => n === 1) ? `Chacun pour soi (${sizes.length})` : sizes.join(' contre '));
export const TEAM_NAMES = ['Rouges', 'Bleus', 'Verts', 'Jaunes', 'Violets', 'Orange', 'Roses', 'Gris'];

const sizeOf = (cfg, slot, total) => {
  if (cfg.jeux[slot]?.type === 'quiz') return total; // le quiz : tout le monde joue
  const sizes = formatOf(cfg, slot);
  if (sizes) return Math.min(sizes.reduce((a, b) => a + b, 0), total);
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
// Si l'heure de début est déjà passée (ou trop proche), la journée part de maintenant, en laissant 5 min aux joueurs
// pour prendre leur nom avant l'annonce du premier round.
export function schedule(cfg, now, count) {
  const lead = cfg.annonce * 1000;
  let debut = tsAt(cfg.debut, cfg.decalage, now);
  let fin = tsAt(cfg.fin, cfg.decalage, now);
  if (fin <= debut) fin += 24 * 3600e3;
  // Journée déjà finie aujourd'hui : c'est celle de demain (journée ouverte la veille au soir).
  if (fin <= now) { debut += 24 * 3600e3; fin += 24 * 3600e3; }
  const start = Math.max(debut, now + lead + 5 * 60e3);
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
    mates: {}, // « a|b » -> rounds joués dans la même équipe
    solo: {}, // nom normalisé -> fois où il était seul face à une équipe (ex. le « 1 » d'un 3v1)
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

// Répartit les joueurs tirés dans les équipes du format. Le joueur seul d'un format inégal (3v1…) est celui qui l'a
// été le moins souvent ; pour le reste, on évite de remettre ensemble les mêmes coéquipiers.
export function teamsFor(g, players, sizes, rand = Math.random) {
  if (!sizes) return players.map(p => [p]);
  const pool = players.slice();
  const out = sizes.map(() => []);
  const unequal = new Set(sizes).size > 1;
  // équipes d'une seule personne dans un format inégal : les moins souvent « seuls » d'abord
  if (unequal) {
    sizes.forEach((n, i) => {
      if (n !== 1 || !pool.length) return;
      pool.sort((a, b) => (g.solo[key(a)] || 0) - (g.solo[key(b)] || 0) || rand() - .5);
      out[i].push(pool.shift());
    });
  }
  const rest = sizes.map((n, i) => n - out[i].length);
  let best = null, bestCost = Infinity;
  for (let k = 0; k < 40; k++) {
    const sh = pool.slice().sort(() => rand() - .5);
    const teams = out.map(t => t.slice());
    let idx = 0;
    rest.forEach((n, i) => { for (let j = 0; j < n && idx < sh.length; j++) teams[i].push(sh[idx++]); });
    while (idx < sh.length) teams[teams.length - 1].push(sh[idx++]);
    let cost = 0;
    for (const t of teams) for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) cost += g.mates[pairKey(t[i], t[j])] || 0;
    if (cost < bestCost) { best = teams; bestCost = cost; if (!cost) break; }
  }
  return best.filter(t => t.length);
}

function prevPlayers(g, r) {
  const before = g.rounds.filter(x => x.n < r.n && (x.status === 'fini' || x.status === 'jeu')).at(-1);
  return new Set((before?.joueurs || []).map(key));
}

// Compteurs d'un round (d = +1 quand il commence, -1 si on l'annule) : rounds joués, joués ensemble, coéquipiers, seul.
function count(g, r, d) {
  const add = (obj, k) => { obj[k] = Math.max(0, (obj[k] || 0) + d); };
  const players = r.joueurs;
  for (const p of players) add(g.played, key(p));
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) add(g.pairs, pairKey(players[i], players[j]));
  const teams = r.equipes || [];
  for (const t of teams) for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) add(g.mates, pairKey(t[i], t[j]));
  if (new Set(teams.map(t => t.length)).size > 1) for (const t of teams) if (t.length === 1) add(g.solo, key(t[0]));
}

function announce(ctx, g, r) {
  const names = roster(ctx.cfg);
  r.joueurs = draw(g, names, sizeOf(ctx.cfg, r.jeu, names.length), prevPlayers(g, r));
  r.type = ctx.cfg.jeux[r.jeu]?.type || 'manuel';
  r.format = formatOf(ctx.cfg, r.jeu);
  r.equipes = teamsFor(g, r.joueurs, r.format);
  r.compris = [];
  r.status = 'annonce';
  r.annonceAt = ctx.now();
  ctx.sfx?.('annonce');
}

function begin(ctx, g, r) {
  r.status = 'jeu';
  r.debutAt = ctx.now();
  count(g, r, 1);
  TYPES[r.type]?.start(ctx, g, r, ctx.cfg.jeux[r.jeu]);
}

// Ceux qui ne jouent pas ce round et ont un téléphone connecté (ils devinent, votent…).
export function spectateurs(ctx, g, r) {
  return roster(ctx.cfg).filter(n => g.claims[key(n)] && !r.joueurs.some(p => key(p) === key(n)));
}

// Places (par équipe) -> points de chaque joueur, ajoutés au classement. Sert aussi à corriger un round terminé.
function applyResults(ctx, g, r, places) {
  const res = placesPoints(ctx.cfg, r, places);
  if (!res) return false;
  if (r.points) for (const [p, v] of Object.entries(r.points)) g.scores[key(p)] = (g.scores[key(p)] || 0) - v.points;
  for (const [p, v] of Object.entries(res)) g.scores[key(p)] = (g.scores[key(p)] || 0) + v.points;
  r.points = res;
  if (r.status === 'jeu') { r.status = 'fini'; r.finAt = ctx.now(); }
  return true;
}

// ---------- déroulement ----------
export function tick(ctx, g) {
  if (g.finished) return false;
  const now = ctx.now(), cfg = ctx.cfg;
  const active = activeRound(g);
  if (active) {
    const T = TYPES[active.type];
    if (active.status === 'jeu' && T) {
      const res = T.tick(ctx, g, active, cfg.jeux[active.jeu], spectateurs(ctx, g, active));
      if (res.places) {
        // Bonus des meilleurs devineurs : donné une seule fois, une correction des places ne le change pas.
        active.bonus = res.bonus || {};
        for (const [p, v] of Object.entries(active.bonus)) g.scores[key(p)] = (g.scores[key(p)] || 0) + v;
        applyResults(ctx, g, active, res.places);
      }
      return res.changed;
    }
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
  const mine = Object.entries(g.claims).find(([, p]) => p === pid)?.[0];
  const nom = mine ? roster(ctx.cfg).find(n => key(n) === mine) : null;
  if (!nom) return err('Choisis d\'abord ton nom.');
  const act = activeRound(g);
  if (a.type === 'compris') {
    if (!act || act.status !== 'annonce' || !act.joueurs.includes(nom)) return err("Ce n'est pas ton tour.");
    act.compris ??= [];
    if (!act.compris.includes(nom)) act.compris.push(nom);
    if (act.joueurs.every(p => act.compris.includes(p))) { begin(ctx, g, act); return ok("Tout le monde a compris : c'est parti !"); }
    return ok(`Compris ! On attend les autres (${act.compris.length} / ${act.joueurs.length}).`);
  }
  const T = act && TYPES[act.type];
  if (T && act.status === 'jeu') return T.playerAction(ctx, g, act, nom, a, ctx.cfg.jeux[act.jeu], spectateurs(ctx, g, act));
  return err('Action inconnue.');
}

// ---------- admin ----------
// places : { indexÉquipe: place }. Chaque membre d'une équipe reçoit les points de la place de son équipe.
function placesPoints(cfg, r, places) {
  const pts = pointsOf(cfg, r.jeu);
  const out = {};
  for (const [i, team] of r.equipes.entries()) {
    const place = Math.round(Number(places?.[i]));
    if (!(place >= 1 && place <= r.equipes.length)) return null;
    for (const p of team) out[p] = { place, points: pts[place - 1] ?? 0, equipe: i };
  }
  return out;
}

export function adminAction(ctx, g, a) {
  const now = ctx.now(), cfg = ctx.cfg;
  const r = a.n != null ? g.rounds.find(x => x.n === Number(a.n)) : null;
  if (r && !r.equipes) r.equipes = r.joueurs.map(p => [p]);
  if (a.type === 'suivant') {
    const act = activeRound(g);
    const T = act && TYPES[act.type];
    if (!T || act.status !== 'jeu') return err('Aucun mini-jeu programmé en cours.');
    const res = T.adminAction(ctx, g, act, a);
    tick(ctx, g);
    return res;
  }
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
    case 'lancerMaintenant': { // un mini-jeu choisi tout de suite, hors programme (test avec de vrais joueurs)
      if (activeRound(g)) return err('Un round est déjà en cours.');
      if (!SLOTS.includes(a.slot)) return err('Choisis un mini-jeu.');
      if (!roster(cfg).length) return err('Ajoute d\'abord des participants dans les réglages.');
      const r = { n: g.rounds.length + 1, jeu: a.slot, at: now, status: 'prevu', joueurs: [], places: null, points: null, annonceAt: 0, debutAt: 0, finAt: 0, hors: true };
      g.rounds.push(r);
      announce(ctx, g, r);
      return ok(`${cfg.jeux[a.slot].nom} annoncé : il commence dès que tout le monde a compris.`);
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
      if (r.status === 'jeu' && TYPES[r.type] && !neu) return err('Pendant ce mini-jeu, remplace le joueur au lieu de le retirer.');
      if (r.status === 'jeu') count(g, r, -1);
      if (neu && r.status === 'jeu') TYPES[r.type]?.renommer?.(r, a.ancien, neu);
      if (r.compris) r.compris = r.compris.filter(p => p !== a.ancien);
      const team = r.equipes.find(t => t.includes(a.ancien));
      if (neu) { r.joueurs[i] = neu; team[team.indexOf(a.ancien)] = neu; } else {
        r.joueurs.splice(i, 1);
        team.splice(team.indexOf(a.ancien), 1);
        r.equipes = r.equipes.filter(t => t.length);
      }
      if (r.status === 'jeu') count(g, r, 1);
      return ok(neu ? `${neu} remplace ${a.ancien}.` : `${a.ancien} retiré du round.`);
    }
    case 'ajouter': { // ajoute un joueur à un round annoncé ou en cours
      if (!r || (r.status !== 'annonce' && r.status !== 'jeu')) return err('Ce round ne peut plus être modifié.');
      const neu = roster(cfg).find(n => key(n) === key(a.nouveau));
      if (!neu) return err('Choisis un joueur.');
      if (r.joueurs.some(p => key(p) === key(neu))) return err('Ce joueur est déjà dans le round.');
      if (r.status === 'jeu' && TYPES[r.type]) return err('Ce mini-jeu a commencé : on ne peut plus ajouter de joueur.');
      if (r.status === 'jeu') count(g, r, -1);
      r.joueurs.push(neu);
      const ti = Number.isInteger(Number(a.equipe)) && r.equipes[Number(a.equipe)] ? Number(a.equipe) : -1;
      if (!r.format || !r.equipes.length) r.equipes.push([neu]); // chacun pour soi : une « équipe » de plus
      else (r.equipes[ti] ?? r.equipes.reduce((m, t) => (t.length < m.length ? t : m))).push(neu);
      if (r.status === 'jeu') count(g, r, 1);
      return ok(`${neu} ajouté au round.`);
    }
    case 'resultats': { // places des joueurs ; corrige aussi un round déjà terminé
      if (!r || (r.status !== 'jeu' && r.status !== 'fini')) return err('Ce round n\'est pas en cours.');
      if (!applyResults(ctx, g, r, a.places)) return err(r.format && !r.format.every(n => n === 1) ? 'Donne une place à chaque équipe.' : 'Donne une place à chaque joueur.');
      return ok(`Résultats du round ${r.n} enregistrés.`);
    }
    case 'passer': {
      if (!r || r.status === 'fini' || r.status === 'saute') return err('Ce round ne peut pas être sauté.');
      if (r.status === 'jeu') count(g, r, -1);
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
      if (act) { if (act.status === 'jeu') count(g, act, -1); act.status = 'saute'; }
      g.finished = true;
      g.finishedAt = now;
      return ok('Journée terminée.');
    }
  }
  return err('Action inconnue.');
}

// ---------- vues ----------
// Résultat de spectateur du dernier round terminé (La Définition) : bonnes réponses, rang, bonus.
function devine(g, nom) {
  const r = g.rounds.filter(x => x.status === 'fini').sort((a, b) => b.finAt - a.finAt)[0];
  const me = r?.def?.devineurs?.find(x => key(x.nom) === key(nom));
  if (!me) return null;
  return { n: r.n, ...me, sur: r.def.devineurs.length, bonus: r.bonus?.[me.nom] || 0 };
}
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
    equipes: r.equipes || r.joueurs.map(p => [p]),
    equipesNommees: !!(r.status === 'prevu' ? formatOf(ctx.cfg, r.jeu) : r.format)?.some(n => n > 1),
    format: formatLabel(r.status === 'prevu' ? formatOf(ctx.cfg, r.jeu) : r.format),
    startAt: r.status === 'annonce' ? startAtOf(ctx.cfg, r) : r.debutAt || r.at,
    taille: sizeOf(ctx.cfg, r.jeu, roster(ctx.cfg).length), duree: j.duree, debutAt: r.debutAt, finAt: r.finAt,
    type: r.type || j.type || 'manuel', compris: r.compris || [],
    points: r.points,
    bonus: r.bonus || null,
    devineurs: r.def?.devineurs || null,
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

// État du mini-jeu programmé en cours, selon qui regarde (ecran | admin | joueur | spectateur).
function etat(ctx, g, as, nom) {
  const act = activeRound(g);
  const T = act && TYPES[act.type];
  if (!T || act.status !== 'jeu') return null;
  return T.view(ctx, g, act, as, nom, spectateurs(ctx, g, act));
}

export function screenView(ctx, g) {
  const names = roster(ctx.cfg);
  return {
    ...common(ctx, g),
    etat: etat(ctx, g, 'ecran'),
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
    etat: etat(ctx, g, 'admin'),
    attendu: expected(ctx.cfg, g),
    joueurs: ranking(ctx, g).map(r => ({ ...r, connecte: !!g.claims[key(r.nom)] })),
    sansTelephone: names.filter(n => !g.claims[key(n)]),
  };
}

// Pour un joueur d'un round : son équipe, ses coéquipiers et ses adversaires.
function teamInfo(r, mine) {
  const i = r.equipes.findIndex(t => t.some(p => key(p) === mine));
  if (i < 0) return {};
  return { equipe: i, coequipiers: r.equipes[i].filter(p => key(p) !== mine), adversaires: r.equipes.filter((_, k) => k !== i) };
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
    monTour: inRound(c.actif) ? { ...c.actif, ...teamInfo(c.actif, mine) } : null,
    actif: c.actif,
    prochain: c.prochain,
    dernier: dernier ? { n: dernier.n, nom: ctx.cfg.jeux[dernier.jeu]?.nom, place: dernier.points?.[dernier.joueurs.find(p => key(p) === mine)]?.place, points: dernier.points?.[dernier.joueurs.find(p => key(p) === mine)]?.points } : null,
    devine: devine(g, nom),
    finished: g.finished,
    podium: g.finished ? rows.slice(0, 3) : null,
    annonce: ctx.cfg.annonce,
    etat: c.actif?.status === 'jeu' ? etat(ctx, g, inRound(c.actif) ? 'joueur' : 'spectateur', nom) : null,
  };
}

// Ce jeu ne compte pas dans le classement de la soirée.
export function results() { return []; }
