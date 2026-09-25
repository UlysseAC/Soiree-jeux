// État de la soirée : identités des joueurs, décompte, inscriptions et jeu en cours.
import * as chemin from './games/chemin.js';
import * as duel from './games/duel.js';
import * as grandpari from './games/grandpari.js';
import { uid, normName, setPath, mergeDefaults } from './util.js';

export const GAMES = { chemin, duel, grandpari };

export function defaultState() {
  return {
    config: {
      decompte: 2700,
      inscriptions: 900,
      orgaCode: '1234',
      games: Object.fromEntries(Object.values(GAMES).map(m => [m.id, m.defaultConfig()])),
    },
    people: {},
    session: newSession('chemin'),
    history: [],
  };
}

function newSession(gameId) {
  return {
    gameId,
    status: 'idle', // idle | countdown | playing | finished
    countdown: { startedAt: 0, adjust: 0, pausedAt: 0, pausedTotal: 0 },
    regOverride: null, // null | 'open' | 'closed'
    registered: [],
    game: null,
    message: null,
  };
}

// Recharge un état sauvegardé en complétant avec les valeurs par défaut.
export function restore(saved) {
  const def = defaultState();
  if (!saved) return def;
  return {
    ...def,
    ...saved,
    config: mergeDefaults(def.config, saved.config),
  };
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
      me = { id: uid(), token: uid(16), name: clean };
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
        this.s.session = newSession(a.gameId);
        return { ok: true };
      case 'demarrer':
        if (sess.status === 'playing') return { ok: false, msg: 'Partie déjà en cours.' };
        if (sess.status === 'finished') { this.archive(); this.s.session = newSession(sess.gameId); }
        Object.assign(this.sess, { status: 'countdown' });
        Object.assign(this.sess.countdown, { startedAt: now, adjust: 0, pausedAt: 0, pausedTotal: 0 });
        return { ok: true };
      case 'pause':
        if (sess.status !== 'countdown') return { ok: false, msg: 'Pas de décompte en cours.' };
        if (c.pausedAt) { c.pausedTotal += now - c.pausedAt; c.pausedAt = 0; } else c.pausedAt = now;
        return { ok: true };
      case 'ajuster':
        if (sess.status !== 'countdown') return { ok: false, msg: 'Pas de décompte en cours.' };
        c.adjust += Number(a.sec || 0) * 1000;
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
      case 'retirerInscrit':
        sess.registered = sess.registered.filter(x => x !== a.pid);
        return { ok: true };
      case 'config': {
        const done = a.scope === 'soiree'
          ? setPath(this.s.config, a.path, a.value)
          : setPath(this.gameCfg(a.gameId ?? sess.gameId), a.path, a.value);
        return done ? { ok: true } : { ok: false, msg: 'Réglage inconnu.' };
      }
      case 'jeu':
        if (!sess.game) return { ok: false, msg: 'Aucune partie en cours.' };
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
    sess.regOverride = null;
    return { ok: true, msg: 'La partie commence !' };
  }

  finishGame() {
    this.sess.status = 'finished';
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
    return this.module.playerAction(this.ctx(), g, me.id, a);
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

  // ---------- vues ----------
  common() {
    const sess = this.sess;
    return {
      gameId: sess.gameId,
      gameName: this.module.name,
      games: Object.values(GAMES).map(m => ({ id: m.id, name: m.name })),
      status: sess.status,
      paused: !!sess.countdown.pausedAt,
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
    return {
      ...this.common(),
      registered: sess.registered.map(p => this.s.people[p]?.name).filter(Boolean),
      game: sess.game ? this.module.screenView(this.ctx(), sess.game) : null,
    };
  }

  playerView(token) {
    const me = this.identify(token);
    const sess = this.sess;
    const v = { ...this.common(), me: null };
    if (!me) return v;
    v.me = { name: me.name, registered: sess.registered.includes(me.id) };
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
      config: { decompte: this.s.config.decompte, inscriptions: this.s.config.inscriptions, orgaCode: this.s.config.orgaCode },
      gameConfig: this.gameCfg(),
      registered: sess.registered.map(p => ({ pid: p, name: this.s.people[p]?.name })),
      game: sess.game ? this.module.adminView(this.ctx(), sess.game) : null,
    };
  }
}
