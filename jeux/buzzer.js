'use strict';
const { Chrono } = require('./outils');

const reglages = [
  { cle: 'pointsBonne', libelle: 'Points pour une bonne réponse', court: 'Bonne réponse', type: 'nombre', min: 1, max: 10, pas: 1, defaut: 1 },
  { cle: 'penalite', libelle: 'Points retirés pour une mauvaise réponse', court: 'Pénalité', type: 'nombre', min: 0, max: 5, pas: 1, defaut: 0 },
  { cle: 'tempsReponse', libelle: 'Temps pour répondre après un buzz (0 = illimité)', court: 'Temps', unite: ' s', type: 'nombre', min: 0, max: 60, pas: 5, defaut: 10 },
  { cle: 'bloquer', libelle: "Bloquer un joueur qui s'est trompé jusqu'à la question suivante", court: 'Blocage', type: 'interrupteur', defaut: true },
  { cle: 'son', libelle: "Son du buzzer sur l'écran", court: 'Son', type: 'interrupteur', defaut: true },
];

class Buzzer {
  constructor(ctx) {
    this.ctx = ctx;
    this.phase = 'ferme'; // ferme → ouvert → buzze
    this.question = 1;
    this.exclus = new Set();
    this.buzzeur = null;
    this.numeroBuzz = 0;
    this.message = null;
    this.chrono = null;
  }

  detruire() {
    this.chrono?.arreter();
  }

  actionEcran(action) {
    switch (action) {
      case 'ouvrir':
        if (this.phase !== 'ferme') return;
        this.phase = 'ouvert';
        this.message = null;
        return this.ctx.maj();
      case 'correct': if (this.phase === 'buzze') this.correct(); return;
      case 'faux': if (this.phase === 'buzze') this.faux(); return;
      case 'annuler':
        if (this.phase !== 'buzze') return;
        this.arreterChrono();
        this.buzzeur = null;
        this.phase = 'ouvert';
        return this.ctx.maj();
      case 'suivante':
        this.questionSuivante(null);
        return this.ctx.maj();
      case 'pause': this.chrono?.basculer(); return this.ctx.maj();
    }
  }

  actionManette(id, action) {
    if (action !== 'buzz' || this.phase !== 'ouvert' || this.exclus.has(id)) return;
    this.buzzeur = id;
    this.numeroBuzz++;
    this.phase = 'buzze';
    const t = this.ctx.reglages().tempsReponse;
    if (t > 0) {
      this.chrono = new Chrono(t * 1000, () => {
        this.chrono = null;
        this.faux(true);
      });
    }
    this.ctx.maj();
  }

  correct() {
    const r = this.ctx.reglages();
    const nom = this.ctx.joueur(this.buzzeur)?.nom ?? '?';
    this.ctx.ajouterPoints(this.buzzeur, r.pointsBonne);
    this.questionSuivante({ type: 'bonne', texte: `${nom} a trouvé ! +${r.pointsBonne}` });
    this.ctx.maj();
  }

  faux(tempsEcoule = false) {
    const r = this.ctx.reglages();
    const nom = this.ctx.joueur(this.buzzeur)?.nom ?? '?';
    if (r.penalite) this.ctx.ajouterPoints(this.buzzeur, -r.penalite);
    if (r.bloquer) this.exclus.add(this.buzzeur);
    const malus = r.penalite ? ` (−${r.penalite})` : '';
    this.message = { type: 'faux', texte: tempsEcoule ? `Temps écoulé pour ${nom}${malus}` : `Raté pour ${nom}${malus}` };
    this.arreterChrono();
    this.buzzeur = null;
    const restants = this.ctx.joueurs().filter((j) => !this.exclus.has(j.id));
    if (restants.length === 0) this.questionSuivante({ type: 'faux', texte: "Personne n'a trouvé ! On passe à la suite." });
    else this.phase = 'ouvert';
    this.ctx.maj();
  }

  questionSuivante(message) {
    this.arreterChrono();
    this.buzzeur = null;
    this.exclus.clear();
    this.question++;
    this.phase = 'ferme';
    this.message = message;
  }

  arreterChrono() {
    this.chrono?.arreter();
    this.chrono = null;
  }

  vueEcran() {
    const r = this.ctx.reglages();
    const b = this.buzzeur && this.ctx.joueur(this.buzzeur);
    return {
      phase: this.phase,
      question: this.question,
      message: this.message,
      buzzeur: b ? { nom: b.nom, couleur: b.couleur } : null,
      numeroBuzz: this.numeroBuzz,
      exclus: [...this.exclus].map((id) => this.ctx.joueur(id)?.nom).filter(Boolean),
      chrono: this.chrono?.vue() ?? null,
      son: r.son,
      pointsBonne: r.pointsBonne,
      penalite: r.penalite,
    };
  }

  vueManette(id) {
    return {
      phase: this.phase,
      question: this.question,
      exclu: this.exclus.has(id),
      moi: this.buzzeur === id,
      buzzeurNom: this.buzzeur ? this.ctx.joueur(this.buzzeur)?.nom ?? '?' : null,
    };
  }
}

module.exports = {
  id: 'buzzer',
  nom: 'Buzzer Quiz',
  icone: '🔔',
  genre: 'mixte',
  description: "Un meneur pose les questions à voix haute, les téléphones deviennent des buzzers. Le plus rapide répond, l'écran compte les points.",
  minJoueurs: 1,
  reglages,
  creer: (ctx) => new Buzzer(ctx),
};
