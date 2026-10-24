# Classement de la soirée

Tous les chiffres sont réglables dans l'admin, onglet **Classement**.

## Points par jeu

| Jeu | Points |
|---|---|
| Le Chemin (en équipe) | équipe gagnante **60**, équipe perdante **25** |
| Le Grand Pari | selon l'argent final : 1er **60** … dernier **10** |
| Duel au Far West (dernier jeu) | selon le classement final (vainqueur, puis prime + gains de paris) : 1er **90** … dernier **15** |

Pour le Grand Pari et le Duel : `points = min + (max − min) × (joueurs − place) / (joueurs − 1)`. Les ex æquo ont les mêmes points.

## Ne pas pénaliser ceux qui ratent un jeu

Les points d'un joueur sont multipliés par :

`points max des jeux joués à la soirée ÷ points max des jeux qu'il a joués`, plafonné à **×1,5**.

Exemples (les 3 jeux joués à la soirée = 210 points max) : rater le Chemin → 210 / 150 = **×1,4** ; rater le Grand Pari → ×1,4 ; rater le Duel → 210 / 120 = 1,75, plafonné à **×1,5**. Un joueur qui ne fait qu'un seul jeu reste plafonné à ×1,5.

## Bonus manuels et égalités

- L'admin peut ajouter ou retirer des points à n'importe qui (meilleur déguisement, fair-play…), après le multiplicateur.
- Égalités : le plus de jeux gagnés passe devant, puis le meilleur résultat au Duel.

## Affichage

- **Écran public** : le classement s'affiche automatiquement 20 s après la fin de chaque jeu (pendant 40 s), avec les ▲ ▼ ; l'admin peut aussi l'afficher ou lancer le **Grand final** (podium, confettis, fanfare).
- **Téléphone** : « 🏆 Soirée : 7ᵉ sur 32 · 112 pts », avec le bonus s'il y en a un.
- **Admin** : détail des points par jeu, multiplicateur, bonus manuels, total.

## Supprimer tous les joueurs

Onglet Classement, bouton **« 🧹 Supprimer tous les joueurs »** (il demande un 2e clic de confirmation) : efface tous les joueurs connus, pour que leurs prénoms soient de nouveau libres (plus besoin d'ajouter une initiale à cause d'un ancien inscrit).
- Le classement en cours est **archivé** dans les soirées précédentes, puis remis à zéro (comme « Nouvelle soirée »).
- Impossible pendant une partie (seulement quand aucun jeu n'est en cours ou après la fin d'un jeu).
- Les téléphones des anciens joueurs **oublient leur prénom** : ils reviennent à l'écran « Écris ton prénom », au lieu de se réinscrire tout seuls.
