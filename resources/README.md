# Firebase, Multi-evenement Et GitHub

Ce document decrit la mise en place complete du projet avec :

- `prod` : projet Firebase utilise par GitHub Pages
- `integration` : projet Firebase dedie aux tests d'integration
- `dev` : projet Firebase dedie aux developpeurs

La source de verite des regles Firestore est :

- [firestore.rules](/home/bjalon/projects/direct-diffusion/resources/firestore.rules)

Les alias Firebase CLI du depot sont definis dans :

- [.firebaserc](/home/bjalon/projects/direct-diffusion/.firebaserc)

## 1. Modele de donnees

L'application n'est plus mono-evenement.

Le modele cible est :

```text
allowedUsers/{email}
events/{eventId}
events/{eventId}/allowedUsers/{email}
events/{eventId}/accessRequests/{email}
events/{eventId}/allowedResultUsers/{uid}
events/{eventId}/resultAccessRequests/{uid}
events/{eventId}/participants/{participantId}
events/{eventId}/currentStations/{currentStart|currentFinish}
events/{eventId}/resultStations/{start|finish}
events/{eventId}/currentCompetitor/current
events/{eventId}/resultEvents/{clickId}
events/{eventId}/resultRuns/{runId}
events/{eventId}/clockChecks/{uid}
events/{eventId}/config/streams
```

Principes :

- `allowedUsers` contient les droits globaux de l'application
- le role global `admin_events` donne acces a l'administration protegee des evenements
- `events/{eventId}` est la racine d'un evenement
- les droits Google sont scopes par evenement dans `events/{eventId}/allowedUsers`
- les comptes legers TV / chrono sont scopes par evenement dans `events/{eventId}/allowedResultUsers`
- un meme utilisateur Google peut etre autorise sur plusieurs evenements differents
- les comptes legers memorises dans le navigateur sont conserves localement par `projectId + eventId`

Le document `events/{eventId}` contient au minimum :

```json
{
  "slug": "caisse-a-savon-2026",
  "title": "Caisse a savon 2026",
  "type": "soapbox",
  "createdAt": "...",
  "updatedAt": "...",
  "promotionStartsAt": "...",
  "startsAt": "...",
  "endsAt": null,
  "published": true
}
```

Valeurs actuelles de `type` :

- `soapbox`
- `football`
- `handball`

## 2. URLs de l'application

La home publique liste les evenements promus :

- `#/`

Toutes les vues d'un evenement passent par son slug :

- `#/events/:eventSlug/tv/affichage`
- `#/events/:eventSlug/tv/flow`
- `#/events/:eventSlug/tv/flow-admin`
- `#/events/:eventSlug/tv/layouts`
- `#/events/:eventSlug/tv/participants`
- `#/events/:eventSlug/tv/resultats`
- `#/events/:eventSlug/tv/runs`
- `#/events/:eventSlug/tv/admin`
- `#/events/:eventSlug/tv/archives`
- `#/events/:eventSlug/chrono`

## 3. Projets Firebase a creer

Le depot est configure pour utiliser :

```json
{
  "projects": {
    "prod": "qastia-direct-diffusion",
    "integration": "qdd-integration",
    "dev": "qdd-dev"
  }
}
```

Si un identifiant change, mettre a jour :

- [.firebaserc](/home/bjalon/projects/direct-diffusion/.firebaserc)
- les variables `VITE_FIREBASE_*`

## 4. Initialiser un projet Firebase

Il n'y a pas de `firebase init` a lancer dans ce repo :

- [firebase.json](/home/bjalon/projects/direct-diffusion/firebase.json) existe deja
- [.firebaserc](/home/bjalon/projects/direct-diffusion/.firebaserc) existe deja
- les regles Firestore sont deja versionnees

La bonne sequence est :

1. creer le projet Firebase
2. creer l'application Web Firebase
3. activer Firestore et Authentication
4. recuperer la configuration Web
5. deployer les regles du repo
6. creer le premier `allowedUsers/{email}` avec `admin_events`
7. se connecter
8. ouvrir l'administration des evenements
9. creer le premier evenement

### 4.1 Configuration dans Firebase Console

Pour un nouveau projet Firebase :

1. creer le projet dans Firebase Console
2. Google Analytics :
   - optionnel pour cette application
3. dans `Parametres du projet > General > Vos applications`
   - creer une application `Web`
   - ne pas activer Firebase Hosting
4. recuperer :
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. dans `Firestore Database`
   - creer la base en mode natif
   - pour `dev` et `integration`, partir en `mode test` puis deployer immediatement les vraies regles du repo
   - pour `prod`, `mode production` ou `mode test` sont possibles, mais les regles du repo doivent etre deployees avant usage
6. dans `Authentication > Methode de connexion`
   - activer `Google`
   - activer `Anonyme`
   - choisir l'email de support si Firebase le demande
   - laisser vide `Ajoutez a la liste d'autorisation les ID client de projets externes (facultatif)`
   - ne rien saisir manuellement dans `ID client Web` ni `Code secret du client Web`
7. dans `Authentication > Settings > Authorized domains`
   - verifier `localhost`
   - ajouter `127.0.0.1` si besoin
   - ajouter le domaine de publication pour `prod`

### 4.2 Ce qu'il n'est pas necessaire de configurer

Pour le fonctionnement actuel, il n'est pas necessaire d'activer :

- Firebase Hosting
- Cloud Functions
- Cloud Messaging
- Firebase Storage

### 4.3 `measurementId`

`measurementId` n'est pas utilise par cette application.

Il peut etre ignore car le front n'initialise pas Google Analytics.

## 5. Variables d'environnement Vite

Le front lit Firebase depuis [src/firebase.js](/home/bjalon/projects/direct-diffusion/src/firebase.js).

Variables attendues :

```bash
VITE_DEFAULT_LAYOUT=2x2
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Le depot fournit :

- [.env.example](/home/bjalon/projects/direct-diffusion/.env.example)

Fichiers locaux recommandes :

- `.env.development.local` pour `qdd-dev`
- `.env.integration.local` pour `qdd-integration`

Scripts utiles :

- `npm run dev`
- `npm run dev:integration`
- `npm run build`
- `npm run build:integration`

Exemple `qdd-dev` :

```bash
VITE_DEFAULT_LAYOUT=2x2
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=qdd-dev
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Ensuite :

```bash
npm run dev
```

## 6. Deploiement des regles Firestore

Scripts disponibles dans [package.json](/home/bjalon/projects/direct-diffusion/package.json) :

- `npm run rules:deploy:prod`
- `npm run rules:deploy:integration`
- `npm run rules:deploy:dev`

Exemples :

```bash
npm run rules:deploy:dev
npm run rules:deploy:integration
npm run rules:deploy:prod
```

## 7. Bootstrap du premier administrateur global

Le premier administrateur global doit etre cree manuellement dans Firestore Console.

Collection :

- `allowedUsers`

Document ID :

- l'email Google exact en minuscules

Exemple :

```text
allowedUsers/bjalon@qastia.com
```

Contenu minimal :

```json
{
  "email": "bjalon@qastia.com",
  "admin_events": true
}
```

Important :

- l'ID du document doit correspondre exactement a l'email Google
- une faute de frappe sur le domaine bloque l'autorisation
- ce document donne acces a la vue protegee d'administration des evenements

## 8. Creer le premier evenement

Une fois connecte avec un utilisateur present dans `allowedUsers/{email}` avec `admin_events: true` :

1. ouvrir la home `#/`
2. se connecter avec Google
3. utiliser le bouton discret `Administration`
4. creer l'evenement

Champs importants :

- `title`
- `slug`
- `type`
- `promotionStartsAt`
- `startsAt`
- `endsAt`
- `published`

Notes :

- le `slug` devient l'ID Firestore de l'evenement
- il est donc fixe apres creation
- `promotionStartsAt` est utilise pour l'affichage public sur la home

## 9. Gerer les droits d'un evenement

Une fois l'evenement cree :

1. ouvrir l'evenement
2. aller dans `Admin`
3. gerer :
   - `allowedUsers`
   - `accessRequests`
   - `allowedResultUsers`
   - `resultAccessRequests`

Les roles Google evenements sont stockes dans :

- `events/{eventId}/allowedUsers/{email}`

Champs utiles :

- `administration`
- `admin_flux`
- `participants`

Les droits legers TV / chrono sont stockes dans :

- `events/{eventId}/allowedResultUsers/{uid}`

Champs utiles :

- `tv`
- `results_start`
- `results_finish`

## 10. Comportement des comptes legers

Les comptes non-OAuth sont memorises localement pour permettre une reprise ulterieure sur le meme evenement.

Important :

- la memorisation locale n'est pas la reservation du poste
- au logout, le poste `depart` ou `arrivee` est libere
- en revanche, le compte leger peut rester dans la liste locale pour etre reutilise plus tard

Le scope local utilise :

- le projet Firebase
- l'application Firebase
- l'evenement courant

Donc un compte leger memorise sur un evenement n'apparait pas sur un autre evenement.

## 11. GitHub Pages

La publication GitHub Pages est geree par :

- [.github/workflows/deploy-pages.yml](/home/bjalon/projects/direct-diffusion/.github/workflows/deploy-pages.yml)

Le workflow se declenche sur :

- `push` sur `main`
- ou `workflow_dispatch`

Dans GitHub :

1. `Settings > Pages`
2. `Build and deployment`
3. laisser GitHub Actions gerer le deploiement

## 12. Secret GitHub pour deployer les regles prod

Le workflow utilise un secret :

- `FIREBASE_SERVICE_ACCOUNT_PROD`

Ce secret doit contenir le JSON complet d'une cle de compte de service Google Cloud.

### 12.1 Creation du compte de service

Dans Google Cloud Console du projet `prod` :

1. `IAM et administration`
2. `Comptes de service`
3. creer un compte de service dedie a GitHub Actions
4. lui attribuer :
   - `Administrateur des regles Firebase`
   - `Lecteur de l'utilisation des services`
5. ne pas ajouter de condition IAM
6. `Cles > Ajouter une cle > Creer une cle > JSON`

Il est aussi possible d'utiliser le compte `Firebase Admin SDK` existant si tu preferes aller vite.

### 12.2 Ajout dans GitHub

Dans GitHub :

1. `Settings`
2. `Secrets and variables`
3. `Actions`
4. `New repository secret`
5. nom : `FIREBASE_SERVICE_ACCOUNT_PROD`
6. coller le JSON complet

Important :

- ne jamais committer ce JSON
- apres creation du secret GitHub, supprimer le fichier local si tu n'en as plus besoin
- si tu modifies seulement les roles IAM du compte de service, il n'est pas necessaire de regenerer la cle

## 13. Checklist exacte pour `qdd-dev`

Pour que `npm run dev` pointe sur `qdd-dev` :

1. creer le projet Firebase `qdd-dev`
2. creer l'application Web Firebase
3. activer Firestore et Auth (`Google` + `Anonyme`)
4. verifier `localhost` dans les domaines autorises
5. remplir `.env.development.local` avec la config Web de `qdd-dev`
6. deployer les regles :

```bash
npm run rules:deploy:dev
```

7. creer `allowedUsers/bjalon@qastia.com` avec `admin_events: true` si c'est ton compte admin de dev
8. lancer :

```bash
npm run dev
```

9. ouvrir `#/events-admin`
10. creer le premier evenement

## 14. Erreurs frequentes

### 14.1 `Missing or insufficient permissions`

Verifier :

- le bon projet Firebase
- les regles deployees sur ce projet
- le bon document `allowedUsers/{email}` avec `admin_events: true` pour le bootstrap global
- le bon document `events/{eventId}/allowedUsers/{email}` pour l'acces Google a l'evenement
- le bon document `events/{eventId}/allowedResultUsers/{uid}` pour TV / chrono

### 14.2 `Permission denied to get service [firestore.googleapis.com]`

Le compte de service GitHub n'a pas assez de droits IAM.

Il faut au minimum :

- `Administrateur des regles Firebase`
- `Lecteur de l'utilisation des services`

### 14.3 La home publique ne liste aucun evenement

Verifier :

- qu'il existe des documents dans `events`
- que `published == true`
- que `promotionStartsAt` est inferieur ou egal a la date courante

### 14.4 Le compte Google se connecte mais n'a pas acces

Verifier :

- pas de document dans `allowedUsers/{email}` avec `admin_events: true` pour l'administration globale
- ou pas de document dans `events/{eventId}/allowedUsers/{email}` pour l'evenement

## 15. Rappel pratique

Le bootstrap minimal d'un nouvel environnement est :

1. creer le projet Firebase
2. creer l'application Web
3. activer Firestore et Auth
4. remplir `.env.*.local`
5. deployer les regles
6. creer le premier `allowedUsers/{email}` avec `admin_events`
7. lancer l'app
8. creer les evenements depuis la vue d'administration protegee
