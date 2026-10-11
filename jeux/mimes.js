'use strict';
const { MOTS } = require('./mots');
const { hasard, melanger, optionsCategories, Chrono } = require('./outils');

const MODES = {
  mime: { libelle: 'Mime', icone: '🤐', consigne: 'Fais deviner sans parler ni faire de bruit.' },
  dessin: { libelle: 'Dessin', icone: '✏️', consigne: 'Fais deviner en dessinant, sans lettres ni chiffres.' },
  parole: { libelle: 'Description', icone: '🗣️', consigne: 'Décris le mot sans le dire ni utiliser un mot de la même famille.' },
};

const reglages = [
  {
    cle: 'mode', libelle: 'Façon de faire deviner', court: 'Mode', type: 'choix', defaut: 'aleatoire',
    options: [
      { valeur: 'aleatoire', libelle: 'Tirée au hasard à chaque tour', court: 'Au hasard' },
      { valeur: 'mime', libelle: 'Toujours en mime' },
      { valeur: 'dessin', libelle: 'Toujours en dessin' },
      { valeur: 'parole', libelle: 'Toujours en description' },
    ],
  },
  { cle: 'categorie', libelle: 'Catégorie de mots', court: 'Catégorie', type: 'choix', defaut: 'toutes', options: optionsCategories(MOTS) },
  { cle: 'duree', libelle: "Durée d'un tour", court: 'Durée', unite: ' s', type: 'nombre', min: 20, max: 180, pas: 10, defaut: 60 },
  { cle: 'passes', libelle: 'Mots que l’on peut passer par tour', court: 'Passes', type: 'nombre', min: 0, max: 10, pas: 1, defaut: 3 },
  { cle: 'points', libelle: 'Points par mot trouvé', court: 'Pts/mot', type: 'nombre', min: 1, max: 5, pas: 1, defaut: 1 },
];

class Mimes {
  constructor(ctx) {
    this.ctx = ctx;
    this.phase = 'attente'; // attente → tour → fin
    this.rang = 0;
    this.t = null;
    this.chrono = null;
    this.message = null;
    this.dejaJoues = new Set();
  }

  detruire() {
    this.chrono?.arreter();
  }

  joueurDuTour() {
    const js = this.ctx.joueurs();
    return js.length ? js[this.rang % js.length] : null;
  }

  actionEcran(action) {
    switch (action) {
      case 'commencer': if (this.phase === 'attente') this.demarrer(); return;
      case 'passerJoueur':
        if (this.phase !== 'attente') return;
        this.rang++;
        return this.ctx.maj();
      case 'pause': this.chrono?.basculer(); return this.ctx.maj();
      case 'arreter': if (this.phase === 'tour') this.finir(); return;
      case 'suivant':
        if (this.phase !== 'fin') return;
        this.rang++;
        this.t = null;
        this.phase = 'attente';
        return this.ctx.maj();
    }
  }

  actionManette(id, action, donnees) {
    if (action === 'commencer') {
      if (this.phase === 'attente' && this.joueurDuTour()?.id === id) this.demarrer();
      return;
    }
    if (this.phase !== 'tour' || this.t.joueurId !== id || this.chrono?.enPause) return;
    if (donnees.i !== this.t.i) return; // évite les doubles appuis
    const mot = this.t.mots[this.t.i];
    if (action === 'trouve') {
      this.t.trouves.push(mot);
      this.dejaJoues.add(mot);
      this.ctx.ajouterPoints(id, this.t.points);
    } else if (action === 'passer' && this.t.passesRestantes > 0) {
      this.t.passes.push(mot);
      this.t.passesRestantes--;
    } else return;
    this.t.i++;
    if (this.t.i >= this.t.mots.length) return this.finir();
    this.ctx.maj();
  }

  demarrer() {
    const r = this.ctx.reglages();
    const j = this.joueurDuTour();
    if (!j) {
      this.message = 'Aucun joueur connecté.';
      return this.ctx.maj();
    }
    const mode = r.mode === 'aleatoire' ? hasard(Object.keys(MODES)) : r.mode;
    const pool = r.categorie === 'toutes' ? Object.values(MOTS).flat() : MOTS[r.categorie];
    let frais = pool.filter((m) => !this.dejaJoues.has(m));
    if (frais.length < 10) {
      pool.forEach((m) => this.dejaJoues.delete(m));
      frais = pool;
    }
    this.t = {
      joueurId: j.id, nom: j.nom, couleur: j.couleur, mode,
      mots: melanger(frais), i: 0, trouves: [], passes: [],
      passesRestantes: r.passes, points: r.points,
    };
    this.message = null;
    this.phase = 'tour';
    this.chrono = new Chrono(r.duree * 1000, () => {
      this.chrono = null;
      this.finir();
    });
    this.ctx.maj();
  }

  finir() {
    this.chrono?.arreter();
    this.chrono = null;
    this.phase = 'fin';
    this.ctx.maj();
  }

  vueEcran() {
    if (this.phase === 'attente') {
      const j = this.joueurDuTour();
      return {
        phase: 'attente',
        prochain: j ? { nom: j.nom, couleur: j.couleur } : null,
        mode: this.ctx.reglages().mode,
        modes: MODES,
        message: this.message,
      };
    }
    const t = this.t;
    return {
      phase: this.phase,
      joueur: { nom: t.nom, couleur: t.couleur },
      mode: MODES[t.mode],
      chrono: this.chrono?.vue() ?? null,
      nbTrouves: t.trouves.length,
      passesRestantes: t.passesRestantes,
      trouves: this.phase === 'fin' ? t.trouves : undefined,
      passes: this.phase === 'fin' ? t.passes : undefined,
      points: t.trouves.length * t.points,
    };
  }

  vueManette(id) {
    if (this.phase === 'attente') {
      const j = this.joueurDuTour();
      return { phase: 'attente', monTour: j?.id === id, joueurNom: j?.nom ?? null };
    }
    const t = this.t;
    const monTour = t.joueurId === id;
    if (this.phase === 'tour' && monTour) {
      return {
        phase: 'tour', monTour, mot: t.mots[t.i], i: t.i, mode: MODES[t.mode],
        passesRestantes: t.passesRestantes, nbTrouves: t.trouves.length,
        chrono: this.chrono?.vue() ?? null,
      };
    }
    return { phase: this.phase, monTour, joueurNom: t.nom, mode: MODES[t.mode], nbTrouves: t.trouves.length };
  }
}

module.exports = {
  id: 'mimes',
  nom: 'Mime, Dessine ou Décris',
  icone: '🎭',
  genre: 'physique',
  description: "Chacun son tour, un joueur fait deviner un maximum de mots avant la fin du chrono. Les mots s'affichent sur son téléphone, le chrono sur l'écran.",
  minJoueurs: 2,
  reglages,
  creer: (ctx) => new Mimes(ctx),
};
