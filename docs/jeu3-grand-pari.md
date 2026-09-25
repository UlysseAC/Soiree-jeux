# Jeu 3 — Le Grand Pari

Croquis des animations : [`maquettes/jeu3-croquis.html`](maquettes/jeu3-croquis.html).

## Principe

- Partie d'environ 45 minutes. Chaque joueur inscrit commence avec **1 000 $** (réglable).
- **3 sports**, un toutes les **15 minutes** (réglable) : 🏇 course de chevaux, ⚽ match de foot, 🥊 battle royale de boxe.
- Entre les sports : on **parie** sur le sport suivant et on **investit**.
- Les paris ferment **15 secondes avant le départ** (réglable), avec un décompte sur l'écran.
- À la fin, le joueur le plus riche gagne. Le classement « Les plus riches » est affiché en permanence.

Le serveur tire le résultat de chaque sport au départ et enregistre son déroulé image par image ; l'écran public rejoue exactement ce film. Tous les écrans voient la même chose et personne ne peut connaître le résultat à l'avance.

## 🏇 Course de chevaux

- 8 chevaux (noms réglables), **2 tours** d'hippodrome ovale en **45 s** (réglables).
- Pari sur un cheval. Gains selon la place, réglables place par place : 1er ×3, 2e ×1,5, 3e ×0,5, les autres ×0.

## ⚽ Match de foot

- 5 contre 5 : gardien, défenseur, milieu, deux attaquants. Par défaut FC Barcelone (Joan García, Cubarsí, Olmo, Raphinha, Lamine Yamal) contre Real Madrid. Noms des équipes, couleurs, noms des joueurs et notes d'attaque/défense réglables.
- **2 min 30** (réglable) pour 90 minutes de jeu, avec les règles : coup d'envoi (chacun dans sa moitié, adversaire hors du rond central), **touche** à la main depuis la ligne pour l'équipe qui n'a pas touché le ballon en dernier, **corner** si un défenseur l'a sorti derrière son but (centre dans la surface), sinon **six mètres** ; les adversaires reculent au moment de la remise en jeu.
- Les joueurs cherchent des **passes vers l'avant** (coéquipier démarqué, ligne de passe libre), avancent balle au pied s'il n'y a personne devant, et **frappent** dès qu'ils arrivent près du but. Tacles, dribbles, interceptions, arrêts, fautes et commentaires en direct. Aperçu : [`maquettes/jeu3-foot.html`](maquettes/jeu3-foot.html).
- Paris : vainqueur **×2** (réglable), **match nul**, **buteur** (marque au moins un but), **nombre de buts** (0, 1, 2, 3, 4 ou plus).
- Les cotes du nul, des buteurs et du nombre de buts sont calculées en simulant 120 matchs au début de la partie : `cote = (1 − marge) / probabilité`, marge de 10 % réglable, entre ×1,1 et ×50.

## 🥊 Battle royale de boxe

- **Tous les inscrits** combattent sur un ring posé sur l'eau, chacun avec sa couleur (rappelée sur son téléphone). Celui qui tombe à l'eau est éliminé ; le ring rétrécit à la fin.
- Durée **2 min** (réglable). On peut parier sur n'importe qui, soi-même compris.
- Gains selon la place du combattant choisi (réglables) : 1er ×8, top 3 ×3, top 25 % ×1,5, top 50 % remboursé, sinon perdu.

## 📈 Investissements

- Un **bloc** d'investissements s'ouvre avant chaque sport et se termine à son départ.
- Nombre par bloc selon les inscrits (réglable) : moins de 10 → 2, 10 à 19 → 3, 20 à 34 → 4, 35 et plus → 5.
- Chaque investissement est tiré d'un catalogue réglable (nom, gain, % de joueurs à convaincre, $ requis par joueur, % remboursé si échec).
- Réussi si le **montant** (joueurs × $ par joueur) **et** le **nombre d'investisseurs** (% des joueurs, 2 minimum) sont atteints : chacun récupère sa mise × gain. Sinon, chacun récupère le pourcentage de remboursement prévu.

## Écrans

- **Écran public** : entre les sports, le prochain sport et son décompte, les investissements en cours (barres de progression) et le classement des plus riches (qui glisse avec ▲ ▼). Pendant un sport, son animation en plein écran, puis les résultats et les plus gros gagnants. À la fin, confettis et podium.
- **Téléphone** : argent et rang, onglets Parier / Investir / Mes paris. Pendant un sport : « regarde l'écran » (et sa couleur pour la boxe).
- **Admin** : programme, lancer un sport tout de suite, décaler les horaires, investissements, argent de chaque joueur, cotes du foot ; tous les réglages ci-dessus.
