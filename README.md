# Direct Diffusion

Direct Diffusion is a React and Firebase application built to manage and display multiple live video feeds during events. It combines a display wall, a stream configuration UI, participant management, a dedicated start/finish operator flow, and an administration area for access control.

The project is designed for lightweight operations on event day:

- a public-facing display view for multi-stream broadcasting
- a configuration area for assigning streams to screen slots
- participant management and lightweight result capture for competitions
- Firebase-backed authentication and role-based access control
- an administration view to manage access requests and authorized users

## Overview

The application is split into a few functional areas:

- `Affichage`: live display grid for the configured streams
- `Flux`: stream library, layout selection, and slot assignment
- `Participants`: participant registry
- `Résultats`: dedicated start/finish operator workflow
- `Admin`: access requests and role assignment for authorized administrators

The UI is built with React and Vite. Application data is stored in Firestore. Authentication uses Firebase Auth with two distinct flows:

- Google OAuth for administration, stream management, and participant management
- Firebase anonymous auth for the `/results` operator workflow

## Features

- Multi-layout display wall: `1`, `1x2`, `2x1`, `2x2`, `3x2`, `3x3`
- Video stream ingestion from Facebook video URLs or embed iframes
- Virtual display blocks for ranking and race summaries
- Real-time Firestore synchronization
- Local persistence of display layout and slot mapping
- Participant ordering and start/finish result capture
- Role-based feature visibility
- Separate access request workflows for Google users and result operators

## Tech Stack

- React 18
- Vite 5
- React Router
- Firebase Auth
- Cloud Firestore
- GitHub Pages for front-end hosting

## Project Structure

```text
.
├── public/                    # Static assets, default streams seed, CNAME
├── resources/
│   └── firestore.rules        # Firestore security rules
├── src/
│   ├── components/            # Shared UI components
│   ├── firebase/              # Firestore/Auth helpers
│   ├── pages/                 # Top-level pages
│   ├── utils/                 # Storage, parsing, time helpers
│   ├── App.jsx                # App shell and routing
│   └── main.jsx               # App entrypoint
├── firebase.json              # Firebase CLI config
├── vite.config.js             # Vite config
└── .github/workflows/         # GitHub Pages deployment workflow
```

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- a Firebase project with:
  - Authentication enabled
  - Cloud Firestore enabled

### Install

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Environment Configuration

The application reads its runtime configuration from Vite environment variables.

The repository currently includes a base `.env` file. For local overrides, use `.env.local`.

Required variables:

```bash
VITE_DEFAULT_LAYOUT=2x2
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Notes:

- `VITE_DEFAULT_LAYOUT` controls the initial layout on first load
- Firebase front-end config values are not secrets; they identify the client app
- security must be enforced by Firestore rules, not by hiding values in the client

## Authentication And Roles

Application access is controlled through Firestore documents stored in:

```text
allowedUsers/{email}
```

Each Google-authorized document may contain these role flags:

- `administration`
- `admin_flux`
- `participants`

Behavior:

- document existence grants base application access
- `administration` allows access to the admin page and modification of `allowedUsers`
- `admin_flux` allows editing the stream configuration stored in Firestore
- `participants` allows editing the participants collection

Sensitive roles are restricted to Google OAuth in Firestore rules:

- `administration` requires the `google.com` sign-in provider
- `admin_flux` requires the `google.com` sign-in provider
- `participants` requires the `google.com` sign-in provider

## Result Operator Access

The `/results` page uses Firebase anonymous auth by default and stores operator rights by Firebase `uid`.

Dedicated operator capabilities are stored in:

```text
allowedResultUsers/{uid}
```

Supported result capabilities:

- `results_start`
- `results_finish`

When a result operator is not yet approved, the page asks for an email and creates a request in:

```text
resultAccessRequests/{uid}
```

This keeps the access decision attached to a stable Firebase identity while still allowing a lightweight operator flow on shared field devices.

## Access Requests

When an authenticated Google user is not present in `allowedUsers`, the application shows an access denied screen and allows them to create a request in:

```text
accessRequests/{email}
```

Administrators can then:

- review pending requests
- approve a request and create/update the corresponding `allowedUsers/{email}` document
- reject a request

## Firestore Data Model

Main collections used by the app:

```text
allowedUsers/{email}
accessRequests/{email}
allowedResultUsers/{uid}
resultAccessRequests/{uid}
resultStations/{start|finish}
currentCompetitor/current
resultEvents/{clickId}
resultRuns/{runId}
clockChecks/{uid}
config/streams
participants/{participantId}
```

### Result Timing Workflow

The result workflow is intentionally simple:

1. open `/results`
2. verify browser clock drift against Firestore server time
3. authenticate anonymously if needed
4. request access by entering an email
5. wait for admin approval on the matching Firebase `uid`
6. claim either the `start` or `finish` station
7. operate the station in real time using Firestore subscriptions

Start clicks are buffered locally in the browser before synchronization. Once synced, each click is written as an immutable Firestore event with a server-side sync timestamp.

## Firestore Rules

Firestore rules are stored in:

[resources/firestore.rules](/home/bjalon/projects/direct-diffusion/resources/firestore.rules)

Firebase CLI is configured through:

[firebase.json](/home/bjalon/projects/direct-diffusion/firebase.json)

## Deploying Firestore Rules

Firestore rules are intentionally deployed manually from a local workstation, not from CI.

### Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Authenticate

```bash
firebase login
```

### Deploy Rules

Always target the project explicitly:

```bash
firebase deploy --only firestore:rules --project <your-firebase-project-id>
```

This command reads `firebase.json`, which points to `resources/firestore.rules`.

### Recommended Safety Practice

- always pass `--project`
- review the rule diff before deployment
- keep at least one existing user with the `administration` role
- validate the admin UI after each rules update
- validate `/results` with one start station and one finish station after each rules update

## Front-End Deployment

The front-end is deployed to GitHub Pages through the workflow in:

[.github/workflows/deploy-pages.yml](/home/bjalon/projects/direct-diffusion/.github/workflows/deploy-pages.yml)

That workflow builds the Vite app and publishes the `dist/` folder.

Important:

- GitHub Pages deployment is automated
- Firestore rules deployment is manual and local
- these are intentionally separate concerns

## Development Notes

### Default Streams

Default streams are stored in:

```text
public/streams.json
```

On first authorized startup, the application can seed Firestore from this file if `config/streams` is empty. After that, Firestore becomes the source of truth.

### Routing

The application uses `HashRouter`, which keeps GitHub Pages hosting simple.

### Local Persistence

Layout and slot assignments are stored in browser local storage. The start station also uses local storage as a temporary click buffer before sync. Streams, participants, access requests, result events, result runs, and authorized users live in Firestore.

## Security Model

The front-end hides pages and actions based on user roles, but real protection must come from Firestore rules.

That means:

- UI visibility is a convenience
- Firestore rules are the actual authorization boundary
- any write permission must be validated server-side by Firestore rules

## Contributing

Contributions are welcome.

Before opening a pull request:

1. Install dependencies with `npm install`
2. Run the app locally with `npm run dev`
3. Build the project with `npm run build`
4. If you changed access control, review `resources/firestore.rules`

## Roadmap

- add automated tests for Firestore rules
- improve bundle splitting for the front-end build
- document Firebase project bootstrap in more detail
- add a seed script for initial admin user provisioning

## License

No license file is currently included in the repository. Until one is added, treat the project as all rights reserved by default.
