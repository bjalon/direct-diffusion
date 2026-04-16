import { useEffect, useMemo, useState } from 'react';
import {
  deleteAllResultsData,
  deleteCourseData,
  exportAllResultsArchive,
  exportCourseArchive,
  restoreCourseArchive,
  subscribeResultEvents,
} from '../firebase/results';
import { sortEventsNewestFirst } from '../utils/resultsDerivation';
import { RESULT_ARCHIVE_MODEL_VERSION } from '../utils/resultArchiveModel';

const RESET_ALL_CONFIRMATION = 'SUPPRIMER TOUT';

export default function ResultsArchivePage() {
  const [events, setEvents] = useState([]);
  const [archiveBusyKey, setArchiveBusyKey] = useState('');
  const [archiveMessage, setArchiveMessage] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetPasteBlocked, setResetPasteBlocked] = useState(false);

  useEffect(() => subscribeResultEvents((entries) => setEvents(sortEventsNewestFirst(entries))), []);

  const courseSummaries = useMemo(() => {
    const byCourse = new Map();
    events.forEach((event) => {
      const courseId = event.courseId;
      if (!courseId) return;
      const existing = byCourse.get(courseId) ?? {
        courseId,
        courseLabel: event.courseLabel || courseId,
        eventCount: 0,
        lastEventAt: 0,
      };
      existing.eventCount += 1;
      existing.lastEventAt = Math.max(existing.lastEventAt, event.clickedAtClientMs ?? 0);
      byCourse.set(courseId, existing);
    });
    return [...byCourse.values()].sort((a, b) => b.lastEventAt - a.lastEventAt);
  }, [events]);

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const runArchiveAction = async (key, action) => {
    setArchiveBusyKey(key);
    setArchiveMessage('');
    setArchiveError('');
    try {
      await action();
    } catch (error) {
      setArchiveError(getErrorLabel(error));
    } finally {
      setArchiveBusyKey('');
    }
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <h2 className="section-title">Archives Résultats</h2>
        <p className="hint">
          Exports ZIP mono-fichier versionnés. Modèle d’archive courant : <strong>v{RESULT_ARCHIVE_MODEL_VERSION}</strong>
        </p>
        {archiveMessage && <div className="admin-feedback">{archiveMessage}</div>}
        {archiveError && <div className="form-error">{archiveError}</div>}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Archive globale</h2>
        </div>
        <div className="results-archive-toolbar">
          <button
            className="btn btn-secondary"
            disabled={archiveBusyKey !== '' && archiveBusyKey !== 'export-all'}
            onClick={() => runArchiveAction('export-all', async () => {
              const { blob, filename } = await exportAllResultsArchive();
              downloadBlob(blob, filename);
              setArchiveMessage('Export global terminé.');
            })}
          >
            {archiveBusyKey === 'export-all' ? 'Export…' : 'Exporter tout'}
          </button>
          <label className="btn btn-secondary" style={{ display: 'inline-flex', cursor: archiveBusyKey ? 'not-allowed' : 'pointer' }}>
            {archiveBusyKey === 'restore' ? 'Restauration…' : 'Restaurer tout / une course'}
            <input
              type="file"
              accept=".zip,application/zip"
              style={{ display: 'none' }}
              disabled={archiveBusyKey !== ''}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                runArchiveAction('restore', async () => {
                  const result = await restoreCourseArchive(file);
                  if (result.scope === 'all') {
                    setArchiveMessage(`Archive globale restaurée (modèle v${result.version}).`);
                  } else {
                    setArchiveMessage(`Course restaurée : ${result.courseLabel || result.courseId} (modèle v${result.version}).`);
                  }
                });
              }}
            />
          </label>
        </div>
        <div className="results-reset-panel">
          <div className="results-reset-copy">
            <h3 className="results-reset-title">Réinitialisation totale</h3>
            <p className="hint">
              Supprime toutes les données de résultats, les participants, les flux vidéo, les utilisateurs non-OAuth
              autorisés et leurs demandes d’accès.
            </p>
            <p className="hint">
              Pour confirmer, saisis exactement <strong>{RESET_ALL_CONFIRMATION}</strong>. Le collage est désactivé.
            </p>
          </div>
          <div className="results-reset-actions">
            <input
              type="text"
              className="form-input"
              value={resetConfirmation}
              autoComplete="off"
              spellCheck={false}
              placeholder={RESET_ALL_CONFIRMATION}
              onChange={(e) => {
                setResetConfirmation(e.target.value);
                if (resetPasteBlocked) setResetPasteBlocked(false);
              }}
              onPaste={(e) => {
                e.preventDefault();
                setResetPasteBlocked(true);
              }}
            />
            {resetPasteBlocked && (
              <div className="form-error">Le collage est désactivé pour cette confirmation.</div>
            )}
            <button
              className="btn btn-danger"
              disabled={archiveBusyKey !== '' || resetConfirmation !== RESET_ALL_CONFIRMATION}
              onClick={() => runArchiveAction('reset-all', async () => {
                await deleteAllResultsData();
                setResetConfirmation('');
                setResetPasteBlocked(false);
                setArchiveMessage('Réinitialisation totale effectuée.');
              })}
            >
              {archiveBusyKey === 'reset-all' ? 'Réinitialisation…' : 'Tout réinitialiser'}
            </button>
          </div>
        </div>
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Archives par course</h2>
        </div>
        {courseSummaries.length === 0 ? (
          <div className="stream-empty">Aucune course archivable pour le moment.</div>
        ) : (
          <div className="admin-card-list">
            {courseSummaries.map((course) => (
              <article key={course.courseId} className="admin-card">
                <div className="admin-card-main">
                  <div className="admin-email">{course.courseLabel}</div>
                  <div className="admin-subline">ID {course.courseId}</div>
                  <div className="admin-subline">{course.eventCount} évènement(s)</div>
                </div>
                <div className="admin-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={archiveBusyKey !== '' && archiveBusyKey !== `export:${course.courseId}`}
                    onClick={() => runArchiveAction(`export:${course.courseId}`, async () => {
                      const { blob, filename } = await exportCourseArchive(course.courseId);
                      downloadBlob(blob, filename);
                      setArchiveMessage(`Archive exportée pour ${course.courseId}.`);
                    })}
                  >
                    {archiveBusyKey === `export:${course.courseId}` ? 'Export…' : 'Exporter ZIP'}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={archiveBusyKey !== '' && archiveBusyKey !== `archive:${course.courseId}`}
                    onClick={() => runArchiveAction(`archive:${course.courseId}`, async () => {
                      const { blob, filename } = await exportCourseArchive(course.courseId);
                      downloadBlob(blob, filename);
                      await deleteCourseData(course.courseId);
                      setArchiveMessage(`Course ${course.courseId} archivée puis supprimée.`);
                    })}
                  >
                    {archiveBusyKey === `archive:${course.courseId}` ? 'Archivage…' : 'Archiver et supprimer'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function getErrorLabel(error) {
  if (String(error?.message || '').startsWith('archive-version-mismatch:')) {
    const version = String(error.message).split(':')[1] || '?';
    return `Version d’archive incompatible : ${version}.`;
  }
  if (error?.message === 'archive-invalid-file') return 'Le ZIP ne contient pas le fichier attendu.';
  if (error?.message === 'archive-invalid-type') return 'Le fichier fourni ne correspond pas à une archive Direct Diffusion.';
  if (error?.message === 'archive-invalid-signature') return 'Le fichier ZIP est invalide.';
  return error?.code ? `Erreur : ${error.code}` : error?.message || 'Une erreur est survenue.';
}
