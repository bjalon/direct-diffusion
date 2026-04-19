# Direct Diffusion

Application React + Firebase pour diffuser des flux video et gerer le chrono d'evenements en direct.

Le projet est maintenant multi-evenement :

- home publique listant les evenements promus
- administration globale des evenements via un role `admin_events`
- chaque evenement a ses propres donnees TV, chrono, participants, runs et droits
- un meme utilisateur Google peut etre autorise sur plusieurs evenements
- les comptes legers TV / chrono sont memorises localement par evenement

## Vues principales

- `Affichage` : mur de diffusion
- `Flow` : choix des dispositions et affectation des flux
- `Flow admin` : administration des flux Firestore
- `Participants` : gestion des participants
- `Chrono` : workflow depart / arrivee
- `Resultats` : consultation TV / admin des classements
- `Runs` : correction admin des runs
- `Admin` : gestion des droits de l'evenement
- `Archives` : export / restauration / reset de l'evenement courant

## URLs

- home publique : `#/`
- administration globale : `#/events-admin`
- evenement TV : `#/events/:eventSlug/tv/affichage`
- evenement chrono : `#/events/:eventSlug/chrono`

## Stack

- React
- Vite
- React Router
- Firebase Auth
- Cloud Firestore
- GitHub Pages

## Lancement local

```bash
npm install
npm run dev
```

Build production :

```bash
npm run build
```

## Environnements Firebase

Le depot gere trois environnements :

- `prod`
- `integration`
- `dev`

Scripts utiles :

```bash
npm run rules:deploy:prod
npm run rules:deploy:integration
npm run rules:deploy:dev
```

## Documentation de reference

Pour toute la configuration Firebase, le bootstrap du premier admin, le modele multi-evenement et les secrets GitHub :

- [resources/README.md](/home/bjalon/projects/direct-diffusion/resources/README.md)

## Structure de donnees

Le modele Firestore principal est :

```text
allowedUsers/{email}
events/{eventId}
events/{eventId}/allowedUsers/{email}
events/{eventId}/allowedResultUsers/{uid}
events/{eventId}/participants/{participantId}
events/{eventId}/resultEvents/{clickId}
events/{eventId}/resultRuns/{runId}
events/{eventId}/config/streams
```

Le document global `allowedUsers/{email}` porte notamment le role :

- `admin_events` pour acceder a la vue protegee de creation et modification des evenements

Les regles Firestore sont versionnees dans :

- [resources/firestore.rules](/home/bjalon/projects/direct-diffusion/resources/firestore.rules)
