# Jeu 5 — L'Enquête

Un Cluedo grandeur nature, pour 12 à 14 joueurs, en 2 h au plus.

## L'histoire

Après un dîner, tout le monde se réveille amnésique. Il y a un cadavre dans la maison. Le coupable est l'un des joueurs, mais il ne le sait pas lui-même.

Le texte d'introduction s'écrit dans **Réglages des jeux → L'Enquête → Histoire**. Une ligne du texte donne un paragraphe à l'écran.

## Les cartes

- **11 salles**, **un personnage par joueur** et **7 armes**. Les noms se changent dans les réglages.
- **Personnages** : un nom par ligne dans les réglages. Au lancement, chaque joueur reçoit un personnage **au hasard**. Seul le joueur voit son personnage : l'écran, les tablettes et les autres téléphones n'affichent que les prénoms (tout est révélé à la fin). Pendant l'introduction, l'admin peut encore changer le personnage d'un joueur (onglet Partie en cours).
- **La solution** est une salle, un personnage et une arme. Personne n'a ces cartes.
  - Elle est tirée au hasard, ou fixée dans les réglages avec le nom exact.
  - Le joueur dont le personnage est dans la solution est le tueur, sans le savoir.
- **Chaque joueur reçoit 3 cartes.** Une carte peut être chez 2 joueurs au plus.

## Préparer la soirée

1. Choisis « L'Enquête » dans l'onglet Soirée, puis lance le décompte et les inscriptions comme pour les autres jeux.
2. Prépare une tablette par salle. Dans l'admin (onglet Partie en cours ou Réglages), ouvre « Tablette 1 » à « Tablette 11 », chacune sur la tablette de sa salle.
   - Le **code orga** est demandé une seule fois sur chaque tablette.
   - L'adresse d'une tablette est `/salle?n=0` pour la 1re salle, et ainsi de suite.
3. La tablette affiche le nom de la salle, un QR code qui change toutes les 30 s, le code à 4 chiffres et les joueurs présents.

## Déroulé

1. **Introduction.** Au lancement, l'écran affiche le texte d'introduction. Chaque téléphone affiche son personnage et ses 3 cartes. Clique sur **« Lancer l'enquête »** dans l'admin pour démarrer le chrono.
2. **Se déplacer.** Le joueur scanne le QR code de la tablette avec l'appareil photo. Il peut aussi taper le code à 4 chiffres dans « Changer de salle ». Il n'est que dans une salle à la fois.
   - Si un QR code ne passe pas, l'admin place le joueur dans la bonne salle depuis le tableau des enquêteurs.
3. **Interroger.** On choisit un joueur présent dans la même salle, un personnage et une arme. Le lieu est toujours la salle où l'on se trouve.
   - Le joueur interrogé choisit quelle carte montrer, s'il en a plusieurs. Seul celui qui a posé la question la voit.
   - Sans réponse dans le délai (1 min par défaut), une carte est montrée au hasard.
   - On ne peut pas interroger deux fois de suite la même personne.
   - Il faut attendre 30 s entre deux questions.
   - L'écran indique qu'une carte a été montrée, sans dire laquelle.
4. **Indice de la salle.** Chaque joueur a droit à un indice par salle, tiré du texte écrit pour cette salle (voir plus bas).
5. **Fiche de détective : sur papier.** Le téléphone garde, dans l'onglet **💡 Indices**, tous les indices obtenus (avec la salle et l'heure) et toutes les questions posées avec la carte montrée.
6. **Phase finale.** Elle commence automatiquement au bout de 1 h 30, ou quand l'admin la lance avec le bouton. Pendant la phase finale :
   - chaque joueur a 2 indices par salle ;
   - chaque `{…}` d'un indice donne 2 cartes au lieu d'une.
7. **Accuser.** Chaque joueur peut accuser **une seule fois**.
   - Si l'accusation est juste, il gagne et l'enquête s'arrête.
   - Sinon, il ne peut plus accuser, mais il doit toujours répondre aux questions.
8. **Fin.** L'enquête s'arrête :
   - quand quelqu'un accuse juste ;
   - à la fin des 2 h ;
   - quand tout le monde a accusé ;
   - quand l'admin clique sur « Terminer ».

   L'écran révèle alors la solution et le tueur.

## Indices des tablettes

Les indices s'écrivent dans **Réglages → L'Enquête → Indices des tablettes**, avec une zone par salle.

- **Ordre.** Une ligne de texte est un indice, donné dans l'ordre : la 1re ligne au 1er indice du joueur dans cette salle, la 2e ligne au suivant (en phase finale), etc.
- **Repères à remplacer.**
  - `{carte}` est remplacé par une carte qui n'est pas dans la solution et que le joueur ne connaît pas encore.
  - `{perso}`, `{arme}` et `{salle}` font la même chose pour un seul type de carte.
  - La carte donnée n'est jamais une carte que le joueur connaît déjà.
- **Indice à recouper.** `{3salle}`, `{3arme}`, `{3perso}` et `{3carte}` sont remplacés par 3 cartes dont **au plus une** est dans la solution (une fois sur deux). Exemple : « Au moins 2 de ces 3 salles ne sont pas le lieu du crime : {3salle}. » Le joueur doit recouper avec d'autres infos.
- **Indices automatiques.** Quand une salle n'a plus de ligne écrite, un des modèles automatiques est tiré au hasard (une ligne = un modèle) : par défaut, une carte innocentée, ou 3 salles, armes ou personnages dont au moins 2 sont innocents.

## Classement de la soirée

Le gagnant est premier. Les autres joueurs sont classés selon le nombre d'indices obtenus. Les points vont de 90 pour le 1er à 15 pour le dernier, et se règlent dans l'onglet Classement.
