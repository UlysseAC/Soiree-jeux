# Jeu 5 — L'Enquête

Un Cluedo grandeur nature, pour 12 à 14 joueurs, en 2 h au plus.

## L'histoire

Après un dîner, tout le monde se réveille amnésique. Il y a un cadavre dans la maison. Le coupable est l'un des joueurs, mais il ne le sait pas lui-même.

Le texte d'introduction s'écrit dans **Réglages des jeux → L'Enquête → Histoire**. Une ligne du texte donne un paragraphe à l'écran.

## Les cartes

- **11 salles**, **un personnage par joueur** et **10 armes**. Les noms se changent dans les réglages.
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

1. **Introduction.** L'écran affiche le texte d'introduction. Chaque téléphone affiche son personnage et ses 3 cartes. Clique sur **« Lancer l'enquête »** dans l'admin : l'éclair frappe.
   - **Panne de courant.** Les plombs ont sauté. Chaque joueur reçoit une salle (une personne par salle d'abord, puis les autres au hasard : avec 13 joueurs, 2 salles ont 2 occupants), indiquée sur son téléphone.
   - Chaque tablette affiche seulement le nom de la salle et **un code par joueur attendu** (sans nom). Le joueur tape son code sur son téléphone, ce qui le place dans sa salle.
   - **Quand tout le monde a tapé son code, le courant revient** et le chrono de l'enquête démarre. L'écran compte les joueurs qui ont réparé.
   - L'admin peut forcer le début (« Rétablir le courant maintenant ») ou désactiver la panne (Réglages, Temps et règles).
2. **Se déplacer.** Le joueur scanne le QR code de la tablette avec l'appareil photo. Il peut aussi taper le code à 4 chiffres dans « Changer de salle ». Il n'est que dans une salle à la fois.
   - Si un QR code ne passe pas, l'admin place le joueur dans la bonne salle depuis le tableau des enquêteurs.
3. **Interroger.** On choisit un joueur présent dans la même salle, un personnage et une arme. Le lieu est toujours la salle où l'on se trouve.
   - Le joueur interrogé choisit quelle carte montrer, s'il en a plusieurs. Seul celui qui a posé la question la voit.
   - Sans réponse dans le délai (1 min par défaut), une carte est montrée au hasard.
   - On ne peut pas interroger deux fois de suite la même personne.
   - Il faut attendre 30 s entre deux questions.
   - L'écran indique qu'une carte a été montrée, sans dire laquelle.
4. **Indices d'une salle.** Chaque joueur peut recevoir jusqu'à **3 indices par salle**, tirés des textes écrits pour cette salle (voir plus bas), dans cet ordre :
   - le **1er** en réussissant la tâche de la salle ;
   - le **2e** en réussissant une nouvelle tâche dans cette salle, après être passé dans **1 autre salle** ;
   - le **3e** sans tâche (bouton « Demander le prochain indice »), après être passé dans **2 autres salles** depuis le 2e. Les autres salles doivent être différentes.
5. **Fiche de détective : sur papier.** Le téléphone garde, dans l'onglet **💡 Indices**, tous les indices obtenus (avec la salle et l'heure) et toutes les questions posées avec la carte montrée.
6. **Phase finale.** Elle commence automatiquement au bout de 1 h 30, ou quand l'admin la lance avec le bouton. Pendant la phase finale, chaque `{…}` d'un indice donne 2 cartes au lieu d'une. Le nombre d'indices par salle (3) reste réglable pour la phase finale.
7. **Accuser.** Chaque joueur peut accuser **une seule fois**.
   - Si l'accusation est juste, il gagne et l'enquête s'arrête.
   - Sinon, il ne peut plus accuser, mais il doit toujours répondre aux questions.
8. **Fin.** L'enquête s'arrête :
   - quand quelqu'un accuse juste ;
   - à la fin des 2 h ;
   - quand tout le monde a accusé ;
   - quand l'admin clique sur « Terminer ».

   L'écran révèle alors la solution et le tueur.

## Indices des salles

Dans **Réglages, L'Enquête, cadre « Indices des salles »**, tu écris **jusqu'à 3 indices par salle**.

- **Chances.** À côté de chaque indice, deux pourcentages : la chance qu'il soit donné **en premier** à un joueur, puis **en deuxième**. Le troisième indice donné est celui qui reste. Cela n'a rien à voir avec la phase finale.
- **Jamais deux fois le même.** Un joueur ne reçoit jamais deux fois le même indice dans une salle.
- **Jamais une carte déjà connue.** Un joueur ne reçoit pas un indice qui cite une carte qu'il a déjà : cartes en main, cartes montrées ou cartes éliminées.
- **Emplacement vide.** Il est rempli automatiquement au lancement avec un vrai fait tiré de la solution, par exemple une carte innocentée ou « Au moins 2 de ces 3 salles ne sont pas le lieu du crime : … ». Tu les vois dans Partie en cours, après « Révéler ». L'icône 🎲 marque ceux qui sont remplis automatiquement.
- **Repères dans un texte.**
  - `{carte}`, `{perso}`, `{arme}` et `{salle}` donnent une carte innocente que le joueur ne connaît pas encore.
  - `{3salle}`, `{3arme}`, `{3perso}` et `{3carte}` donnent 3 cartes dont au plus une est dans la solution.
  - En phase finale, chaque repère donne deux cartes.
  - `{joueur}` : le nom d'un autre joueur (de préférence dont le personnage est encore inconnu de celui qui lit). Avec `{3perso}`, les 3 personnages contiennent son vrai personnage : « {joueur} est peut-être {3perso} » donne par exemple « Léa est peut-être Colonel Moutarde, Madame Blanche ou Baron Safran ». Un joueur ne reçoit jamais deux fois le même nom, ni son propre nom ; dans toute la partie, les noms sont répartis le plus équitablement possible. Tu peux donc mettre cet indice dans plusieurs salles : s'il n'y a plus de nom neuf pour un joueur, il reçoit un autre indice de la salle.
- **Indices de secours.** Quand un joueur n'a plus d'indice disponible dans une salle, un des modèles de secours est tiré au hasard (une ligne = un modèle).

### Salles « trop propres »

- Le réglage « Salles trop propres » est de 2 par défaut. Ce nombre de salles est tiré au hasard, jamais la salle du crime.
- Dans ces salles, le **premier indice de chaque joueur** est l'indice général : « Cette salle est trop propre : il est impossible qu'un crime y ait eu lieu. » Le texte se modifie, et la salle est éliminée sur la fiche.
- Un joueur qui a déjà la carte de cette salle reçoit un indice normal.

## Classement de la soirée

Le gagnant est premier. Les autres joueurs sont classés selon le nombre d'indices obtenus. Les points vont de 90 pour le 1er à 15 pour le dernier, et se règlent dans l'onglet Classement.

## Le tueur

- **Avant de savoir.** Le joueur dont le personnage est dans la solution est le tueur, sans le savoir. Ses souvenirs sont plus précis : chacun de ses indices automatiques innocente 2 cartes, et jamais d'indice flou.
- **S'accuser.**
  - S'il s'accuse lui-même et que l'accusation est entièrement juste, la partie **ne s'arrête pas**. Il devient **tueur actif** en secret, et rien ne s'affiche à l'écran.
  - Son téléphone lui révèle la salle où il a caché l'arme de la solution.
  - Si seul son personnage est juste, il a **une seconde chance**, et son téléphone le lui explique.
- **Récupérer l'arme.** Il scanne la salle de la cachette, ce qui lui rend son arme discrètement.
- **Le panneau secret.** Le bouton « 🌀 Souvenirs », fermé par défaut, montre :
  - sa cachette ;
  - si son arme est prête ;
  - les joueurs de sa salle, avec leur nombre d'indices.
- **Tuer : l'effet dépend de l'arme du crime** (reconnue par son nom).
  - **Poignard, hache** : tue en un coup une personne de la salle.
  - **Chandelier, matraque, club de golf, clé anglaise** : le 1er coup assomme (la victime ne peut plus quitter la salle, pendant une durée réglable), le 2e coup tue. Si elle n'est pas achevée à temps, elle se réveille.
  - **Corde** : le tueur tend un piège dans sa salle ; la prochaine personne qui y entre meurt. La corde reste sur le cadavre : le tueur la récupère en scannant son QR code. Nombre de cordes réglable.
  - **Poison** : il faut être dans la même salle. La victime ne sait rien et meurt dans 0 à N des prochaines salles qu'elle visite (N réglable, 3 par défaut).
  - **Revolver, fusil de chasse** : tue n'importe qui du même étage. Le coup de feu retentit : l'écran et tous les téléphones affichent l'étage d'où il vient. Les étages se règlent salle par salle.
- **Délais de chaque arme** (admin, Réglages, L'Enquête, cadre « Armes »), pour le tueur : délai entre deux victimes dans la même salle, nombre maximum de victimes par passage dans une salle, rechargement une fois la salle quittée, et l'effet (durée d'assommé, cordes, salles de poison). Les mêmes réglages existent pour un joueur : ils serviront aux armes de pénalité, qui ne sont pas encore en jeu.

## Les armes des joueurs

Les joueurs peuvent se servir d'armes les uns contre les autres. Un joueur porte **une arme à la fois**.

- **Où les trouver.**
  - Une arme apparaît dans une salle au hasard toutes les 2 min 30 (réglable), au plus une par salle. Le premier qui appuie sur « Ramasser » la prend.
  - Réussir une tâche donne aussi une chance (25 %, réglable) de trouver une arme.
  - On peut reposer son arme dans une salle qui n'en contient pas.
- **Effets** (sur une personne de la même salle) :
  - **Poignard, hache, revolver, fusil de chasse** : une menace. La personne doit donner une carte de sa main, sans rien recevoir en retour. Elle ne peut pas quitter la salle avant de l'avoir fait. Si elle ne le fait pas dans le temps réglé (1 min), une carte au hasard est donnée.
  - **Chandelier, matraque, club de golf, clé anglaise** : la personne est assommée et ne peut plus quitter la salle pendant une durée réglable.
  - **Corde** : mains liées, même effet, pendant une durée réglable. Le joueur porte un nombre de cordes réglable ; sans corde, l'arme disparaît.
  - **Poison** : la personne ne sait rien ; l'indice qu'elle lira ensuite sera illisible (il compte quand même comme pris).
- **Usure.** Chaque arme a un nombre d'utilisations réglable (3 par défaut, 2 pour la corde, le poison et les armes à feu) : après la dernière, elle se casse.
- **Menace.** Une personne ne peut jamais donner deux fois la même carte à la même personne. Si elle les a déjà toutes données, on ne peut plus la menacer.
- **Délais.** Chaque arme a ses délais côté joueur (entre deux victimes dans la même salle, victimes maximum par salle, rechargement après avoir quitté la salle). Réglages dans Réglages, L'Enquête, cadre « Armes ».
  - S'il ne reste plus aucun innocent en vie, le tueur l'emporte.
- **Victoire des autres.** Les autres gagnent toujours en accusant juste.

## Les corps

- **La victime** est éliminée. Elle reste où elle est, et son téléphone affiche un QR code.
- **Fouiller le corps.** Chaque joueur peut scanner ce QR code une fois, ce qui lui montre les 3 cartes de la victime. Elles sont aussi gardées dans son onglet Indices.
- **Le premier scan** affiche à l'écran : « Un corps a été trouvé dans : Cuisine ».
- **Au deuxième scan par un innocent**, l'écran révèle la victime et son personnage. Le scan du tueur, qui fait semblant, ne compte pas.

## Quitter la salle

Avant d'aller ailleurs, chaque joueur doit appuyer sur **« Quitter la salle »**. Un chrono de 10 s (réglable) démarre : pendant ce temps, le joueur reste dans la salle (visible, interrogeable). S'il scanne une autre salle sans l'avoir fait, il est **immobilisé 30 s** (réglable) : il ne peut ni interroger, ni faire de tâche, ni demander d'indice.

## Règles diverses

- **Questions.** On ne montre jamais deux fois la même carte à la même personne. Si toutes les cartes demandées ont déjà été montrées, la réponse est « rien de nouveau ».
- **Les morts.** Leur nom reste affiché dans leur salle (écran, tablette, téléphones) : personne ne sait qu'ils sont morts. Il est barré dès le premier scan de leur corps. Les interroger ne donne aucune réponse.
- **Tâches des salles.** Une salle ne tire jamais deux fois de suite la même tâche : elle alterne entre sa tâche solo et sa tâche à plusieurs. La chance de tâche solo ne sert qu'au premier tirage de la partie.
- **Écran.** Les salles sont rangées par étage, dans l'ordre des étages de la liste des salles.
- **Rejoindre en cours de partie.** Un joueur qui arrive après le lancement voit « Rejoindre la partie » sur son téléphone. Il reçoit un personnage que personne ne joue (tiré dans la liste des personnages), qu'il tient en main comme une carte, plus 2 autres cartes. Désactivable dans les réglages ; refusé s'il ne reste aucun personnage libre. (L'admin peut aussi ajouter quelqu'un à la main.)
- **Liens des salles.** Dans Partie en cours, le cadre « 🔗 Liens des salles » donne un lien par salle à copier-coller dans un message : cliquer dessus place le joueur dans la salle, sans scanner la tablette. Les liens sont propres à la partie. Quiconque a le lien peut entrer dans la salle sans y être : désactivable dans les réglages.
