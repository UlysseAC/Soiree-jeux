# Plan : un seul site, plusieurs soirées (pour vendre les jeux)

Aujourd'hui, un serveur = **une seule soirée** : un seul état en mémoire, une seule sauvegarde (clé `soiree-jeux`),
un seul mot de passe admin (variable `ADMIN_PASSWORD`), et chaque mise à jour envoie l'état à **tous** les appareils
connectés. Pour vendre, il faut qu'un même site accueille plusieurs clients en même temps, chacun dans son espace.

## Le principe

- Chaque client a un **espace** avec un code court (ex. `mariage-lea`). Toutes ses pages sont sous ce code :
  `/s/mariage-lea/jouer`, `/s/mariage-lea/ecran`, `/s/mariage-lea/admin`, `/s/mariage-lea/orga`.
- Le QR code de l'écran pointe vers l'espace du client : ses invités ne voient jamais les autres soirées.
- Chaque espace a sa propre soirée (jeux, réglages, joueurs, classement, sauvegarde), exactement comme aujourd'hui.
- L'organisateur se connecte avec **son compte** (e-mail + mot de passe), pas avec un mot de passe commun.

## Les étapes

### Étape 1 — Séparer les soirées (le cœur du chantier)
- Remplacer l'unique soirée par une liste : code d'espace → soirée. Une soirée est chargée depuis la sauvegarde à la
  première connexion, et retirée de la mémoire après quelques heures sans activité.
- Le « tick » (horloge des jeux) ne tourne que pour les soirées actives.
- Les simulations et le téléphone de test deviennent propres à chaque espace.
- Tests : deux soirées en parallèle ne se voient jamais (joueurs, classement, écran).

### Étape 2 — Adresses et connexions temps réel
- Pages sous `/s/<code>/…` ; le téléphone, l'écran et l'admin envoient le code de leur espace en se connectant.
- Chaque appareil rejoint le « salon » de son espace : les mises à jour ne partent qu'aux appareils de cet espace
  (aujourd'hui, la boucle d'envoi passe par tous les appareils connectés).
- L'adresse actuelle (`/jouer`, `/ecran`…) peut rester pour ton propre usage, sur un espace par défaut.

### Étape 3 — Comptes organisateurs
- Création de compte (e-mail, mot de passe chiffré), connexion, mot de passe oublié.
- Un organisateur crée ses espaces, invite éventuellement un co-organisateur.
- Un compte **super-admin** (toi) : voir tous les espaces, les activer, les désactiver, aider un client.
- Le code orga (safe zone) et le code de reprise de compte restent par espace.

### Étape 4 — Sauvegarde et base de données
- Une sauvegarde par espace (clé `espace:<code>`). Upstash suffit pour démarrer ; au-delà de quelques dizaines de
  clients, une vraie base (Postgres, proposée par Render ou d'autres) est plus confortable pour les comptes,
  les paiements et l'historique.
- Export / import des réglages par espace (existe déjà pour une soirée) : utile pour proposer des **modèles** prêts.

### Étape 5 — Paiement
- Paiement en ligne (par exemple Stripe Checkout) : à la soirée, au mois ou par pack.
- Un espace payé est actif pour une date ou une période ; sinon, l'admin affiche « Soirée non activée ».
- Factures automatiques (Stripe les génère).

### Étape 6 — Limites, sécurité, données personnelles
- Limites par espace : nombre de joueurs, de soirées simultanées, taille des réglages (questions, images…).
- Protection contre les abus : limite du nombre de connexions et d'actions par minute, vérification de toutes les
  entrées (déjà en grande partie fait).
- **Données personnelles (RGPD)** : les prénoms des invités sont des données personnelles. Il faut une politique de
  confidentialité, la suppression automatique des soirées après X jours, et des conditions générales de vente.
- **Contenu** : remplacer les noms de personnes réelles et les marques (noms de footballeurs du Grand Pari,
  titres comme « Inspecteur Gadget ») par des noms inventés ; laisser chaque client écrire les siens.

### Étape 7 — Mises à jour sans couper les soirées des autres
- Avec plusieurs clients, il y aura toujours une soirée en cours quelque part : on ne peut plus « attendre la fin ».
- La sauvegarde avant arrêt et la reconnexion automatique des téléphones existent déjà ; il faut aussi que chaque
  partie reprenne exactement où elle en était après un redémarrage (chronos compris), et le tester.
- Bandeau dans l'admin des clients : « Maintenance prévue mardi 10 h – 10 h 05 ».

### Étape 8 — Surveillance
- Suivi des erreurs (un service comme Sentry), journal par espace, alerte si le serveur redémarre.
- Tableau de bord super-admin : soirées en cours, nombre de joueurs connectés, trafic.

## Hébergement : ordre de grandeur (à vérifier sur les sites, les prix changent)
- **Serveur** : une offre payante Render (sans mise en veille). Une seule machine devrait tenir plusieurs soirées en
  même temps ; à mesurer par un test de charge avec la simulation (des centaines de faux téléphones).
- **Base de données** : Upstash gratuit pour démarrer, puis offre payante ou Postgres.
- **Nom de domaine** : quelques euros à quelques dizaines d'euros par an.
- **Paiement** : commission par transaction (Stripe), pas d'abonnement.
- Le trafic par soirée a déjà été fortement réduit (état envoyé seulement s'il change, messages compressés).
  Mesure-le sur Render après ta prochaine soirée : c'est la base du calcul du prix.

## Ordre conseillé
1. **Version minimale vendable** : étapes 1, 2 et 4 (soirées séparées, adresses par espace, sauvegarde par espace),
   avec des espaces créés **à la main par toi** (pas encore de comptes ni de paiement). Tu peux déjà vendre à
   quelques clients et encaisser par virement.
2. **Test de charge** : plusieurs soirées simulées en parallèle pour connaître la capacité d'une machine.
3. **Comptes et paiement** : étapes 3 et 5.
4. **Mise en conformité** : étape 6 (RGPD, CGV, contenu sans droits).
5. **Confort d'exploitation** : étapes 7 et 8.

## En attendant : un site par client
Sans rien changer au code, tu peux déjà vendre en déployant **une copie par client** (son service Render, sa base
Upstash, son mot de passe admin). C'est plus de gestion, mais c'est possible tout de suite pour les premiers clients.
