# 🎉 Soirée Jeux

Des jeux de soirée où **un grand écran sert de console** (TV, projecteur, ordi) et **chaque téléphone sert de manette**. Pas d'appli à installer : les joueurs scannent un QR code.

## Lancer

Il faut [Node.js](https://nodejs.org) 18 ou plus récent.

```bash
npm install
npm start
```

- **Écran (console)** : ouvre `http://localhost:3000` sur l'ordinateur branché à la TV.
- **Manettes** : les joueurs scannent le QR code affiché (ou tapent l'adresse `http://<ip-de-l-ordi>:3000/m`).
  Les téléphones doivent être sur **le même Wi-Fi** que l'ordinateur.

Autre port : `PORT=8080 npm start`. Adresse des manettes forcée : `URL_MANETTE=http://192.168.1.20:3000/m npm start`.

## Déroulement

1. **Préparation**
   - Chaque jeu a ses **réglages** (bouton ⚙ Régler) : durée, nombre d'imposteurs, catégorie de mots, points…
   - Ajoute ou retire les jeux de la soirée, et **choisis l'ordre** dans le programme (↑ ↓).
   - Les réglages et le programme sont **mémorisés** (fichier `data/config.json`) pour la prochaine fois.
   - Les joueurs peuvent déjà rejoindre.
2. **Soirée** : « Démarrer la soirée ▶ » remet les scores à zéro et affiche l'accueil avec le QR code.
   - ◀ / ▶ en bas pour passer d'un jeu à l'autre, ▶ dans le programme pour sauter directement à un jeu.
   - **⚙ Réglages** reste disponible : un changement s'applique à la manche suivante (les points, tout de suite).
   - **📋 Programme** : ajouter, retirer ou réordonner des jeux en cours de soirée.
   - **🏆 Scores** : corriger un score à la main. Le classement est cumulé sur toute la soirée.
3. **Fin** : podium, puis « Reprendre la soirée » ou « Préparer une nouvelle soirée ».

Un téléphone qui se met en veille ou perd le Wi-Fi se reconnecte tout seul et garde son score.

## Jeux inclus

| Jeu | Type | Principe |
| --- | --- | --- |
| 🕵️ L'Imposteur | Mixte | Tout le monde reçoit le même mot secret, sauf l'imposteur. Discussion chronométrée, puis vote sur les téléphones. Mode Undercover : l'imposteur reçoit un mot proche sans le savoir. |
| 🔔 Buzzer Quiz | Mixte | Un meneur lit les questions, les téléphones deviennent des buzzers. L'écran affiche qui a buzzé en premier et compte les points. |
| 🎭 Mime, Dessine ou Décris | Physique | Chacun son tour fait deviner un max de mots : le mot s'affiche sur son téléphone, le chrono sur l'écran. |

Les listes de mots sont dans `jeux/mots.js`, faciles à compléter.

## Organisation du code

```
server.js            Serveur : état de la soirée, réglages, joueurs, diffusion temps réel (Socket.IO)
jeux/
  index.js           Catalogue des jeux
  imposteur.js …     Un fichier par jeu
  mots.js            Listes de mots
  outils.js          Hasard, mélange, chrono avec pause
public/
  ecran.html + js/ecran.js       L'écran console
  manette.html + js/manette.js   La manette téléphone
  css/style.css
tests/simulation.js  Simule une soirée complète avec 4 téléphones (npm test)
```

## Ajouter un jeu

1. Crée `jeux/mon-jeu.js` qui exporte :

```js
module.exports = {
  id: 'mon-jeu',
  nom: 'Mon jeu',
  icone: '🎲',
  genre: 'mixte',            // 'physique' | 'mixte' | 'numerique'
  description: 'Une phrase pour le catalogue.',
  minJoueurs: 2,
  reglages: [
    // types : 'nombre' (min, max, pas, unite), 'choix' (options), 'interrupteur', 'texte'
    { cle: 'duree', libelle: 'Durée', court: 'Durée', type: 'nombre', min: 10, max: 120, pas: 10, unite: ' s', defaut: 30 },
  ],
  creer: (ctx) => new MonJeu(ctx),
};
```

2. La classe reçoit `ctx` :
   - `ctx.reglages()` : réglages **actuels** (à relire au début de chaque manche pour profiter des changements en direct)
   - `ctx.joueurs()`, `ctx.joueur(id)`, `ctx.ajouterPoints(id, n)`
   - `ctx.maj()` : à appeler après chaque changement pour rafraîchir écran et téléphones

   et doit fournir `actionEcran(action, donnees)`, `actionManette(idJoueur, action, donnees)`,
   `vueEcran()`, `vueManette(idJoueur)` et `detruire()` (arrêter ses minuteurs).

3. Ajoute-le dans `jeux/index.js`, puis son affichage dans `RENDUS` (`public/js/ecran.js`) et `MANETTES` (`public/js/manette.js`).
   Un bouton `data-act="jeu" data-v="mon-action"` sur l'écran appelle `actionEcran('mon-action')` ;
   `data-act="mon-action"` sur la manette appelle `actionManette(id, 'mon-action')`.

## Sécurité

Pensé pour un réseau privé (la maison) : il n'y a pas de mot de passe sur l'écran console. Ne l'expose pas sur Internet tel quel.
