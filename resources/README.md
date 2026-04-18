# Firebase Environments And GitHub Setup

Ce document décrit la mise en place complète des environnements Firebase utilisés par ce dépôt :

- `prod` : projet utilisé par GitHub Pages
- `integration` : projet dédié aux tests d'intégration
- `dev` : projet dédié aux développeurs

La source de vérité des règles Firestore est :

- [firestore.rules](/home/bjalon/projects/direct-diffusion/resources/firestore.rules)

Les alias Firebase CLI du dépôt sont définis dans :

- [.firebaserc](/home/bjalon/projects/direct-diffusion/.firebaserc)

## 1. Projets Firebase à créer

Le dépôt est actuellement configuré pour utiliser les aliases suivants :

```json
{
  "projects": {
    "prod": "qastia-direct-diffusion",
    "integration": "qdd-integration",
    "dev": "qdd-dev"
  }
}
```

Si un identifiant change, mettre à jour :

- [`.firebaserc`](/home/bjalon/projects/direct-diffusion/.firebaserc)
- les variables `VITE_FIREBASE_*` utilisées localement et en CI

### 1.1 Initialiser un projet Firebase pour cette application

Pour cette application, il n'y a pas de `firebase init` à lancer dans le repo :

- [firebase.json](/home/bjalon/projects/direct-diffusion/firebase.json) existe déjà
- [.firebaserc](/home/bjalon/projects/direct-diffusion/.firebaserc) existe déjà
- les règles Firestore sont déjà versionnées dans [firestore.rules](/home/bjalon/projects/direct-diffusion/resources/firestore.rules)

La bonne approche est donc :

1. créer ou ouvrir le projet dans Firebase Console
2. créer l'application Web Firebase de ce projet
3. récupérer la configuration Web `VITE_FIREBASE_*`
4. activer Firestore et Authentication
5. déployer les règles du repo avec `npm run rules:deploy:<env>`
6. créer le premier administrateur dans `allowedUsers`

### 1.2 Séquence exacte dans Firebase Console

Pour un nouveau projet Firebase :

1. créer le projet dans Firebase Console
2. Google Analytics :
   - optionnel pour cette application
   - tu peux le laisser désactivé si tu n'en as pas besoin
3. dans `Paramètres du projet` > `Général` > `Vos applications`
   - créer une application `Web`
   - nom conseillé : `direct-diffusion-dev`, `direct-diffusion-integration` ou `direct-diffusion-prod`
   - ne pas activer Firebase Hosting pour cette app
     - l'application est publiée via GitHub Pages, pas via Firebase Hosting
4. copier la configuration Web affichée
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. dans `Firestore Database`
   - créer la base en mode natif
   - choisir la région
   - garder la même stratégie de région entre `dev`, `integration` et `prod` si possible
6. choix du mode Firestore au moment de la création :
   - pour `dev` et `integration`, le plus simple est de partir en `mode test`, puis de déployer immédiatement les règles du repo
   - pour `prod`, tu peux partir en `mode production` si tu veux verrouiller tout de suite, mais il faudra alors déployer les règles et créer le premier admin avant usage
   - dans tous les cas, les règles de référence de ce projet sont celles du repo, pas celles générées par l'assistant Firebase
7. dans `Authentication` > `Méthode de connexion`
   - activer `Google`
   - si Firebase demande un email de support du projet, choisir l'email adapté
   - dans `Ajoutez à la liste d'autorisation les ID client de projets externes (facultatif)`, ne rien mettre pour cette application
     - cette app utilise le flux Firebase Auth standard côté Web, pas un client OAuth Google externe
   - les champs `ID client Web` et `Code secret du client Web` n'ont pas à être saisis manuellement pour cette application
     - Firebase gère le provider Google pour le flux standard utilisé ici
     - ces champs deviennent utiles surtout si tu mets en place un flux Google manuel ou un client OAuth externe
   - activer `Anonyme`
8. dans `Authentication` > `Settings` > `Authorized domains`
   - vérifier que `localhost` est présent
   - ajouter `127.0.0.1` si tu l'utilises
   - ajouter aussi le domaine de publication si l'application doit utiliser Google OAuth en production
9. ensuite revenir dans le repo local :
   - remplir le bon fichier `.env.*.local`
   - déployer les règles
   - créer le premier admin

### 1.3 Ce qu'il n'est pas nécessaire de configurer

Pour le fonctionnement actuel de l'application, il n'est pas nécessaire d'initialiser :

- Firebase Hosting
- Cloud Functions
- Firebase Storage
- Cloud Messaging

Ces services peuvent rester non configurés tant que le projet n'en a pas besoin.

Pour chacun des 3 projets Firebase :

1. Créer le projet dans Firebase Console.
2. Activer Cloud Firestore en mode natif.
3. Choisir une région et garder la même stratégie de région entre les environnements si possible.
4. Activer Firebase Authentication.
5. Activer au minimum les providers :
   - `Google`
   - `Anonyme`
6. Créer une application Web Firebase.
7. Récupérer les valeurs de configuration Web :
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

## 2. Configuration front par environnement

L'application lit Firebase via [src/firebase.js](/home/bjalon/projects/direct-diffusion/src/firebase.js).

Les variables attendues sont :

```bash
VITE_DEFAULT_LAYOUT=2x2
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Le dépôt fournit aussi un gabarit :

- [.env.example](/home/bjalon/projects/direct-diffusion/.env.example)

Les scripts disponibles sont :

- `npm run dev`
  - lance Vite en mode `development`
  - doit viser `qdd-dev`
- `npm run dev:integration`
  - lance Vite en mode `integration`
  - doit viser `qdd-integration`
- `npm run build`
  - build production
- `npm run build:integration`
  - build avec la config `integration`

Le dépôt ignore désormais :

- `.env`
- `.env.local`
- `.env.*.local`

La pratique recommandée est donc :

- garder éventuellement `.env` pour une base commune non sensible
- mettre les vraies configurations locales dans des fichiers par mode

### 2.1 Configuration locale `dev`

Créer :

- `.env.development.local`

Exemple pour travailler localement sur le projet `dev` :

```bash
VITE_DEFAULT_LAYOUT=2x2
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=qdd-dev
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Puis lancer :

```bash
npm run dev
```

### 2.2 Configuration locale `integration`

Créer :

- `.env.integration.local`

Exemple :

```bash
VITE_DEFAULT_LAYOUT=2x2
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=qdd-integration
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Puis lancer :

```bash
npm run dev:integration
```

### 2.3 Priorité des fichiers `.env` avec Vite

Pour mémoire, Vite charge les fichiers par mode. Dans ce dépôt, les plus utiles sont :

- `.env`
- `.env.local`
- `.env.development.local`
- `.env.integration.local`

Pour un poste de développeur, le plus sûr est :

- ne pas mettre la prod dans `.env`
- mettre `qdd-dev` dans `.env.development.local`
- mettre `qdd-integration` dans `.env.integration.local`

Comme ça, `npm run dev` ne peut pas tomber par erreur sur la prod.

## 3. Checklist exacte pour le projet `qdd-dev`

Pour que ton poste local utilise `qdd-dev`, il faut faire ces actions dans le projet Firebase `qdd-dev`.

### 3.1 Ce qu'il faut récupérer dans Firebase Console

Dans Firebase Console :

1. ouvrir le projet `qdd-dev`
2. aller dans `Paramètres du projet`
3. onglet `Général`
4. section `Vos applications`
5. créer une application Web si elle n'existe pas déjà
6. récupérer la configuration Web

Les valeurs à recopier dans `.env.development.local` sont exactement :

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Ce sont ces 6 valeurs qui doivent venir du projet `qdd-dev`.

Important :

- ne pas copier uniquement `projectId`
- toutes les valeurs doivent venir de la même application Web `qdd-dev`

### 3.2 Ce qu'il faut activer dans `qdd-dev`

Dans le projet `qdd-dev`, vérifier :

1. `Firestore Database`
   - créer la base en mode natif si elle n'existe pas
2. `Authentication`
   - activer le provider `Google`
   - si un email de support est demandé, le renseigner
   - laisser vide `Ajoutez à la liste d'autorisation les ID client de projets externes (facultatif)`
   - ne pas renseigner manuellement `ID client Web` ni `Code secret du client Web` pour cette application
   - activer le provider `Anonyme`
   - dans `Settings` > `Authorized domains`, vérifier que `localhost` est présent
   - si tu utilises un autre hostname local, l'ajouter aussi
3. application Web
   - récupérer la config listée ci-dessus

### 3.3 Ce qu'il faut faire dans le repo local

1. créer ou mettre à jour `.env.development.local`
2. y coller les valeurs du projet `qdd-dev`
3. lancer :

```bash
npm run dev
```

### 3.4 Ce qu'il faut déployer sur `qdd-dev`

Les règles Firestore ne sont pas partagées automatiquement entre projets.

Après avoir créé `qdd-dev`, lancer :

```bash
npm run rules:deploy:dev
```

## 4. Bootstrap du premier administrateur sur `qdd-dev`

Avant d'utiliser réellement l'interface d'administration sur `qdd-dev`, il faut créer le premier admin.

Dans Firestore Console du projet `qdd-dev` :

1. créer la collection `allowedUsers`
2. créer un document dont l'ID est ton email Google en minuscules
3. mettre au minimum :

```json
{
  "email": "prenom.nom@example.com",
  "administration": true,
  "admin_flux": true,
  "participants": true
}
```

Sans ce document, tu pourras te connecter avec Google mais pas accéder aux vues admin.

Important :

- l'ID du document et le champ `email` doivent correspondre exactement à l'email Google utilisé pour se connecter
- en pratique, pour un premier admin `bjalon@qastia.com`, il faut créer :
  - collection `allowedUsers`
  - document ID `bjalon@qastia.com`
- une faute de frappe dans l'email ou un domaine incorrect empêcheront l'autorisation dans l'application

## 5. Déploiement des règles Firestore

Le dépôt expose déjà ces scripts :

- `npm run rules:deploy:prod`
- `npm run rules:deploy:integration`
- `npm run rules:deploy:dev`

Ils pointent tous vers [firebase.json](/home/bjalon/projects/direct-diffusion/firebase.json), qui référence :

- [resources/firestore.rules](/home/bjalon/projects/direct-diffusion/resources/firestore.rules)

Pré-requis local :

1. Installer Firebase CLI :

```bash
npm install -g firebase-tools
```

2. Se connecter :

```bash
firebase login
```

3. Déployer selon l'environnement :

```bash
npm run rules:deploy:dev
npm run rules:deploy:integration
npm run rules:deploy:prod
```

## 6. Bootstrap du premier administrateur

L'application protège l'administration via la collection :

- `allowedUsers/{email}`

Les rôles applicatifs Google sont :

- `administration`
- `admin_flux`
- `participants`

Le premier compte administrateur doit être créé manuellement dans Firestore Console du projet concerné.

Document à créer :

- collection : `allowedUsers`
- document ID : email Google en minuscules

Exemple :

```json
{
  "email": "prenom.nom@example.com",
  "administration": true,
  "admin_flux": true,
  "participants": true
}
```

Notes :

- Firestore Console utilise les permissions IAM du projet, pas les règles du client web.
- Sans ce document, personne ne pourra accéder à la vue `Admin` sans passer par une demande d'accès.
- Une fois ce premier admin connecté, il peut gérer les autres comptes depuis l'interface.

## 7. Bootstrap des opérateurs résultats

Les accès non-OAuth pour `start`, `finish` et `tv` sont stockés dans :

- `allowedResultUsers/{uid}`

En pratique :

- ne pas initialiser cela à la main tant que possible
- laisser le premier administrateur passer par la vue `Admin`
- approuver ensuite les demandes générées par les terminaux concernés

## 8. GitHub Pages

Le workflow de déploiement est :

- [.github/workflows/deploy-pages.yml](/home/bjalon/projects/direct-diffusion/.github/workflows/deploy-pages.yml)

Comportement actuel :

- `push` sur `main`
- build Vite
- déploiement automatique des règles Firestore `prod`
- déploiement GitHub Pages

Dans GitHub, vérifier :

1. `Settings` > `Pages`
2. `Build and deployment`
3. `Source` = `GitHub Actions`

## 9. Secrets GitHub à configurer

### 9.1 Secrets de build front

Le job `build` du workflow lit directement :

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Comme le job `build` n'est pas rattaché à un environment GitHub, ces secrets doivent être :

- soit des `Repository secrets`
- soit des `Organization secrets`

Ils doivent contenir les valeurs de l'application Web Firebase du projet `prod`.

### 9.2 Secret CI pour déployer les règles `prod`

Le job `deploy-rules` utilise :

- `FIREBASE_SERVICE_ACCOUNT_PROD`

Ce secret est idéalement stocké dans l'environment GitHub :

- `production`

Le job `deploy-rules` référence déjà cet environment dans le workflow.

## 10. Compte de service CI pour les règles `prod`

Créer un compte de service dédié dans Google Cloud du projet `prod`.

Nom recommandé :

- `github-actions-prod-rules`

Rôles IAM recommandés :

- `Administrateur des règles Firebase`
  - `roles/firebaserules.admin`
- `Lecteur de l'utilisation des services`
  - `roles/serviceusage.serviceUsageViewer`

Ne pas utiliser :

- `Firebase Rules System`
  - `roles/firebaserules.system`

Ce rôle est un rôle système/service-agent, pas le bon rôle pour GitHub Actions.

Configuration recommandée lors de la création :

- pas de condition IAM
- laisser `Principaux avec accès` vide

Une fois le compte créé :

1. ouvrir le compte de service
2. onglet `Clés`
3. `Ajouter une clé`
4. `Créer une clé`
5. format `JSON`

Le JSON téléchargé doit être copié dans GitHub comme secret :

- `FIREBASE_SERVICE_ACCOUNT_PROD`

Important :

- ne jamais committer ce JSON
- supprimer le fichier local après ajout dans GitHub si non nécessaire
- modifier les rôles du compte de service ne nécessite pas de régénérer la clé JSON

## 9. Vérification après configuration GitHub

Après un push sur `main`, vérifier dans `Actions` :

1. job `build`
2. job `deploy-rules`
3. job `deploy`

Ordre attendu :

- `deploy-rules` attend `build`
- `deploy` attend `build` et `deploy-rules`

Donc :

- si les règles échouent, GitHub Pages ne part pas
- si les règles passent, le site est ensuite publié

## 10. Erreurs fréquentes

### Que mettre dans la configuration du fournisseur Google ?

Pour cette application :

- activer simplement le fournisseur `Google`
- choisir l'email de support si Firebase le demande
- laisser vide `Ajoutez à la liste d'autorisation les ID client de projets externes (facultatif)`
- ne pas saisir manuellement `ID client Web` ni `Code secret du client Web`

Pourquoi :

- l'application utilise Firebase Auth Web avec `GoogleAuthProvider` et `signInWithPopup`
- elle n'utilise pas ici un flux Google Sign-In manuel avec un client OAuth externe

Les champs de client OAuth externe deviennent utiles seulement si tu décides plus tard :

- d'utiliser la bibliothèque Google Sign-In directement
- ou de faire un `signInWithCredential` à partir d'un token obtenu hors du flux Firebase standard

### `Permission denied to get service [firestore.googleapis.com]`

Cause :

- le compte de service CI n'a pas la permission `serviceusage.services.get`

Correction :

- ajouter le rôle `Lecteur de l'utilisation des services`
  - `roles/serviceusage.serviceUsageViewer`

### Le compte admin ne peut pas accéder à l'application

Cause possible :

- pas de document dans `allowedUsers/{email}`

Correction :

- créer manuellement le document dans Firestore Console

### Les règles ont été changées dans Firebase Console puis écrasées

Cause :

- le workflow CI et les scripts locaux republient toujours [firestore.rules](/home/bjalon/projects/direct-diffusion/resources/firestore.rules)

Correction :

- garder ce fichier comme source de vérité
- ne pas maintenir une version divergente dans la console

## 11. Checklist rapide

Pour chaque projet Firebase :

- Firestore activé
- Auth activé
- provider Google activé
- provider anonyme activé
- application Web créée
- config Web récupérée
- règles déployées
- premier admin créé dans `allowedUsers`

Pour GitHub :

- Pages configuré sur `GitHub Actions`
- secrets `VITE_FIREBASE_*` configurés pour `prod`
- environment `production` créé
- secret `FIREBASE_SERVICE_ACCOUNT_PROD` configuré
- compte de service CI avec les 2 rôles IAM requis
