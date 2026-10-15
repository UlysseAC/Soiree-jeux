# Jeu 4 — Les Mini-Jeux (structure)

Une journée de rounds à heures régulières. À chaque round, un mini-jeu et des joueurs tirés au sort. Chaque mini-jeu a un nom, une page de règles écrite par l'organisateur, un format et des points par place. Un mini-jeu est soit **manuel** (l'organisateur saisit les places à la fin), soit un jeu automatique joué sur les téléphones : pour l'instant **La Définition**, **Le Temple aztèque** et **Le Mime**.

## Avant la journée (onglet « Réglages du jeu »)

- **Participants** : un nom par ligne.
- **Journée** : heure de début, heure de fin, nombre de rounds. Les rounds sont répartis à intervalles égaux (8 h et 12 rounds = un round toutes les 40 min). L'admin voit combien de rounds chacun jouera.
- **Programme** : le mini-jeu de chaque round, dans l'ordre (un mini-jeu peut revenir). « Remplir automatiquement » enchaîne en boucle les mini-jeux cochés « utilisés ».
- **Les 6 mini-jeux** : nom (libre), **type** (manuel, La Définition, Le Temple aztèque ou Le Mime), page de règles (affichée en grand sur l'écran et sur les téléphones avant le jeu), **format**, durée indicative, points par place (ex. « 10, 6, 3, 1 »).
- **Format** : vide = chacun pour soi, avec un nombre de joueurs par round (0 = tout le monde) ; ou des équipes : `1v1v1v1` (4 joueurs, chacun pour soi), `2v2`, `3v1`, `2v1`, `2v2v2`, `3v3`… (8 équipes et 10 joueurs par équipe au plus). Les équipes s'appellent Rouges, Bleus, Verts, Jaunes… Les places se donnent par équipe et chaque membre reçoit les points de la place de son équipe.
- Réglages pris en compte tout de suite : participants, noms, règles, points. Horaires, nombre de rounds et programme : fixés à l'ouverture de la journée.

## Pendant la journée

1. **Ouvrir la journée** (onglet « Partie en cours »), de préférence avant l'heure de début. Ouverte en retard, la journée commence 10 min plus tard ; ouverte la veille au soir, elle a lieu le lendemain. Ensuite, chacun scanne le QR code et **touche son nom** sur son téléphone. Un nom ne peut être pris que par un téléphone ; l'admin peut le libérer.
2. **Annonce** : 5 min avant chaque round (réglable), les joueurs sont tirés au sort. L'écran affiche le mini-jeu, les noms et les règles, avec un carillon ; le téléphone des joueurs tirés vibre et affiche « C'est ton tour ! ».
3. **« J'ai compris »** : chaque joueur tiré lit les règles et appuie sur « J'ai compris ». Le jeu commence quand **tous** ont appuyé (l'écran et l'admin montrent qui manque). L'admin peut aussi « Commencer maintenant » sans attendre.
4. **Round manuel** : l'admin donne une place à chaque joueur (ex æquo possibles) et valide : les points s'ajoutent, l'écran affiche les résultats, puis le prochain round est annoncé à son heure. Un round en cours bloque le suivant tant que les résultats ne sont pas saisis. Un round automatique (La Définition) calcule les places lui-même.
5. **Fin** : après le dernier round, l'écran affiche le podium de la journée.

## Tirage au sort

- On prend d'abord ceux qui ont **le moins joué** : tout le monde joue autant, à un round près.
- Puis ceux qui **n'ont pas joué le round d'avant**, puis ceux qui ont **un téléphone connecté**, puis ceux qui ont **le moins joué ensemble** ; le hasard départage.
- Le tirage se fait **au moment de chaque round** (pas de programme fixé le matin).
- **Équipes** : dans un format inégal (3v1, 2v1…), le joueur seul est celui qui l'a été le moins souvent. Pour le reste, on évite de remettre ensemble les mêmes coéquipiers.
- Le téléphone indique l'équipe et les partenaires : « Équipe Rouges : tu joues avec Louis et Jade contre Tom ».

## Commandes de l'admin

- Tirer au sort et annoncer maintenant, commencer maintenant (sans attendre les « J'ai compris »).
- **Absents : remplacement manuel**. Remplacer un joueur (la liste propose d'abord ceux qui ont le moins joué), retirer ou ajouter un joueur.
- Sauter un round, corriger les résultats d'un round terminé, décaler le planning de ±5 min, terminer la journée.

## La Définition

- **Réglages** : la liste des **mots inventés** (un par ligne, écrite par l'organisateur), le nombre de joueurs, le nombre de manches (3 par défaut), le temps d'écriture, de vote et d'affichage des réponses, le bonus des meilleurs devineurs (1 point par défaut).
- **Chaque manche** : chaque joueur reçoit sur son téléphone un mot tiré au hasard dans la liste (les mots déjà sortis dans la journée ne reviennent qu'après les autres) et écrit sa définition.
- **Vote** : quand tout le monde a écrit (ou à la fin du temps), l'écran affiche les mots et leurs définitions, sans dire qui avait quel mot. Les **spectateurs** (participants connectés qui ne jouent pas ce round) relient chaque mot à un joueur sur leur téléphone.
- **Réponses** : l'écran montre à qui était chaque mot et combien de personnes l'ont trouvé. Puis manche suivante, avec un nouveau mot pour chacun.
- **Gagnant** : le joueur dont le mot a été relié à lui le plus de fois, sur toutes les manches (ex æquo possibles). Les points du mini-jeu sont donnés selon cette place.
- **Meilleurs devineurs** : les spectateurs sont classés selon leurs bonnes réponses sur toutes les manches. Le premier tiers (arrondi au-dessus : 1 sur 2 ou 3, 2 sur 4 à 6…), ex æquo compris, gagne le bonus, à condition d'avoir au moins une bonne réponse. Ce classement s'affiche sur l'écran avec les résultats et sur le téléphone de chaque spectateur.
- **Admin** : voit qui a quel mot et les définitions en direct, peut « Passer à l'étape suivante ». Un joueur absent peut être remplacé (le remplaçant reprend son mot) ; retirer ou ajouter un joueur n'est pas possible une fois le jeu lancé.
- Sans spectateur connecté, le vote est sauté.

## Le Temple aztèque

- Jeu de chance, chacun pour soi. **Réglages** : la liste des **obstacles** (un par ligne ; après « | », ce qui arrive si c'est le piège, ex. « Pont de lianes | Le pont s'effondre ! »), une liste de **pièges** de secours (pour les obstacles sans phrase), le nombre d'**étapes** (5 par défaut), de **vies** (3), le temps pour choisir et le temps d'affichage du piège. Une liste d'exemples est déjà remplie : modifie-la comme tu veux.
- **Chaque étape** : deux obstacles tirés de la liste, affichés sur l'écran et sur les téléphones. Chaque joueur encore en vie choisit un passage (il peut changer d'avis jusqu'à la fin du temps ; sans choix, le hasard choisit pour lui). Personne ne voit le choix des autres avant la révélation.
- **Révélation** : l'un des deux obstacles, tiré au sort, est le piège, le même pour tout le monde. L'écran montre le piège (« Le plafond s'écroule ! »), qui est passé où, et ceux qui perdent une vie ; leur téléphone vibre. À 0 vie, on est éliminé.
- **Arrivée** : après la dernière étape (ou quand tout le monde est éliminé), l'écran montre ceux qui arrivent au temple et récupèrent le trésor.
- **Classement** : ceux qui arrivent au temple, du plus de vies au moins de vies, puis les éliminés, du plus loin au moins loin. Ex æquo possibles.
- **Admin** : voit les vies et les choix en direct, peut « Passer à l'étape suivante » et remplacer un joueur (le remplaçant reprend ses vies).

## Le Mime

- En **duos** (2 duos par défaut, réglable) : le format est fixé automatiquement (2 duos = 2 contre 2).
- **Réglages** : la liste des **mots à mimer** (un par ligne ; une liste d'exemples est déjà remplie), le nombre de duos, le temps pour mimer (45 s chacun) et le temps pour se préparer (10 s).
- **Déroulement** : le premier de chaque duo mime, duo après duo, puis les rôles s'inversent (2 duos = 4 tours). Avant chaque tour, l'écran annonce qui mime et qui devine ; celui qui mime peut lancer tout de suite avec « C'est parti ! ».
- **Celui qui mime** voit le mot sur son téléphone, sans faire de bruit, et peut **passer au mot suivant** quand il veut. Son téléphone vibre quand son partenaire trouve.
- **Celui qui devine** écrit ses réponses (touche Entrée ou « Valider »), autant de fois qu'il veut. Accents, majuscules, article (« une girafe ») et pluriel ne comptent pas ; une petite faute est acceptée (aucune sur les mots de 3 lettres ou moins, 1 jusqu'à 7 lettres, 2 au-delà). Un mot trouvé passe tout de suite au suivant.
- **Écran** : grand chrono, essais faux barrés, « ✓ MAGICIEN ! » quand c'est trouvé, mots trouvés et passés du tour, score de chaque duo. Le mot en cours n'apparaît jamais sur l'écran ni chez les autres.
- Un mot ne revient jamais dans le même round ; dans la journée, les mots déjà sortis reviennent en dernier. Plus de mots : le tour s'arrête.
- **Gagnant** : le duo qui a fait trouver le plus de mots (ex æquo possibles) ; chaque membre reçoit les points de la place du duo.
- **Admin** : voit le mot en cours et les essais, peut « Passer à l'étape suivante » et remplacer un joueur.

## Classement

Classement de la journée, séparé du classement de la soirée des 3 autres jeux : somme des points de chaque round, affiché sur l'écran et sur chaque téléphone.

## À définir avec les 6 mini-jeux

- Les 5 autres mini-jeux (quiz…).
- Départage des ex æquo au classement final.
