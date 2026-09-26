# Jeu 1 — Le Chemin

Cahier des charges validé. Maquette : [`maquettes/le-chemin.html`](maquettes/le-chemin.html).

## Décompte et inscriptions (commun aux 3 jeux)

- Décompte avant le jeu : **45 min** par défaut, modifiable dans l'admin.
- Ouverture des inscriptions : **15 min** avant le début, modifiable.
- Les joueurs s'inscrivent depuis leur téléphone (QR code sur l'écran public). Chaque jeu a sa propre liste d'inscrits.
- Prénoms uniques : un prénom déjà pris est refusé (ajouter l'initiale, ex. « Léa M. »).
- Contrôles admin : démarrer, pause, ±1 min, ouvrir/fermer les inscriptions, lancer le jeu tout de suite.
- Un téléphone qui recharge sa page retrouve son rôle (reconnexion automatique).

## Équipes et rôles

- Les inscrits sont répartis au hasard en **2 équipes**.
- Chaque équipe a des **randoms** (la chaîne) et des **détectives**.
- Les deux équipes ont **le même nombre d'étapes** ; un joueur en trop devient détective.
- Répartition par équipe (15 randoms max, les joueurs en plus deviennent détectives) :

| Joueurs / équipe | < 6 | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | > 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| Détectives | 0 | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 5 | le reste |
| Randoms | tous | 5 | 7 | 8 | 10 | 11 | 13 | 14 | 15 | 15 |

  Formule entre 6 et 20 : `détectives = floor(1 + (n − 6) × 2/7)`.
- Chaque joueur voit son rôle et son équipe. Un random ne connaît pas ses coéquipiers. Un détective connaît **les autres détectives de son équipe**, mais pas les randoms.

## La chaîne (randoms)

1. Le premier joueur voit directement son indice (« Tu es le premier, va chercher… »).
2. Il trouve le **code physique** et le tape → son téléphone affiche le **prénom du joueur suivant** et le **numéro** à lui donner.
3. Le joueur suivant tape ce numéro → il voit son indice → cherche son code physique → etc.
4. La première équipe qui valide la dernière étape gagne.

Détails :
- Codes et numéros : **chiffres uniquement** (pavé numérique). Numéros à **4 chiffres**.
- 3 erreurs de numéro → blocage 30 s. Les codes physiques peuvent être réessayés sans limite.
- **L'étape 15 est toujours la dernière et commune aux deux équipes** (même indice, même code). Avec N randoms : étapes 1 → N−1, puis 15.
- Le code de l'étape 15 n'est accepté que sur le téléphone du dernier joueur, une fois qu'il a reçu son numéro : toutes les étapes d'avant doivent être validées.
- **Épreuve longue** (case à cocher par étape) : le joueur voit « Tu peux te mettre en safe zone : va voir l'orga dans la cuisine ».
- **Indice bonus** (texte par étape, facultatif) : un joueur bloqué peut l'afficher (bouton « 💡 Bloqué ? », avec confirmation). Pénalité : le joueur à qui il donne ensuite le numéro attend **1 min** (réglable) avant de voir son indice ; le code n'est pas accepté pendant ce temps. Pas de pénalité à la dernière étape. L'écran affiche « 💡 L'équipe A utilise un indice bonus », l'admin voit 💡 sur l'étape.
- **Durée max de partie** (réglable) : à la fin, l'équipe la plus avancée gagne ; à égalité, celle qui a atteint son étape en premier.

Configuration admin, par équipe et par étape : numéro reçu, indice (texte libre), indice bonus, code physique, épreuve longue. Boutons : générer les numéros vides au hasard, copier depuis l'autre équipe, enregistrer.

## Détectives et armes

- Un détective tape le code trouvé sur une arme → elle s'ajoute à son inventaire. **Tous les détectives peuvent taper le même code** (chacun a son exemplaire).
- Une arme se réutilise avec un **délai de recharge** réglable par arme.
- Pour attaquer : choisir un joueur (n'importe qui, y compris de sa propre équipe : l'effet s'applique quand même) puis une arme.

| Arme | Cible | Effet (durées réglables) |
|---|---|---|
| Pistolet | 1 joueur | Téléphone bloqué 4 min |
| Fumigène | Toute l'équipe adverse (randoms et détectives) | Bloqués 1 min |
| Menottes (1 seule utilisation) | 1 joueur | Bloqué jusqu'à ce qu'il tape un code de clé de son équipe |
| Loupe | 1 joueur | Révèle son rôle et son équipe |
| Gilet pare-balles | Toute son équipe | Protégée 1 min |
| Don de voyance | Passif | Quand un coéquipier est touché : qui, par quoi, où trouver l'antidote |

Antidotes (objets cachés avec un code, **tapé par la personne touchée** sur son écran de blocage) :
- **Clés** : plusieurs codes par équipe, chaque code sert une fois. La voyance indique où est la prochaine clé.
- **Bandage** : −1 min sur le pistolet.
- **Antidote fumigène** : −1/3 de la durée du fumigène.

Règles d'attaque :
- Impossible de viser quelqu'un **déjà sous attaque**, **immunisé** ou **en safe zone** → « Cible indisponible », l'arme n'est pas consommée.
- **Immunité de 2 min** après chaque attaque (réglable).
- Une attaque lancée pendant un **gilet** est mise en attente et s'applique à la fin du gilet (l'équipe voit « Un fumigène arrive dans 40 s »).
- Joueur bloqué : son téléphone n'affiche que le temps restant et le champ antidote.

## Safe zone

- Un **orga** a une page simplifiée (protégée par un code) : il tape le prénom, choisit une durée (5 min par défaut) et valide.
- La safe zone se termine automatiquement. Un joueur en safe zone ne peut pas être visé et voit toujours son indice.
- Un joueur déjà bloqué ne peut pas être mis en safe zone.
- Lieu (« la cuisine ») et durée par défaut réglables dans l'admin.

## Joueur parti

- Bouton **Joueur parti** dans l'admin → choisir un **remplaçant** de la même équipe. Le remplaçant reçoit l'étape et doit la valider ; le message du joueur précédent pointe vers le remplaçant.
- Sans remplaçant, l'étape peut être sautée : l'équipe ne peut alors plus gagner en finissant, elle ne compte qu'à la durée max, avec une étape en moins.

## Écrans

- **Admin** : décompte, répartition complète (chaîne dans l'ordre + détectives, régénérer avant le départ, masquer les noms), joueurs et états (safe zone, libérer, débloquer étape, joueur parti), étapes, armes et antidotes, réglages.
- **Écran public** : avant le jeu, grand décompte + QR code + inscrits ; pendant, progression des 2 équipes et fil des attaques ; à la fin, **confettis** et **noms des joueurs de l'équipe gagnante** (la chaîne dans l'ordre, puis les détectives).
- **Téléphone** : inscription, random (indice, numéro, « va voir X et donne-lui N »), détective (armes, viser, voyance), bloqué, safe zone.
- **Orga safe zone** : saisie du prénom + durée, liste des joueurs en safe zone.
