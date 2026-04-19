export const RESULT_ARCHIVE_MODEL_VERSION = 5;
export const RESULT_ARCHIVE_FILENAME = 'course-archive.json';

export const RESULT_ARCHIVE_MODEL = {
  name: 'direct-diffusion-course-archive',
  version: RESULT_ARCHIVE_MODEL_VERSION,
  description: {
    course: 'Metadonnees de la course archivee',
    schema: 'Description du modele de donnees exporte',
    data: {
      resultEvents: 'Documents resultEvents lies a la course dans l’evenement courant',
      resultRuns: 'Documents resultRuns lies a la course dans l’evenement courant',
      currentCompetitor: 'Document currentCompetitor/current si la course etait active',
      startStation: 'Document resultStations/start si la course etait active sur ce poste',
      resultStations: 'Documents resultStations exportes pour l’evenement courant',
      participants: 'Documents participants exportes pour l’evenement courant',
      streams: 'Document config/streams exporte pour l’evenement courant',
      allowedResultUsers: 'Documents allowedResultUsers exportes pour l’evenement courant',
      resultAccessRequests: 'Documents resultAccessRequests exportes pour l’evenement courant',
    },
  },
  changelog: [
    { version: 1, notes: 'Archive JSON zippee mono-fichier avec resultEvents et resultRuns.' },
    { version: 2, notes: 'Ajout des etats ephemeres currentCompetitor et resultStations/start pour la restauration complete.' },
    { version: 3, notes: 'Ajout des archives globales et de resultStations complets (start/finish) dans un onglet dedie.' },
    { version: 4, notes: 'Ajout des participants et des flux video dans l’archive globale et sa restauration.' },
    { version: 5, notes: 'Ajout des utilisateurs non-OAuth et de leurs demandes dans l’archive globale et la reinitialisation totale.' },
  ],
};
