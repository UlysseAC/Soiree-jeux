'use strict';
const { PAIRES } = require('./mots');
const { hasard, melanger, optionsCategories, Chrono } = require('./outils');

const reglages = [
  { cle: 'nbImposteurs', libelle: "Nombre d'imposteurs (max. selon le nombre de joueurs)", court: 'Imposteurs', type: 'nombre', min: 1, max: 3, pas: 1, defaut: 1 },
  {
    cle: 'mode', libelle: 'Mode de jeu', court: 'Mode', type: 'choix', defaut: 'classique',
    options: [
      { valeur: 'classique', libelle: "Classique : l'imposteur sait qu'il l'est et n'a pas de mot", court: 'Classique' },
      { valeur: 'undercover', libelle: "Undercover : l'imposteur reçoit un mot proche, sans le savoir", court: 'Undercover' },
    ],
  },
  { cle: 'categorie', libelle: 'Catégorie de mots', court: 'Catégorie', type: 'choix', defaut: 'toutes', options: optionsCategories(PAIRES) },
  { cle: 'indice', libelle: "Mode classique : donner la catégorie à l'imposteur", court: 'Indice', type: 'interrupteur', defaut: true },
  { cle: 'dureeDiscussion', libelle: 'Durée de la discussion', court: 'Discussion', unite: ' s', type: 'nombre', min: 30, max: 600, pas: 15, defaut: 120 },
  { cle: 'pointsCivils', libelle: 'Points pour chaque civil si l’imposteur est démasqué', court: 'Pts civils', type: 'nombre', min: 0, max: 5, pas: 1, defaut: 1 },
  { cle: 'pointsImposteur', libelle: "Points pour l'imposteur s'il s'en sort", court: 'Pts imposteur', type: 'nombre', min: 0, max: 10, pas: 1, defaut: 2 },
];

class Imposteur {
  constructor(ctx) {
    this.ctx = ctx;
    this.phase = 'attente'; // attente → revelation → discussion → vote → resultat
    this.manche = 0;
    this.message = null;
    this.m = null; // données de la manche en cours
    this.chrono = null;
  }

  detruire() {
    this.chrono?.arreter();
  }

  actionEcran(action) {
    switch (action) {
      case 'distribuer': return this.distribuer();
      case 'discussion': if (this.phase === 'revelation') this.lancerDiscussion(); return;
      case 'vote': if (this.phase === 'discussion') this.lancerVote(); return;
      case 'reveler': if (this.phase === 'vote') this.reveler(); return;
      case 'pause': this.chrono?.basculer(); return this.ctx.maj();
      case 'annuler':
        this.arreterChrono();
        this.phase = 'attente';
        this.m = null;
        return this.ctx.maj();
    }
  }

  actionManette(id, action, donnees) {
    if (!this.m || !this.dansLaManche(id)) return;
    if (action === 'vu' && this.phase === 'revelation') {
      this.m.vus.add(id);
      if (this.m.joueurs.every((j) => this.m.vus.has(j.id))) return this.lancerDiscussion();
      return this.ctx.maj();
    }
    if (action === 'voter' && this.phase === 'vote') {
      const cible = donnees.cible;
      if (cible === id || !this.dansLaManche(cible)) return;
      this.m.votes.set(id, cible);
      const attendus = this.m.joueurs.filter((j) => this.ctx.joueur(j.id)?.connecte && !this.m.votes.has(j.id));
      if (attendus.length === 0) return this.reveler();
      return this.ctx.maj();
    }
  }

  distribuer() {
    const r = this.ctx.reglages();
    const joueurs = this.ctx.joueurs();
    this.arreterChrono();
    if (joueurs.length < 3) {
      this.phase = 'attente';
      this.message = `Il faut au moins 3 joueurs connectés (actuellement ${joueurs.length}).`;
      return this.ctx.maj();
    }
    // Toujours au moins un civil de plus que d'imposteurs.
    const nb = Math.max(1, Math.min(r.nbImposteurs, Math.floor((joueurs.length - 1) / 2)));
    const categorie = r.categorie === 'toutes' ? hasard(Object.keys(PAIRES)) : r.categorie;
    let [motCivil, motImposteur] = hasard(PAIRES[categorie]);
    if (Math.random() < 0.5) [motCivil, motImposteur] = [motImposteur, motCivil];
    const ordre = melanger(joueurs);
    const imposteurs = new Set(ordre.slice(0, nb).map((j) => j.id));

    this.m = {
      categorie, motCivil, motImposteur, imposteurs,
      mode: r.mode,
      indice: r.indice,
      duree: r.dureeDiscussion,
      pointsCivils: r.pointsCivils,
      pointsImposteur: r.pointsImposteur,
      joueurs: joueurs.map(({ id, nom, couleur }) => ({ id, nom, couleur })),
      premier: hasard(joueurs.filter((j) => !imposteurs.has(j.id))).nom,
      vus: new Set(),
      votes: new Map(),
      resultat: null,
    };
    this.manche++;
    this.message = null;
    this.phase = 'revelation';
    this.ctx.maj();
  }

  lancerDiscussion() {
    this.phase = 'discussion';
    this.chrono = new Chrono(this.m.duree * 1000, () => {
      this.chrono = null;
      this.lancerVote();
    });
    this.ctx.maj();
  }

  lancerVote() {
    this.arreterChrono();
    this.phase = 'vote';
    this.ctx.maj();
  }

  reveler() {
    const m = this.m;
    const compte = new Map();
    for (const cible of m.votes.values()) compte.set(cible, (compte.get(cible) || 0) + 1);
    const max = Math.max(0, ...compte.values());
    const tete = [...compte].filter(([, v]) => v === max).map(([id]) => id);
    const elimine = max > 0 && tete.length === 1 ? tete[0] : null;
    const gagnants = elimine && m.imposteurs.has(elimine) ? 'civils' : 'imposteurs';

    for (const j of m.joueurs) {
      const imp = m.imposteurs.has(j.id);
      if (gagnants === 'civils' && !imp) this.ctx.ajouterPoints(j.id, m.pointsCivils);
      if (gagnants === 'imposteurs' && imp) this.ctx.ajouterPoints(j.id, m.pointsImposteur);
    }
    m.resultat = {
      elimine,
      egalite: max > 0 && tete.length > 1,
      gagnants,
      votes: m.joueurs
        .map((j) => ({ nom: j.nom, couleur: j.couleur, voix: compte.get(j.id) || 0, imposteur: m.imposteurs.has(j.id) }))
        .sort((a, b) => b.voix - a.voix),
    };
    this.phase = 'resultat';
    this.ctx.maj();
  }

  arreterChrono() {
    this.chrono?.arreter();
    this.chrono = null;
  }

  dansLaManche(id) {
    return !!this.m?.joueurs.some((j) => j.id === id);
  }

  nomDe(id) {
    return this.m?.joueurs.find((j) => j.id === id)?.nom ?? '?';
  }

  vueEcran() {
    const base = { phase: this.phase, manche: this.manche, message: this.message, nbJoueurs: this.ctx.joueurs().length };
    if (!this.m || this.phase === 'attente') return base;
    const m = this.m;
    const vue = {
      ...base,
      categorie: m.categorie,
      mode: m.mode,
      nbImposteurs: m.imposteurs.size,
      premier: m.premier,
      joueurs: m.joueurs.map((j) => ({ nom: j.nom, couleur: j.couleur, vu: m.vus.has(j.id), aVote: m.votes.has(j.id) })),
      chrono: this.chrono?.vue() ?? null,
    };
    if (this.phase === 'resultat') {
      vue.resultat = {
        ...m.resultat,
        elimine: m.resultat.elimine ? this.nomDe(m.resultat.elimine) : null,
        imposteurs: [...m.imposteurs].map((id) => this.nomDe(id)),
        motCivil: m.motCivil,
        motImposteur: m.mode === 'undercover' ? m.motImposteur : null,
      };
    }
    return vue;
  }

  vueManette(id) {
    if (!this.m || this.phase === 'attente') return { phase: 'attente' };
    if (!this.dansLaManche(id)) return { phase: 'spectateur' };
    const m = this.m;
    const imp = m.imposteurs.has(id);
    const role = m.mode === 'classique' && imp
      ? { imposteur: true, mot: null, categorie: m.indice ? m.categorie : null }
      : { imposteur: false, mot: imp ? m.motImposteur : m.motCivil, categorie: null };
    const vue = { phase: this.phase, role, vu: m.vus.has(id) };
    if (this.phase === 'vote') {
      vue.cibles = m.joueurs.filter((j) => j.id !== id).map(({ id: cid, nom, couleur }) => ({ id: cid, nom, couleur }));
      vue.monVote = m.votes.get(id) ?? null;
    }
    if (this.phase === 'resultat') {
      const r = m.resultat;
      vue.resultat = {
        gagne: (r.gagnants === 'civils') !== imp,
        etaisImposteur: imp,
        motCivil: m.motCivil,
        motImposteur: m.mode === 'undercover' ? m.motImposteur : null,
      };
    }
    return vue;
  }
}

module.exports = {
  id: 'imposteur',
  nom: "L'Imposteur",
  icone: '🕵️',
  genre: 'mixte',
  description: "Tout le monde reçoit le même mot secret sur son téléphone… sauf l'imposteur. Discutez, puis votez pour le démasquer.",
  minJoueurs: 3,
  reglages,
  creer: (ctx) => new Imposteur(ctx),
};
