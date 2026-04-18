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

Le dépôt ignore déjà `.env`, donc la pratique recommandée est :

- garder la config commune minimale dans `.env` si besoin
- mettre la config locale réelle dans `.env.local`

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

Si un développeur doit viser `integration` ponctuellement, il remplace simplement ces valeurs par celles du projet `integration`.

## 3. Déploiement des règles Firestore

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

## 4. Bootstrap du premier administrateur

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

## 5. Bootstrap des opérateurs résultats

Les accès non-OAuth pour `start`, `finish` et `tv` sont stockés dans :

- `allowedResultUsers/{uid}`

En pratique :

- ne pas initialiser cela à la main tant que possible
- laisser le premier administrateur passer par la vue `Admin`
- approuver ensuite les demandes générées par les terminaux concernés

## 6. GitHub Pages

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

## 7. Secrets GitHub à configurer

### 7.1 Secrets de build front

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

### 7.2 Secret CI pour déployer les règles `prod`

Le job `deploy-rules` utilise :

- `FIREBASE_SERVICE_ACCOUNT_PROD`

Ce secret est idéalement stocké dans l'environment GitHub :

- `production`

Le job `deploy-rules` référence déjà cet environment dans le workflow.

## 8. Compte de service CI pour les règles `prod`

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
