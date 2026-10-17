// État de la soirée : identités des joueurs, décompte, inscriptions et jeu en cours.
import * as chemin from './games/chemin.js';
import * as duel from './games/duel.js';
import * as grandpari from './games/grandpari.js';
import * as minijeux from './games/minijeux.js';
import { uid, normName, setPath, mergeDefaults, cleanCode } from './util.js';
import * as classement from './classement.js';

export const GAMES = { chemin, duel, grandpari, minijeux };
// Jeux qui comptent dans le classement de la soirée (les Mini-Jeux ont leur propre classement de la journée).
const inSoiree = id => GAMES[id]?.classementSoiree !== false;

export function defaultState() {
  return {
    config: {
      decompte: 2700,
      inscriptions: 900,
      orgaCode: '1234',
      nomsJeux: Object.fromEntries(Object.values(GAMES).map(m => [m.id, m.name])),
      programme: Object.keys(GAMES), // jeux choisis pour la soirée, dans l'ordre
      classement: classement.defaultConfig(),
      games: Object.fromEntries(Object.values(GAMES).map(m => [m.id, m.defaultConfig()])),
    },
    people: {},
    session: newSession('chemin'),
    history: [],
    bonus: {},
    soirees: [], // soirées précédentes : { fin, parties, top } (le classement de chacune, figé)
    roulette: null, // dernier tirage au sort affiché sur l'écran : { id, names, winner, startAt, duree }
    show: null, // null | 'classement' | 'final' : classement affiché sur l'écran public
    soiree: { started: false, startedAt: 0 },
  };
}

// Programme : seulement des jeux qui existent, chacun une fois.
function cleanProgramme(ids) {
  return Array.isArray(ids) ? [...new Set(ids.filter(id => GAMES[id]))] : [];
}

// Change à chaque démarrage du serveur : les téléphones savent ainsi qu'il a redémarré.
const BOOT = uid();

function newSession(gameId) {
  return {
    id: uid(),
    gameId,
    status: 'idle', // idle | countdown | playing | finished
    countdown: { startedAt: 0, adjust: 0, pausedAt: 0, pausedTotal: 0 },
    regOverride: null, // null | 'open' | 'closed'
    registered: [],
    dossards: {}, // numéros de maillot saisis pendant les inscriptions (Duel au Far West)
    game: null,
    message: null,
  };
}

// Recharge un état sauvegardé en complétant avec les valeurs par défaut.
export function restore(saved) {
  const def = defaultState();
  if (!saved) return def;
  const out = {
    ...def,
    ...saved,
    config: mergeDefaults(def.config, saved.config),
    bonus: saved.bonus || {},
    soiree: { ...def.soiree, ...saved.soiree },
    // Sauvegarde d'avant ce champ : ses réglages sont les vrais.
    reglagesMaj: saved.reglagesMaj || (saved.config ? Date.now() : 0),
  };
  // Sauvegarde d'avant le programme : tous les jeux, comme avant.
  out.config.programme = saved.config && 'programme' in saved.config ? cleanProgramme(saved.config.programme) : def.config.programme;
  return out;
}

// Reprise après une pause : décale de « delta » ms toutes les heures (horodatages) de l'état d'un jeu proches du début de la pause.
// Les durées, points et compteurs sont bien plus petits qu'un horodatage : ils ne bougent pas.
export function decaler(o, delta, depuis) {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'number' && v > 1e12 && Math.abs(v - depuis) < 2 * 864e5) o[k] = v + delta;
    else if (v && typeof v === 'object') decaler(v, delta, depuis);
  }
}

export class Soiree {
  constructor(state, { now = Date.now, onSfx } = {}) {
    this.s = state;
    this.now = now;
    this.onSfx = onSfx;
  }

  get sess() { return this.s.session; }
  get module() { return GAMES[this.sess.gameId]; }
  gameCfg(id = this.sess.gameId) { return this.s.config.games[id]; }

  ctx() {
    return {
      now: this.now,
      cfg: this.gameCfg(),
      name: pid => this.s.people[pid]?.name ?? '?',
      sfx: name => this.onSfx?.(name),
      dossards: this.sess.dossards || {},
    };
  }

  // ---------- décompte ----------
  remaining() {
    const c = this.sess.countdown, now = this.now();
    if (this.sess.status !== 'countdown') return null;
    const paused = c.pausedAt ? now - c.pausedAt : 0;
    return c.startedAt + this.s.config.decompte * 1000 + c.adjust + c.pausedTotal + paused - now;
  }

  endsAt() {
    const r = this.remaining();
    return r == null ? 0 : this.now() + r;
  }

  inscriptionsOpen() {
    if (this.sess.regOverride) return this.sess.regOverride === 'open';
    if (this.sess.status !== 'countdown') return false;
    return this.remaining() <= this.s.config.inscriptions * 1000;
  }

  // ---------- joueurs ----------
  identify(token) {
    return Object.values(this.s.people).find(p => p.token === token) ?? null;
  }

  join(token, name) {
    const clean = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (clean.length < 2) return { ok: false, msg: 'Écris ton prénom (2 lettres minimum).' };
    let me = this.identify(token);
    const taken = Object.values(this.s.people).find(p => normName(p.name) === normName(clean) && p !== me);
    if (taken) return { ok: false, msg: 'Ce prénom est déjà pris : ajoute l\'initiale de ton nom (ex. « Léa M. »).' };
    if (!me) {
      // Jeton déjà présent sur le téléphone (serveur redémarré sans sauvegarde) : on le garde.
      me = { id: uid(), token: /^[a-f0-9]{32}$/.test(token || '') ? token : uid(16), name: clean };
      this.s.people[me.id] = me;
    } else me.name = clean;
    return { ok: true, token: me.token, pid: me.id };
  }

  register(pid, on = true) {
    const r = this.sess.registered;
    if (on) {
      if (!this.inscriptionsOpen()) return { ok: false, msg: 'Les inscriptions ne sont pas ouvertes.' };
      if (!r.includes(pid)) r.push(pid);
      return { ok: true, msg: 'Tu es inscrit !' };
    }
    if (this.sess.status === 'playing') return { ok: false, msg: 'La partie a commencé.' };
    this.sess.registered = r.filter(x => x !== pid);
    return { ok: true, msg: 'Désinscrit.' };
  }

  // ---------- admin ----------
  admin(a) {
    const sess = this.sess, c = sess.countdown, now = this.now();
    switch (a.type) {
      case 'choisirJeu':
        if (!GAMES[a.gameId]) return { ok: false, msg: 'Jeu inconnu.' };
        if (sess.status === 'playing') return { ok: false, msg: 'Termine d\'abord la partie en cours.' };
        this.archive();
        this.s.session = newSession(a.gameId); // chaque nouveau jeu : il faut se réinscrire
        this.s.show = null; // la nouvelle soirée ne reprend pas l'affichage du classement de la précédente
        return { ok: true };
      case 'demarrer':
        if (sess.status === 'playing') return { ok: false, msg: 'Partie déjà en cours.' };
        if (sess.status === 'finished') { this.archive(); this.s.session = newSession(sess.gameId); }
        Object.assign(this.sess, { status: 'countdown' });
        Object.assign(this.sess.countdown, { startedAt: now, adjust: 0, pausedAt: 0, pausedTotal: 0 });
        return { ok: true };
      case 'pause':
        // Pendant une partie : le temps du jeu s'arrête ; à la reprise, toutes ses échéances sont décalées d'autant.
        if (sess.status === 'playing') {
          if (sess.jeuPause) { decaler(sess.game, now - sess.jeuPause, sess.jeuPause); sess.jeuPause = 0; return { ok: true, msg: 'Le jeu reprend.' }; }
          sess.jeuPause = now;
          return { ok: true, msg: 'Jeu en pause.' };
        }
        if (sess.status !== 'countdown') return { ok: false, msg: 'Pas de décompte en cours.' };
        if (c.pausedAt) { c.pausedTotal += now - c.pausedAt; c.pausedAt = 0; } else c.pausedAt = now;
        return { ok: true };
      case 'ajuster':
        if (sess.status !== 'countdown') return { ok: false, msg: 'Pas de décompte en cours.' };
        // On ne descend jamais sous 10 s : « −5 min » à 3 min du départ lance le jeu dans 10 s, pas tout de suite.
        c.adjust += Math.max(Number(a.sec || 0) * 1000, 10000 - this.remaining());
        return { ok: true };
      case 'inscriptions':
        sess.regOverride = a.value === 'auto' ? null : a.value;
        return { ok: true };
      case 'lancerJeu':
        return this.startGame();
      case 'arreter':
        if (sess.status === 'playing') this.finishGame();
        else Object.assign(sess, { status: 'idle' });
        return { ok: true };
      case 'reinitialiser':
        this.s.session = newSession(sess.gameId);
        return { ok: true };
      case 'bonus': {
        const cur = Number(this.s.bonus[a.pid] || 0) + Number(a.delta || 0);
        if (cur) this.s.bonus[a.pid] = cur; else delete this.s.bonus[a.pid];
        return { ok: true };
      }
      case 'afficherClassement':
        this.s.show = ['classement', 'final'].includes(a.mode) ? a.mode : null;
        return { ok: true };
      case 'programme':
        this.s.config.programme = cleanProgramme(a.ids);
        this.s.reglagesMaj = this.now();
        return { ok: true };
      case 'demarrerSoiree': {
        const prog = this.s.config.programme;
        if (!prog.length) return { ok: false, msg: 'Choisis au moins un jeu pour la soirée.' };
        if (sess.status === 'playing') return { ok: false, msg: 'Termine d\'abord la partie en cours.' };
        // Nouvelle soirée : classement à zéro, on se place sur le premier jeu du programme.
        this.s.history = [];
        this.s.bonus = {};
        this.s.show = null;
        this.s.session = newSession(prog[0]); // les joueurs restent dans la base, mais doivent s'inscrire à chaque jeu
        this.s.soiree = { started: true, startedAt: now };
        return { ok: true, msg: `Soirée démarrée ! Premier jeu : ${this.gameName(prog[0])}.` };
      }
      case 'jeuSuivant': {
        const prog = this.s.config.programme;
        const next = prog[prog.indexOf(sess.gameId) + 1];
        if (!next) return { ok: false, msg: 'C\'était le dernier jeu : affiche le grand final dans l\'onglet Classement.' };
        const r = this.admin({ type: 'choisirJeu', gameId: next });
        return r.ok ? { ok: true, msg: `Jeu suivant : ${this.gameName(next)}.` } : r;
      }
      case 'terminerSoiree':
        this.s.soiree = { ...this.s.soiree, started: false };
        return { ok: true, msg: 'Soirée terminée. Le classement reste visible.' };
      case 'importerReglages': {
        const c = a.config;
        if (!c || typeof c !== 'object' || !c.games) return { ok: false, msg: 'Fichier de réglages invalide.' };
        this.s.config = restore({ config: c }).config;
        this.s.reglagesMaj = this.now();
        return { ok: true, msg: 'Réglages importés.' };
      }
      case 'roulette': { // machine à sous : un nom tiré parmi les personnes connectées, animé sur l'écran
        const names = [...new Set(Object.values(this.s.people).map(p => p.name).filter(Boolean))];
        if (names.length < 2) return { ok: false, msg: 'Il faut au moins 2 personnes connectées.' };
        const winner = names[Math.floor(Math.random() * names.length)];
        this.s.roulette = { id: uid(), names, winner, startAt: now, duree: 4000 };
        return { ok: true };
      }
      case 'nouvelleSoiree': { // archive le classement de la soirée en cours, puis repart de zéro
        if (sess.status !== 'idle' && sess.status !== 'finished') return { ok: false, msg: 'Termine d\'abord la partie en cours.' };
        this.archive();
        const c = this.classement();
        this.s.soirees.push({ fin: this.now(), parties: this.s.history.length, top: c.rows.slice(0, 3).map(r => ({ name: r.name, total: r.total })) });
        this.s.history = [];
        this.s.bonus = {};
        this.s.show = null;
        this.s.session = newSession(sess.gameId); // réinitialisation complète : les joueurs se réinscrivent
        return { ok: true, msg: 'Nouvelle soirée : le classement repart de zéro.' };
      }
      case 'reinitialiserSoiree':
        this.s.history = [];
        this.s.bonus = {};
        this.s.show = null;
        return { ok: true, msg: 'Classement de la soirée remis à zéro.' };
      case 'dossard': {
        const v = cleanCode(a.value);
        sess.dossards = sess.dossards || {};
        if (v && Object.entries(sess.dossards).some(([p, n]) => p !== a.pid && n === v)) return { ok: false, msg: `Le numéro ${v} est déjà pris.` };
        if (v) sess.dossards[a.pid] = v; else delete sess.dossards[a.pid];
        // Partie déjà lancée : le numéro va aussi dans le jeu.
        if (sess.game && this.module.id === 'duel') return this.module.adminAction(this.ctx(), sess.game, { type: 'num', pid: a.pid, value: v });
        return { ok: true };
      }
      case 'retirerInscrit':
        sess.registered = sess.registered.filter(x => x !== a.pid);
        return { ok: true };
      case 'config': {
        const done = a.scope === 'soiree'
          ? setPath(this.s.config, a.path, a.value)
          : setPath(this.gameCfg(a.gameId ?? sess.gameId), a.path, a.value);
        if (!done) return { ok: false, msg: 'Réglage inconnu.' };
        this.s.reglagesMaj = this.now();
        return { ok: true };
      }
      case 'jeu':
        if (!sess.game) return { ok: false, msg: 'Aucune partie en cours.' };
        if (a.action?.type === 'num') return this.admin({ type: 'dossard', pid: a.action.pid, value: a.action.value });
        return this.module.adminAction(this.ctx(), sess.game, a.action);
      default:
        return { ok: false, msg: 'Action inconnue.' };
    }
  }

  startGame() {
    const sess = this.sess;
    if (sess.status === 'playing') return { ok: false, msg: 'Déjà lancé.' };
    const pids = sess.registered.filter(p => this.s.people[p]);
    if (pids.length < this.module.minPlayers) return { ok: false, msg: `Il faut au moins ${this.module.minPlayers} inscrits.` };
    sess.game = this.module.start(this.ctx(), pids);
    sess.status = 'playing';
    sess.jeuPause = 0;
    sess.regOverride = null;
    this.s.show = null; // un nouveau jeu masque le classement de la soirée affiché à l'écran
    // Duel : si tout le monde a son numéro de maillot, les duels commencent tout de suite.
    if (this.module.id === 'duel') {
      const r = this.module.adminAction(this.ctx(), sess.game, { type: 'lancer' });
      if (!r.ok) return { ok: true, msg: `Partie lancée, mais il manque des numéros de maillot : saisis-les puis « Lancer le premier tour ».` };
      return { ok: true, msg: 'C\'est parti, les duels commencent !' };
    }
    return { ok: true, msg: 'La partie commence !' };
  }

  finishGame() {
    this.sess.jeuPause = 0;
    this.sess.status = 'finished';
    this.sess.finishedAt = this.now();
  }

  // Classement de la soirée : jeux archivés + jeu en cours s'il est terminé.
  classement() {
    const recs = this.s.history.filter(r => inSoiree(r.gameId));
    const sess = this.sess;
    if (sess.game && sess.status === 'finished' && inSoiree(sess.gameId)) recs.push({ gameId: sess.gameId, results: this.module.results(this.ctx(), sess.game) });
    return classement.compute(this.s.config.classement, recs, pid => this.s.people[pid]?.name ?? '?', this.s.bonus, id => this.gameName(id));
  }

  archive() {
    const sess = this.sess;
    if (!sess.game) return;
    this.s.history.push({ gameId: sess.gameId, at: this.now(), results: this.module.results(this.ctx(), sess.game) });
    sess.game = null;
  }

  // Appelé régulièrement. Renvoie true si l'état a changé.
  tick() {
    const sess = this.sess;
    if (sess.status === 'countdown' && !sess.countdown.pausedAt && this.remaining() <= 0) {
      const r = this.startGame();
      if (!r.ok) { sess.status = 'idle'; sess.message = r.msg; }
      return true;
    }
    if (sess.status === 'playing' && sess.game) {
      if (sess.jeuPause) return false; // jeu en pause : le temps est arrêté
      const changed = this.module.tick(this.ctx(), sess.game);
      if (sess.game.finished) { this.finishGame(); return true; }
      return changed;
    }
    return false;
  }

  player(token, a) {
    const me = this.identify(token);
    if (!me) return { ok: false, msg: 'Inscris-toi d\'abord.' };
    if (a.type === 'inscription') return this.register(me.id, a.on !== false);
    const g = this.sess.game;
    if (!g || this.sess.status !== 'playing') return { ok: false, msg: 'Aucune partie en cours.' };
    if (this.sess.jeuPause) return { ok: false, msg: 'Le jeu est en pause.' };
    return this.module.playerAction(this.ctx(), g, me.id, a);
  }

  // Mini-Jeux : le téléphone prend un nom de la liste (et reçoit une identité s'il n'en a pas encore).
  claimMini(token, nom) {
    const sess = this.sess;
    if (sess.gameId !== 'minijeux' || !sess.game || sess.status !== 'playing') return { ok: false, msg: "La journée n'est pas ouverte." };
    let me = this.identify(token);
    const created = !me;
    if (!me) me = { id: uid(), token: /^[a-f0-9]{32}$/.test(token || '') ? token : uid(16), name: String(nom ?? '').trim().slice(0, 24) || '?' };
    const r = this.module.claim(this.ctx(), sess.game, me.id, nom);
    if (!r.ok) return r;
    if (created) this.s.people[me.id] = me;
    return { ...r, token: me.token, pid: me.id };
  }

  // Données lourdes d'un jeu (ex. le film d'un sport), pour l'écran public.
  data(q) {
    const g = this.sess.game;
    if (!g || !this.module.data) return null;
    return this.module.data(this.ctx(), g, q);
  }

  orga(a) {
    const g = this.sess.game;
    if (!g || !this.module.orgaAction) return { ok: false, msg: 'Pas de safe zone dans ce jeu.' };
    return this.module.orgaAction(this.ctx(), g, a);
  }

  // Nom affiché d'un jeu (modifiable dans l'admin).
  gameName(id = this.sess.gameId) {
    return (this.s.config.nomsJeux?.[id] || '').trim() || GAMES[id]?.name || id;
  }

  // ---------- vues ----------
  common() {
    const sess = this.sess;
    return {
      gameId: sess.gameId,
      sessionId: sess.id || '',
      boot: BOOT,
      gameName: this.gameName(),
      games: Object.values(GAMES).map(m => ({ id: m.id, name: this.gameName(m.id) })),
      status: sess.status,
      paused: !!sess.countdown.pausedAt || (sess.status === 'playing' && !!sess.jeuPause),
      jeuPause: sess.status === 'playing' ? sess.jeuPause || 0 : 0,
      remaining: this.remaining(),
      endsAt: this.endsAt(),
      inscriptionsAt: sess.status === 'countdown' ? this.endsAt() - this.s.config.inscriptions * 1000 : 0,
      inscriptionsOpen: this.inscriptionsOpen(),
      registeredCount: sess.registered.length,
      message: sess.message,
    };
  }

  screenView() {
    const sess = this.sess;
    const c = this.classement();
    return {
      ...this.common(),
      show: this.s.show,
      roulette: this.s.roulette,
      finishedAt: sess.finishedAt || 0,
      classement: { rows: c.rows.slice(0, 30).map(r => ({ pid: r.pid, rank: r.rank, name: r.name, total: r.total, mult: r.mult, games: r.games })), held: c.held },
      registered: sess.registered.map(p => this.s.people[p]?.name).filter(Boolean),
      game: sess.game ? this.module.screenView(this.ctx(), sess.game) : null,
    };
  }

  playerView(token) {
    const me = this.identify(token);
    const sess = this.sess;
    const v = { ...this.common(), me: null };
    // Mini-Jeux : un téléphone sans identité peut quand même choisir son nom dans la liste.
    if (!me && sess.gameId === 'minijeux' && sess.game && (sess.status === 'playing' || sess.status === 'finished')) v.game = this.module.playerView(this.ctx(), sess.game, null);
    if (!me) return v;
    v.me = { name: me.name, registered: sess.registered.includes(me.id), dossard: sess.dossards?.[me.id] || '' };
    const c = this.classement();
    const row = c.rows.find(r => r.pid === me.id);
    if (row) v.me.soiree = { rank: row.rank, total: row.total, mult: row.mult, count: c.rows.length };
    if (sess.game && (sess.status === 'playing' || sess.status === 'finished')) v.game = this.module.playerView(this.ctx(), sess.game, me.id);
    return v;
  }

  orgaView() {
    const g = this.sess.game;
    return { ...this.common(), orga: g && this.module.orgaView ? this.module.orgaView(this.ctx(), g) : null };
  }

  adminView() {
    const sess = this.sess;
    return {
      ...this.common(),
      config: { decompte: this.s.config.decompte, inscriptions: this.s.config.inscriptions, orgaCode: this.s.config.orgaCode, classement: this.s.config.classement, nomsJeux: this.s.config.nomsJeux },
      show: this.s.show,
      programme: this.s.config.programme,
      soiree: this.s.soiree,
      // Jeux déjà joués à cette soirée (dans le classement).
      joues: [...this.s.history.map(h => h.gameId), ...(sess.game && sess.status === 'finished' ? [sess.gameId] : [])],
      fullConfig: this.s.config,
      reglagesMaj: this.s.reglagesMaj || 0,
      soirees: this.s.soirees || [],
      classement: this.classement(),
      people: Object.values(this.s.people).map(p => ({ pid: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      gameConfig: this.gameCfg(),
      registered: sess.registered.map(p => ({ pid: p, name: this.s.people[p]?.name, dossard: sess.dossards?.[p] || '' })),
      game: sess.game ? this.module.adminView(this.ctx(), sess.game) : null,
    };
  }
}
