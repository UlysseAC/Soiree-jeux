// Un espace = une soirée complète (jeux, réglages, joueurs, classement, sauvegarde) avec ses appareils connectés.
// Le site de base n'a qu'un espace, l'espace par défaut (code « »). Un site à plusieurs soirées (pour les clients)
// en a un par client, sous /s/<code>/… ; chacun ne voit et ne reçoit que sa propre soirée.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { Soiree, restore } from './soiree.js';
import { Simulation } from './simulation.js';

const clone = o => JSON.parse(JSON.stringify(o));

// Mot de passe admin d'un espace client : jamais gardé en clair.
export function chiffrer(motDePasse) {
  const sel = randomBytes(16).toString('hex');
  return `${sel}:${scryptSync(String(motDePasse), sel, 32).toString('hex')}`;
}
export function verifier(motDePasse, chiffre) {
  const [sel, h] = String(chiffre || '').split(':');
  if (!sel || !h) return false;
  const a = scryptSync(String(motDePasse ?? ''), sel, 32), b = Buffer.from(h, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export class Espace {
  // code : '' pour l'espace par défaut ; storage : sa sauvegarde ; saved : l'état relu ; motDePasse(p) : vérifie le mot de passe admin ;
  // liens : { joinUrl, qr, qrTest } ; io : le serveur Socket.IO (pour les sons de l'écran) ; infos : ajouté à la vue admin.
  constructor({ code = '', nom = '', storage, saved, motDePasse, liens, io, infos = () => ({}), jeux = null }) {
    Object.assign(this, { code, nom, storage, motDePasse, liens, io, infos });
    this.sockets = new Set();
    this.salle = `esp:${code}`;
    this.activite = Date.now();
    const son = salle => name => io?.to(`${this.salle}:${salle}`).emit('sfx', name);
    this.soiree = new Soiree(restore(saved), { onSfx: son('ecran'), jeux });
    // Pendant une vraie partie, la simulation de l'admin tourne dans une soirée séparée (mêmes réglages, jamais sauvegardée),
    // visible sur l'écran de test.
    this.sim = new Simulation(this.soiree, () => this.broadcast(), () => new Soiree(restore({ config: clone(this.soiree.s.config) }), { onSfx: son('ecran-test') }));
    // Testeur des téléphones de test : complètement indépendant de la soirée (soirée vierge, aucun joueur ni réglage repris).
    const vierge = () => new Soiree(restore({}), { onSfx: son('ecran-test') });
    this.testeur = new Simulation(vierge(), () => this.broadcast(false), vierge);
    this.pending = false;
  }

  // Écran et téléphones de test (?test) : ils suivent le testeur, ou la simulation de l'admin quand elle tourne à part.
  simTest() { return !this.testeur.running && this.sim.aPart ? this.sim : this.testeur; }
  src(sock) { return !sock.data.test ? this.soiree : this.simTest().ecran(); }

  viewFor(sock) {
    const d = sock.data, { joinUrl, qr, qrTest } = this.liens;
    if (d.role === 'admin') return { ...this.soiree.adminView(), simulation: this.sim.status(), sauvegardeEnLigne: this.storage.remote, ...this.infos() };
    if (d.role === 'ecran') return { ...this.src(sock).screenView(), joinUrl: d.test ? `${joinUrl}?test` : joinUrl, qr: d.test ? qrTest : qr, test: !!d.test };
    if (d.role === 'orga') return this.soiree.orgaView();
    if (d.role === 'salle') return { ...this.soiree.salleView(d.salle), joinUrl };
    return d.test ? { ...this.src(sock).playerView(d.token), simulation: this.simTest().status() } : this.soiree.playerView(d.token);
  }

  // N'envoie l'état que s'il a changé depuis le dernier envoi à ce téléphone ou écran : moins de données sur le réseau.
  // Les chronos tournent sur les appareils eux-mêmes, ils n'ont pas besoin d'un envoi chaque seconde.
  envoyer(sock, force = false) {
    const v = this.viewFor(sock), json = JSON.stringify(v);
    if (!force && json === sock.data.dernier) return;
    sock.data.dernier = json;
    sock.emit('etat', v);
  }

  // Envoie l'état aux appareils de CET espace seulement (et sauvegarde, sauf persist = false).
  broadcast(persist = true) {
    if (persist) this.save();
    if (this.pending) return;
    this.pending = true;
    setImmediate(() => {
      this.pending = false;
      for (const sock of this.sockets) if (sock.data.role) this.envoyer(sock);
    });
  }

  entrer(sock) {
    this.sockets.add(sock);
    this.activite = Date.now();
  }
  sortir(sock) {
    this.sockets.delete(sock);
    this.activite = Date.now();
  }

  // Simulation lancée par l'admin : seulement avec les jeux inclus dans cette soirée.
  simulation(a) {
    if (a.cmd === 'start') {
      const jeux = (a.games?.length ? a.games : ['chemin', 'grandpari', 'duel']).filter(g => this.soiree.autorise(String(g).startsWith('mini:') ? 'minijeux' : g));
      if (!jeux.length) return { ok: false, msg: 'Ce jeu n\'est pas inclus dans cette soirée.' };
      a = { ...a, games: jeux };
    }
    return this.sim.handle(a);
  }

  // Horloge des jeux (décompte, chronos, simulations).
  tick() {
    const vrai = this.soiree.tick(), test = this.sim.tick() | this.testeur.tick();
    if (vrai || test) this.broadcast();
  }

  // Un espace sans appareil connecté, sans décompte ni partie ni simulation peut être retiré de la mémoire.
  inactif(now = Date.now(), delai = 30 * 60e3) {
    const st = this.soiree.sess.status;
    return !this.sockets.size && st !== 'countdown' && st !== 'playing' && !this.sim.running && !this.testeur.running && now - this.activite > delai;
  }

  save() { this.storage.save(() => this.soiree.s); }
  flush() { return this.storage.flush(() => this.soiree.s); }
}
