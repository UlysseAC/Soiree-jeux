// Édition du site : ce fichier est le seul (avec README, package.json, render.yaml) à différer entre le site personnel
// (dépôt Soiree-jeux) et la version commerciale (dépôt Soiree-jeux-pro). Tout le reste du code est commun.
export default {
  nom: 'perso',
  // Préfixe des clés de sauvegarde en ligne (Upstash) : permet de partager une même base sans se mélanger.
  prefixe: '',
  // Clé de la soirée par défaut (variable STORAGE_KEY prioritaire).
  cleSauvegarde: 'soiree-jeux',
  // Plusieurs soirées sur le même site (espaces des clients) ; la variable ESPACES=1 l'active aussi.
  espaces: false,
  // Super-admin : sans SUPER_ADMIN_PASSWORD, le mot de passe admin du site sert aussi de mot de passe super-admin.
  superAvecAdmin: false,
  // Grand Pari : équipes de foot fictives au lieu des vrais clubs.
  equipesFictives: false,
  // Module en plus (pages de la version commerciale), chargé au démarrage ; null : aucun.
  extension: null,
};
