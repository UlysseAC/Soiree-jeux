# Jeu 2 — Duel au Far West

Cahier des charges validé. Maquette de l'écran public : [`maquettes/duel-far-west.html`](maquettes/duel-far-west.html).

## Avant le jeu

- Décompte et inscriptions comme pour tous les jeux (45 min / 15 min par défaut, réglables).
- Chaque joueur porte un **numéro dans le dos** (dossard). Après les inscriptions, l'admin affiche la liste des inscrits avec un champ **numéro** pour chacun ; un numéro ne peut pas être donné deux fois.
- Le téléphone de chaque joueur est son **pistolet**.

## Phase 1 — duels au numéro (jusqu'à 8 joueurs restants)

- **Tour 1** : tout le monde joue, tous les duels sont affichés en même temps.
- Tours suivants : duels **tirés au sort** parmi les survivants, jusqu'à ce qu'il en reste 8. Nombre impair : un joueur tiré au hasard passe directement.
- Pas de décompte : dès que « **Charlotte vs Arthur** » apparaît à l'écran, le pavé numérique s'active sur les deux téléphones. Personne ne connaît son adversaire à l'avance.
- Les joueurs sont libres de bouger.
- Le premier qui tape **le numéro dans le dos de l'autre** gagne. Un **mauvais numéro** : le pistolet explose, l'autre gagne.
- Personne ne tire après 20 s (réglable) : le duel est rejoué.

## Phase 2 — face-à-face (les 8 derniers)

- Un seul duel à la fois : quarts, demies, finale.
- L'écran affiche le duel, des **bruits de pas** passent sur les enceintes pendant une durée aléatoire (3 à 10 s, réglable), puis l'écran affiche « **FEU !** ».
- Le téléphone n'affiche plus qu'une **gâchette** : le premier qui appuie après le signal gagne.
- Tirer avant le signal : le pistolet explose et le joueur perd une vie ; le duel recommence avec les bruits de pas.
- **3 vies pour toute la phase 2** : 2 erreurs permises, la 3ᵉ est fatale (le joueur perd le duel).
- Horloges des téléphones synchronisées avec le serveur : on compare l'heure exacte de l'appui, pas l'heure d'arrivée, pour que le Wi-Fi ne fausse pas le résultat.
- L'écran public demande un clic sur « Activer le son » à l'ouverture (exigence des navigateurs).

## Primes et paris (montants réglables)

Prime de survie selon le tour atteint (le montant double à chaque tour ; exemple à 40 joueurs) :

| Éliminé au | Tour 1 | Tour 2 | Tour 3 | Tour 4 | Demi | Finaliste | Vainqueur |
|---|---|---|---|---|---|---|---|
| Prime | 100 $ | 200 $ | 400 $ | 800 $ | 1 600 $ | 3 200 $ | 6 400 $ |

- À l'élimination, chaque joueur reçoit aussi **300 $ de jetons de pari**.
- Il les répartit sur **1 à 3 joueurs encore en jeu**. Pari définitif, un seul par joueur. Jetons non misés perdus.
- Gain d'un pari : `mise × (1 + 0,5 × duels gagnés ensuite par le joueur choisi)`.
- Équilibre : le meilleur parieur possible (éliminé au tour 1, tout sur le vainqueur) gagne ~1 150 $, soit à peu près une demi-finale ; le vainqueur gagne 6 400 $.

## Écran public

- **Arbre** à partir du tour 2 : une colonne par tour, **prime affichée sur chaque colonne**, duel en cours mis en avant, gagnant ✓ et branche dorée, perdant barré, numéros des dossards.
- En phase 1, les cases du tour suivant restent « ? » : les duels sont tirés au moment où ils apparaissent et l'arbre se réorganise. En phase 2, l'arbre complet est affiché.
- En phase 2, les vies restantes de chaque joueur sont affichées.
- À côté : **classement des parieurs** (joueurs éliminés, gains des paris), top 10, mis à jour à chaque fin de duel. Les lignes **glissent** vers leur nouvelle place : **vert ▲ N** pour qui monte, **rouge ▼ N** pour qui descend.
- Fin : confettis et nom du vainqueur.

## Classement de la soirée

Le classement final regroupe **les 3 jeux** et s'affiche à la fin de la soirée. Le système de points sera défini une fois les 3 jeux décrits.
