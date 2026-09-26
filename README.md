# Soirée jeux

Trois jeux pour une soirée, avec :
- une **interface admin** pour régler les décomptes et les paramètres, et lancer les jeux ;
- un **écran public** (TV ou vidéoprojecteur) qui affiche le décompte et le déroulement ;
- une **interface téléphone** où les invités s'inscrivent et jouent ;
- une **page orga** pour mettre des joueurs en safe zone.

## Jeux

1. [Le Chemin](docs/jeu1-le-chemin.md) — jouable, [maquette](docs/maquettes/le-chemin.html)
2. [Duel au Far West](docs/jeu2-duel-far-west.md) — jouable, [maquette](docs/maquettes/duel-far-west.html)
3. [Le Grand Pari](docs/jeu3-grand-pari.md) — jouable, [croquis](docs/maquettes/jeu3-croquis.html)

Les trois jeux comptent pour le [classement de la soirée](docs/classement-soiree.md).

## Lancer la soirée

### Sur Linux (une seule fois : installer Node.js)

```bash
sudo apt install nodejs npm      # Ubuntu / Debian
git clone https://github.com/UlysseAC/Soiree-jeux.git
cd Soiree-jeux
./lancer.sh
```

### Sur Mac

Installe Node.js depuis https://nodejs.org (version LTS), télécharge le projet, puis double-clique sur `lancer.command`.

### Ensuite

La fenêtre affiche les adresses, par exemple :

```
Téléphones (QR code sur l'écran) : http://192.168.1.20:3000/jouer
Écran public : http://192.168.1.20:3000/ecran
Admin        : http://192.168.1.20:3000/admin
Orga         : http://192.168.1.20:3000/orga
```

- **Admin** : mot de passe `soiree` par défaut. Pour le changer : `ADMIN_PASSWORD=monmotdepasse ./lancer.sh`.
- **Écran public** : ouvre-le sur l'ordi branché à la TV et clique sur « Activer le son » (bruits de pas du face-à-face).
- **Téléphones** : les invités se connectent **au même Wi-Fi que l'ordi**, puis scannent le QR code de l'écran public.
- **Orga** : code `1234` par défaut, modifiable dans l'admin.

Tout est sauvegardé dans `data/soiree.json` : si l'ordi redémarre, la partie reprend où elle en était.

### Pièges à éviter

- Le **Wi-Fi invité** de certaines box empêche les appareils de se voir : utilise le Wi-Fi principal.
- **Pare-feu Linux** : si les téléphones n'arrivent pas à se connecter, `sudo ufw allow 3000`.
- Désactive la **mise en veille** de l'ordi pendant la soirée.

## Mettre en ligne (Render, gratuit)

Pour jouer depuis n'importe où (4G, Wi-Fi différents), sans ordi allumé :

1. Crée un compte sur https://render.com (bouton « Sign in with GitHub »).
2. **New → Blueprint**, choisis le dépôt `Soiree-jeux` et la branche à déployer. Render lit `render.yaml`.
3. Render demande **ADMIN_PASSWORD** : choisis le mot de passe de l'admin (il n'y a pas de mot de passe par défaut en ligne).
4. Clique sur **Apply**. Après 2-3 minutes, l'adresse s'affiche, par exemple `https://soiree-jeux.onrender.com`.
   - Admin : `…/admin` · Écran public : `…/ecran` · Joueurs : `…/jouer` (le QR code de l'écran pointe déjà dessus).

À savoir avec l'offre gratuite :
- Le serveur **s'endort après 15 minutes sans visite** : la première ouverture prend environ une minute. Ouvre l'admin un peu avant la soirée.
- Son disque est **effacé à chaque redémarrage** (réveil, mise à jour). Pour garder les réglages, active la sauvegarde en ligne ci-dessous.
- Chaque `git push` sur la branche déployée met le site à jour automatiquement.

### Garder les réglages en ligne (Upstash, gratuit)

1. Crée un compte sur https://upstash.com et une base **Redis** (offre gratuite, région Europe).
2. Dans la base, section **REST API**, copie `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.
3. Sur Render : ton service → **Environment** → ajoute ces deux variables → **Save**. Le serveur redémarre.

Au démarrage, le serveur indique « Sauvegarde : fichier local + en ligne (Upstash) ». Réglages, joueurs et classement sont alors conservés même quand Render redémarre.

### Exporter / importer les réglages

Dans l'admin, onglet **Soirée** : **Exporter les réglages** télécharge un fichier avec tous les réglages (noms, indices, codes, armes, durées, primes, points). **Importer un fichier** les remet, par exemple pour passer du serveur en ligne à ton ordi le jour J.

## Répétition générale

`npm run repetition` lance le serveur et joue une soirée complète (les 3 jeux puis le grand final) avec 20 faux joueurs, et affiche un bilan. `npm run repetition -- 45` pour 45 joueurs.

## Déroulé d'un jeu

1. Dans l'admin, onglet **Soirée** : choisis le jeu, règle le décompte (45 min) et l'ouverture des inscriptions (15 min avant), puis **Démarrer le décompte**.
2. Les invités s'inscrivent sur leur téléphone quand les inscriptions ouvrent.
3. À la fin du décompte, la partie commence toute seule (ou bouton **Lancer le jeu maintenant**).
4. Onglet **Partie en cours** : suivi en direct et actions (safe zone, joueur parti, arbitrage des duels…).
5. Onglet **Classement** : points de la soirée, bonus manuels, **Grand final** sur l'écran.
6. Onglet **Réglages du jeu** : indices, codes, armes, durées, primes… Enregistrés dès que tu quittes un champ.

Pour le Duel au Far West : après le lancement, saisis les **numéros de dossard** de chaque joueur dans l'onglet Partie en cours, puis **Lancer le premier tour**.

## Pour les développeurs

```bash
npm install
npm test        # tests de la logique des jeux
npm start       # serveur sur le port 3000 (PORT=… pour changer)
```

- `server/soiree.js` : décompte, inscriptions, jeu en cours
- `server/games/chemin.js`, `server/games/duel.js`, `server/games/grandpari.js` : logique de chaque jeu
- `server/games/sports/` : simulations de la course, du foot et de la boxe (rejouées par `public/js/sports.js`)
- `public/` : pages admin, écran, téléphone, orga
- `docs/` : cahiers des charges et maquettes
