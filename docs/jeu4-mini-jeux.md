# Jeu 4 — Les Mini-Jeux (structure)

> Le **Quiz** est un type de mini-jeu (tout le monde joue) : voir la section « Le Quiz » ci-dessous.

Une journée de rounds à heures régulières. À chaque round, un mini-jeu et des joueurs tirés au sort. Chaque mini-jeu a un nom, une page de règles écrite par l'organisateur, un format et des points par place. Un mini-jeu est soit **manuel** (l'organisateur saisit les places à la fin), soit un jeu automatique joué sur les téléphones : pour l'instant **La Définition**, **Le Temple aztèque**, **Le Mime**, **La Chasse au dragon**, **L'Anecdote** et **Qu'est-ce qui a changé ?** (mémoire).

## Avant la journée (onglet « Réglages du jeu »)

- **Participants** : un nom par ligne.
- **Journée** : heure de début, heure de fin, nombre de rounds. Les rounds sont répartis à intervalles égaux (8 h et 12 rounds = un round toutes les 40 min). L'admin voit combien de rounds chacun jouera.
- **Programme** : le mini-jeu de chaque round, dans l'ordre (un mini-jeu peut revenir). « Remplir automatiquement » enchaîne en boucle les mini-jeux cochés « utilisés ».
- **Les 7 mini-jeux** : nom (libre), **type** (manuel, La Définition, Le Temple aztèque, Le Mime, La Chasse au dragon, L'Anecdote ou Qu'est-ce qui a changé ?), page de règles (affichée en grand sur l'écran et sur les téléphones avant le jeu), **format**, durée indicative, points par place (ex. « 10, 6, 3, 1 »).
- **Format** : vide = chacun pour soi, avec un nombre de joueurs par round (0 = tout le monde) ; ou des équipes : `1v1v1v1` (4 joueurs, chacun pour soi), `2v2`, `3v1`, `2v1`, `2v2v2`, `3v3`… (8 équipes et 10 joueurs par équipe au plus). Les équipes s'appellent Rouges, Bleus, Verts, Jaunes… Les places se donnent par équipe et chaque membre reçoit les points de la place de son équipe.
- Réglages pris en compte tout de suite : participants, noms, règles, points. Horaires, nombre de rounds et programme : fixés à l'ouverture de la journée.

## Pendant la journée

1. **Ouvrir la journée** (onglet « Partie en cours »), de préférence avant l'heure de début. Ouverte en retard, la journée commence 10 min plus tard ; ouverte la veille au soir, elle a lieu le lendemain. Ensuite, chacun scanne le QR code et **touche son nom** sur son téléphone. Un nom ne peut être pris que par un téléphone ; l'admin peut le libérer.
2. **Annonce** : 5 min avant chaque round (réglable), les joueurs sont tirés au sort. L'écran affiche le mini-jeu, les noms et les règles, avec un carillon ; le téléphone des joueurs tirés vibre et affiche « C'est ton tour ! ».
3. **« J'ai compris »** : chaque joueur tiré lit les règles et appuie sur « J'ai compris ». Le jeu commence quand **tous** ont appuyé (l'écran et l'admin montrent qui manque). L'admin peut aussi « Commencer maintenant » sans attendre.
4. **Round manuel** : l'admin donne une place à chaque joueur (ex æquo possibles) et valide : les points s'ajoutent, l'écran affiche les résultats, puis le prochain round est annoncé à son heure. Un round en cours bloque le suivant tant que les résultats ne sont pas saisis. Un round automatique (La Définition) calcule les places lui-même.
5. **Fin** : après le dernier round, l'écran affiche le podium de la journée.

## Tester avec de vrais joueurs (hors programme)

- Ouvre la journée (« Ouvrir la journée ») : les joueurs choisissent leur nom sur leur téléphone, sans ordre à respecter.
- Dans « Lancer un mini-jeu maintenant », choisis un des mini-jeux configurés et appuie sur « Lancer maintenant » : les inscrits sont tirés au sort et le round est annoncé tout de suite, à côté du programme.
- Le round est marqué « hors programme » ; le programme prévu n'est pas modifié.
- Les rounds prévus à leur heure peuvent toujours se déclencher pendant le test : utilise « Sauter » ou « Terminer la journée » pour les écarter.

## Décors

Chaque mini-jeu a son décor sur l'écran et les téléphones : plateau télé (Le Quiz), forteresse et braises (La Chasse au dragon), bibliothèque (La Définition), chalet au coin du feu (L'Anecdote), Paris en noir et blanc (Le Mime), bureau de détective (Qu'est-ce qui a changé ?) et jungle aztèque (Le Temple). Sur l'écran, le décor reste pendant tout le round (annonce, partie, résultats) et, entre deux rounds, c'est celui du prochain mini-jeu qui s'affiche pendant l'attente. Les mini-jeux « Manuel » gardent l'écran habituel.

## Tirage au sort

Sur l'écran, l'annonce d'un round commence par une machine à sous : les joueurs tirés apparaissent un par un, un nom toutes les 2 secondes, puis l'annonce s'affiche. Pas de machine à sous quand tout le monde joue (Le Quiz).

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

- **Réglages** : la liste des **mots inventés** (un par ligne, écrite par l'organisateur), le nombre de joueurs, le nombre de manches (3 par défaut), le temps pour les définitions à l'oral, de vote et d'affichage des réponses, le bonus des meilleurs devineurs (1 point par défaut).
- **Chaque manche** : chaque joueur reçoit sur son téléphone un mot tiré au hasard dans la liste (les mots déjà sortis dans la journée ne reviennent qu'après les autres). Les **mots s'affichent sur l'écran**, et chaque joueur **définit son mot à l'oral**, à voix haute. Pas de texte à écrire sur le téléphone.
- **Vote** : à la fin du temps à l'oral (ou quand l'admin passe à l'étape suivante), les spectateurs (participants connectés qui ne jouent pas ce round) relient chaque mot à un joueur sur leur téléphone. Ils ont entendu les définitions ; l'écran ne montre que les mots, sans dire qui avait quel mot.
- **Réponses** : l'écran montre à qui était chaque mot et combien de personnes l'ont trouvé. Puis manche suivante, avec un nouveau mot pour chacun.
- **Gagnant** : le joueur dont le mot a été relié à lui le plus de fois, sur toutes les manches (ex æquo possibles). Les points du mini-jeu sont donnés selon cette place.
- **Meilleurs devineurs** : les spectateurs sont classés selon leurs bonnes réponses sur toutes les manches. Le premier tiers (arrondi au-dessus : 1 sur 2 ou 3, 2 sur 4 à 6…), ex æquo compris, gagne le bonus, à condition d'avoir au moins une bonne réponse. Ce classement s'affiche sur l'écran avec les résultats et sur le téléphone de chaque spectateur.
- **Admin** : voit qui a quel mot et les définitions en direct, peut « Passer à l'étape suivante ». Un joueur absent peut être remplacé (le remplaçant reprend son mot) ; retirer ou ajouter un joueur n'est pas possible une fois le jeu lancé.
- Sans spectateur connecté, le vote est sauté.
- **L'Anecdote** garde son écriture sur les téléphones (voir sa section).

## Qu'est-ce qui a changé ? (mémoire)

- **Réglages** : la liste des **objets** (un par ligne, avec un emoji devant si on veut : « 🍎 Pomme » ; 40 exemples fournis), le nombre de joueurs (0 = tout le monde), les manches (5), les objets à la 1re manche (6) et en plus à chaque manche (2), le temps pour mémoriser (15 s) et pour répondre (20 s), la manche à partir de laquelle les objets changent de place (3).
- **Chaque manche** : l'écran montre la scène (« Regardez bien ! »), puis un court écran noir, puis la même scène avec un objet en moins : un trou à sa place, ou bien tous les objets mélangés à partir de la manche réglée.
- **Sur le téléphone** : 4 propositions, l'objet disparu et 3 objets qui n'étaient pas dans la scène (regarder l'écran n'aide pas). Une seule réponse ; la manche se termine quand tout le monde a répondu ou à la fin du temps.
- **Points** : bonne réponse = 100 points + jusqu'à 50 points de rapidité. L'écran montre l'objet qui revient à sa place, qui a trouvé et en combien de temps. Le meilleur total sur toutes les manches gagne.

## L'Anecdote

- Même déroulement que La Définition, sans liste à écrire à l'avance. **Réglages** : nombre de joueurs, manches (3), temps pour écrire, pour deviner, d'affichage des réponses, bonus des meilleurs devineurs (1).
- **Chaque manche** : chaque joueur écrit sur son téléphone une anecdote vraie sur lui. Les anecdotes s'affichent sur l'écran sous forme de cartes A, B, C… (l'ordre ne dit rien de leur auteur).
- **Vote** : les spectateurs relient chaque anecdote à un joueur sur leur téléphone. **Réponses** : l'écran montre à qui était chaque anecdote et combien l'ont reconnue.
- **Gagnant** : le joueur qu'on a le **moins** souvent reconnu, sur toutes les manches (ex æquo possibles). Les spectateurs sont classés comme dans La Définition : le premier tiers gagne le bonus.

## Le Temple aztèque

- Jeu de chance, chacun pour soi. **Réglages** : la liste des **obstacles**, un par ligne, sous la forme `nom | ce qui arrive si c'est le piège | décor` (ex. « Pont de bois | Le pont s'effondre ! | eau » ; la phrase et le décor sont facultatifs), une liste de **pièges** de secours (pour les obstacles sans phrase), le nombre d'**étapes** (5 par défaut), de **vies** (3), le temps pour choisir et le temps d'affichage du piège. Une liste d'exemples est déjà remplie : modifie-la comme tu veux.
- **Chemins à chaque étape** : réglables étape par étape dans un tableau (2, 3 ou 4 chemins, et combien sont piégés ; il reste toujours au moins un chemin sûr). Par exemple 2 chemins aux deux premières étapes, puis 3, puis 4 dont 2 piégés.
- **Affichage sur l'écran** : la carte vue du dessus, ou la première version (un bloc de pierre par chemin, entre deux torches).
- **Chaque étape** : les obstacles tirés de la liste, affichés sur l'écran et sur les téléphones. Chaque joueur encore en vie choisit un passage (il peut changer d'avis jusqu'à la fin du temps ; sans choix, le hasard choisit pour lui). Personne ne voit le choix des autres avant la révélation.
- **Révélation** : les chemins piégés sont tirés au sort, les mêmes pour tout le monde. L'écran montre le piège (« Le plafond s'écroule ! »), qui est passé où, et ceux qui perdent une vie ; leur téléphone vibre. À 0 vie, on est éliminé.
- **Carte vue du dessus** (écran) : chaque étape est une plateforme de pierre reliée à la suivante par 2 à 4 chemins (de haut en bas, dans l'ordre des boutons du téléphone), jusqu'au temple. Les explorateurs sont de petits personnages au t-shirt de couleur ; la couleur de chacun est rappelée sous la carte et sur son téléphone. Les étapes pas encore découvertes sont cachées par un « ? ».
- **Décors** : eau (pont de bois), tunnel, jungle (léopard), marais, pierre (pieux), volcan (éruption), ravin (arche qui se brise), serpents, liane (saut au-dessus d'un ravin, la liane casse), escalade (paroi rocheuse, chute de pierres). Choisi en fin de ligne, sinon deviné d'après le nom (jungle si aucun mot n'est reconnu). L'onglet Réglages montre le décor retenu pour chaque obstacle.
- **Animation de la révélation** : tout le monde part sur le chemin choisi et s'arrête avant l'obstacle (tambour, la carte tremble), puis le piège se déclenche ; ceux qui tombent réapparaissent à la plateforme suivante en clignotant avec 💔, ou restent ☠️ là où ils sont tombés s'ils n'ont plus de vie.
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

## La Chasse au dragon

- Jeu de tir **sans violence** (pistolets, « 💥 touché ! », « 😵 hors jeu », jamais de sang). **Chacun pour soi** (4 joueurs) ou **2 contre 2** (son coéquipier n'est jamais une cible).
- **Réglages** : équipes, vies par joueur (2), vie du dragon (10 touches), durée maximale (3 min), balles par chargeur (3), temps pour recharger (2 s), intervalle des attaques du dragon (8 à 12 s).
- **L'écran montre la scène en direct, vue de face** : le dragon au fond avec sa barre de vie, les joueurs devant, chacun derrière son muret en bois. À l'abri, on ne voit que le haut de sa tête ; quand il vise ou recharge, il se lève. Une ligne de visée relie chaque tireur à sa cible (pointillée pendant la seconde de visée, pleine quand il peut tirer) ; les tirs, les touches, les « PAF ! à l'abri » et le souffle du dragon s'animent. Sous chaque muret : nom, vies, balles, dégâts au dragon.
- **Le téléphone sert de manette** :
  - **Viser** : le joueur se lève (il peut être touché) et prend une cible, d'abord un adversaire, même s'il est à l'abri ;
  - **Téléphone à l'horizontale** : à gauche (pouce gauche), un bouton par adversaire et un pour le dragon, de même taille ; à droite (pouce droit), Viser en haut, Tirer au milieu, Recharger en bas. Sur un téléphone en portrait, un message demande de le tourner.
  - **Cibles** : on ne peut en choisir une qu'en visant. Un adversaire hors jeu est grisé.
  - **Tirer** : possible après 1 s sur la même cible (changer de cible relance la seconde). Un joueur n'est touché que s'il est debout ; à l'abri, c'est « raté ». Le dragon est toujours touché.
  - **Recharger** : remplit le chargeur, debout pendant 2 s ; ensuite on reprend sa visée. Grisé quand le chargeur est plein ou pendant la recharge.
  - **Se cacher** : même case que Viser (le bouton devient « Se cacher » quand on vise ou qu'on recharge). Tirer est grisé quand on est caché ou sans balles.
- **Le dragon** ne bouge pas ; il attaque à intervalles irréguliers, annoncé 2 s avant sur l'écran, et touche tous ceux qui sont debout.
- **Fin** : dragon vaincu, un seul joueur (ou une équipe) encore en jeu, ou temps écoulé. **Classement** : les survivants d'abord, selon leurs dégâts sur le dragon ; puis les éliminés, le dernier éliminé devant.
- **Admin** : voit ce que fait chacun, ses balles, la prochaine attaque, et peut arrêter la partie.

## Classement

Classement de la journée, séparé du classement de la soirée des 3 autres jeux : somme des points de chaque round, affiché sur l'écran et sur chaque téléphone.

## À définir avec les mini-jeux

- Départage des ex æquo au classement final.

## Le Quiz

- Un mini-jeu comme les autres (type « Le Quiz » dans les réglages du mini-jeu), mais **tout le monde joue**, sans inscription par round : chaque joueur de la soirée répond.
- **Questions** : dans les réglages du mini-jeu « Le Quiz », section « Questions ». Un bloc par question, séparés par une ligne vide. La 1re ligne est la question, les 4 suivantes sont les réponses, et la bonne réponse commence par une étoile `*`. L'admin vérifie en direct : une question sans 4 réponses ou sans une seule bonne réponse est signalée en rouge.
- **Déroulement** : une question à la fois. Chaque joueur répond une seule fois sur son téléphone (4 boutons A à D). L'écran affiche la question, le compte à rebours et le nombre de réponses. Quand tout le monde a répondu, ou à la fin du temps, la bonne réponse s'affiche en vert avec le nombre de personnes qui ont choisi chaque réponse. Puis la question suivante.
- **Réglages** : temps pour répondre (20 s) et affichage de la bonne réponse (8 s).
- **Points à chaque question, en direct** : le premier qui répond juste gagne **2 points**, les autres bonnes réponses **1 point**. La **dernière question** vaut plus : **5 points** au premier, 4 au 2e, 3 au 3e, 2 au 4e, puis 1. Les points s'ajoutent au classement des mini-jeux dès la correction de chaque question (écran, téléphones, admin).
- **Classement du round** : le plus de points, puis le plus de bonnes réponses, puis le plus rapide. Il n'y a pas de « Points par place » pour le quiz, ni de correction des places. Si l'admin saute le quiz en cours, les points déjà donnés sont retirés.
- **Admin** : voit la question, la bonne réponse, qui n'a pas encore répondu, et peut « Afficher la bonne réponse » ou passer à la question suivante.
- **Simulation** : le quiz est proposé dans « Tester un mini-jeu » de l'onglet Soirée, avec des faux joueurs qui répondent au hasard.
