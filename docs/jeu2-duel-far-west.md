# Jeu 2 — Duel au Far West

Cahier des charges validé. Maquette de l'écran public : [`maquettes/duel-far-west.html`](maquettes/duel-far-west.html).

## Avant le jeu

- Décompte et inscriptions comme pour tous les jeux (45 min / 15 min par défaut, réglables).
- Chaque joueur porte un **numéro dans le dos** (dossard). Après les inscriptions, l'admin affiche la liste des inscrits avec un champ **numéro** pour chacun ; un numéro ne peut pas être donné deux fois.
- Le téléphone de chaque joueur est son **pistolet**.

## Phase 1 — duels au numéro (jusqu'à 8 joueurs restants)

- Chaque joueur commence avec **2 vies**. Perdre un duel fait perdre une vie ; à 0 vie, le joueur est éliminé. Tout le monde survit donc au tour 1.
- Les duels mélangent librement joueurs à 1 et 2 vies (tirage au sort).
- **Tours simultanés** (tous les duels du tour en même temps), en nombre proportionnel aux inscrits, 3 au maximum :

  | Inscrits | < 16 | 16 à 29 | 30 à 44 | 45 et plus |
  |---|---|---|---|---|
  | Tours simultanés | 0 | 1 | 2 | 3 |

  Dès qu'il reste moins de 16 joueurs, on arrête les tours simultanés. Seuils réglables dans l'admin.
- **Tours suivants : pas simultanés.** Les duels apparaissent en grand après un délai aléatoire, **2 au maximum en même temps**, dans une **durée max réglable par tour** (ex. 10 min pour le tour 4, 6 min pour le tour 5).
- **Les noms ne sont connus qu'au début du duel.** Dès que « Charlotte vs Arthur » apparaît, le pavé numérique s'active. Pas de décompte.
- Les joueurs sont libres de bouger.
- Le premier qui tape **le numéro dans le dos de l'autre** gagne. **Le gagnant se qualifie toujours pour le tour suivant.** Un **mauvais numéro** : le pistolet explose, l'autre gagne.
- Personne ne tire après 20 s (réglable) : le duel est rejoué.
- Nombre impair : un joueur ne joue pas ce tour, sans perdre de vie.

### Arriver pile à 8

- On compte **les survivants**, pas les gagnants : dès qu'il reste 8 joueurs en vie, la phase 1 s'arrête (un joueur à 2 vies qui vient de perdre est qualifié s'il est encore en vie).
- **Aucun duel n'est lancé s'il risque de faire passer sous 8** (on compte le pire cas : chaque duel avec un joueur à 1 vie peut éliminer quelqu'un). Ces duels attendent, y compris pendant les tours simultanés. Un duel 2 vies contre 2 vies est toujours possible.
- En fin de phase 1, seuls des duels **1 vie contre 1 vie** sont joués, autant que nécessaire pour tomber à 8 ; les autres attendent.

### Pauses de paris

- Après chaque tour **où il y a de nouveaux éliminés**, pause sans aucun duel pour que les nouveaux éliminés placent leur pari.
- **Durée de pause réglable par tour** (4 min 30 par défaut).

## Phase 2 — face-à-face (les 8 derniers)

- **Tout le monde repart avec 1 vie** : perdre un duel élimine. Ceux qui arrivent avec 2 vies gagnent **+100 $** de bonus.
- Un seul duel à la fois : quarts, demies, finale, avec une pause de paris entre chaque tour.
- L'écran affiche le duel, des **bruits de pas** passent sur les enceintes pendant une durée aléatoire (3 à 10 s, réglable), puis l'écran affiche « **FEU !** ».
- Le téléphone n'affiche plus qu'une **gâchette** : le premier qui appuie après le signal gagne.
- **Tir trop tôt** : le pistolet explose, le duel recommence avec les bruits de pas. **2 erreurs permises sur toute la phase 2, la 3ᵉ est fatale** (le joueur perd le duel).
- Horloges des téléphones synchronisées avec le serveur : on compare l'heure exacte de l'appui, pas l'heure d'arrivée.
- L'écran public demande un clic sur « Activer le son » à l'ouverture (exigence des navigateurs).

## Primes et paris (montants réglables)

| | Prime |
|---|---|
| Phase 1 | 100 $ par tour survécu |
| Arriver au face-à-face avec 2 vies | +100 $ |
| Éliminé en quart | 600 $ |
| Éliminé en demie | 900 $ |
| Finaliste | 1 200 $ |
| Vainqueur | 1 600 $ |

- Les paris se font **sur le téléphone** du joueur éliminé.
- **Mise définitive** : à son élimination, chaque joueur reçoit **300 $ de jetons** et les répartit sur **1 à 3 joueurs encore en jeu** pendant la pause qui suit. Un seul pari par joueur, jetons non misés perdus.
- Gain d'un pari : `mise × (1 + 0,3 × duels gagnés ensuite par le joueur choisi)`.
- Équilibre : le meilleur parieur possible gagne ~1 100 $, à peu près un quart de finaliste qui a bien joué.

## Écran public

- **Arbre** à partir du tour 2 : une colonne par tour, **prime affichée sur chaque colonne**, duel en cours mis en avant, gagnant ✓ et branche dorée, perdant barré, numéros des dossards.
- En phase 1, les cases du tour suivant restent « ? » : les duels sont tirés au moment où ils apparaissent et l'arbre se réorganise. En phase 2, l'arbre complet est affiché.
- Les vies de chaque joueur sont affichées (cœurs) ; en phase 2, les erreurs de tir trop tôt restantes.
- À côté : **classement des parieurs** (joueurs éliminés, gains des paris), top 10, mis à jour à chaque fin de duel. Les lignes **glissent** vers leur nouvelle place : **vert ▲ N** pour qui monte, **rouge ▼ N** pour qui descend.
- Fin : confettis et nom du vainqueur.

## Classement de la soirée

Le classement final regroupe **les 3 jeux** et s'affiche à la fin de la soirée. Le système de points sera défini une fois les 3 jeux décrits.
