'use strict';

function hasard(tableau) {
  return tableau[Math.floor(Math.random() * tableau.length)];
}

function melanger(tableau) {
  const t = [...tableau];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

/** Liste d'options « catégorie » pour un réglage de type choix. */
function optionsCategories(dictionnaire) {
  return [
    { valeur: 'toutes', libelle: 'Toutes les catégories', court: 'Toutes' },
    ...Object.keys(dictionnaire).map((c) => ({ valeur: c, libelle: c })),
  ];
}

/** Compte à rebours côté serveur, avec pause. Les écrans affichent `vue()`. */
class Chrono {
  constructor(ms, aLaFin) {
    this.total = ms;
    this.restant = ms;
    this.aLaFin = aLaFin;
    this.enPause = false;
    this._lancer();
  }
  _lancer() {
    this.finA = Date.now() + this.restant;
    this.t = setTimeout(() => {
      this.t = null;
      this.restant = 0;
      this.aLaFin();
    }, this.restant);
  }
  reste() {
    return this.enPause ? this.restant : Math.max(0, this.finA - Date.now());
  }
  pause() {
    if (this.enPause || !this.t) return;
    clearTimeout(this.t);
    this.t = null;
    this.restant = this.reste();
    this.enPause = true;
  }
  reprendre() {
    if (!this.enPause) return;
    this.enPause = false;
    this._lancer();
  }
  basculer() {
    if (this.enPause) this.reprendre();
    else this.pause();
  }
  arreter() {
    clearTimeout(this.t);
    this.t = null;
  }
  vue() {
    return { reste: this.reste(), total: this.total, enPause: this.enPause };
  }
}

module.exports = { hasard, melanger, optionsCategories, Chrono };
