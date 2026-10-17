// Mini-jeu « L'Anecdote ».
// Chaque joueur écrit sur son téléphone une anecdote sur lui ; elles s'affichent sur l'écran (cartes A, B, C…).
// Ceux qui ne jouent pas ce round relient chaque anecdote à un joueur. 3 manches par défaut.
// Le joueur qu'on a le MOINS souvent retrouvé gagne ; les spectateurs sont classés comme dans La Définition (bonus au premier tiers).
// Même moteur que La Définition (definition.js), qui se règle d'après r.type.
export { start, tick, playerAction, adminAction, view, renommer } from './definition.js';

export const id = 'anecdote';
export const label = "L'Anecdote";
export const spectateurs = true; // des spectateurs s'inscrivent pour deviner
export const defaults = { manches: 3, tempsEcriture: 120, tempsVote: 90, tempsRevelation: 25, bonusDevineurs: '3, 2, 1' };
