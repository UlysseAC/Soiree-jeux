'use strict';
/**
 * Catalogue des jeux. Pour ajouter un jeu : créer un fichier dans ce dossier
 * (voir README, section « Ajouter un jeu ») puis l'ajouter à cette liste.
 */
const liste = [
  require('./imposteur'),
  require('./buzzer'),
  require('./mimes'),
];

module.exports = Object.fromEntries(liste.map((jeu) => [jeu.id, jeu]));
