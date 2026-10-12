# Jeu 4 — Les Mini-Jeux (structure)

Une journée de rounds à heures régulières. À chaque round, un mini-jeu et des joueurs tirés au sort. Les 6 mini-jeux restent à décrire : pour l'instant, chacun a un nom, des règles affichées sur l'écran, un nombre de joueurs et des points par place, et c'est l'organisateur qui saisit les places à la fin du round.

## Avant la journée (onglet « Réglages du jeu »)

- **Participants** : un nom par ligne.
- **Journée** : heure de début, heure de fin, nombre de rounds. Les rounds sont répartis à intervalles égaux (8 h et 12 rounds = un round toutes les 40 min). L'admin voit combien de rounds chacun jouera.
- **Programme** : le mini-jeu de chaque round, dans l'ordre (un mini-jeu peut revenir). « Remplir automatiquement » enchaîne en boucle les mini-jeux cochés « utilisés ».
- **Les 6 mini-jeux** : nom, règles (affichées sur l'écran et les téléphones), joueurs par round (0 = tout le monde), durée indicative, points par place (ex. « 10, 6, 3, 1 »).
- Réglages pris en compte tout de suite : participants, noms, règles, points. Horaires, nombre de rounds et programme : fixés à l'ouverture de la journée.

## Pendant la journée

1. **Ouvrir la journée** (onglet « Partie en cours ») : chacun scanne le QR code et **touche son nom** sur son téléphone. Un nom ne peut être pris que par un téléphone ; l'admin peut le libérer.
2. **Annonce** : 5 min avant chaque round (réglable), les joueurs sont tirés au sort. L'écran affiche le mini-jeu, les noms et les règles, avec un carillon ; le téléphone des joueurs tirés vibre et affiche « C'est ton tour ! ».
3. **Round** : il commence à l'heure prévue. L'admin donne une place à chaque joueur (ex æquo possibles) et valide : les points s'ajoutent, l'écran affiche les résultats, puis le prochain round est annoncé à son heure. Un round en cours bloque le suivant tant que les résultats ne sont pas saisis.
4. **Fin** : après le dernier round, l'écran affiche le podium de la journée.

## Tirage au sort

- On prend d'abord ceux qui ont **le moins joué** : tout le monde joue autant, à un round près.
- Puis ceux qui **n'ont pas joué le round d'avant**, puis ceux qui ont **un téléphone connecté**, puis ceux qui ont **le moins joué ensemble** ; le hasard départage.
- Le tirage se fait **au moment de chaque round** (pas de programme fixé le matin).

## Commandes de l'admin

- Tirer au sort et annoncer maintenant (le round commence 2 min plus tard), commencer maintenant.
- **Absents : remplacement manuel**. Remplacer un joueur (la liste propose d'abord ceux qui ont le moins joué), retirer ou ajouter un joueur.
- Sauter un round, corriger les résultats d'un round terminé, décaler le planning de ±5 min, terminer la journée.

## Classement

Classement de la journée, séparé du classement de la soirée des 3 autres jeux : somme des points de chaque round, affiché sur l'écran et sur chaque téléphone.

## À définir avec les 6 mini-jeux

- Comment chaque mini-jeu se joue sur les téléphones et sur l'écran (et s'il calcule lui-même les places).
- Départage des ex æquo au classement final.
