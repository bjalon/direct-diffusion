import { useEffect, useMemo, useState } from 'react';
import { useEventContext } from '../context/EventContext';
import { subscribeParticipants } from '../firebase/participants';
import { subscribeResultRuns, toggleResultRunActive, upsertAdminRun } from '../firebase/results';

export default function ResultsRunsPage({ currentUser }) {
  const { event } = useEventContext();
  const [participants, setParticipants] = useState([]);
  const [resultRuns, setResultRuns] = useState([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [runCourseId, setRunCourseId] = useState('');
  const [runEditId, setRunEditId] = useState('');
  const [runEditStartId, setRunEditStartId] = useState('');
  const [runParticipantId, setRunParticipantId] = useState('');
  const [runParticipantLabel, setRunParticipantLabel] = useState('');
  const [runStatus, setRunStatus] = useState('finished');
  const [runStartAt, setRunStartAt] = useState('');
  const [runTerminalAt, setRunTerminalAt] = useState('');

  useEffect(() => subscribeParticipants(event.id, setParticipants), [event.id]);
  useEffect(() => subscribeResultRuns(event.id, setResultRuns), [event.id]);

  const adminActor = useMemo(
    () => ({
      uid: currentUser?.uid ?? '',
      email: currentUser?.email?.trim().toLowerCase() ?? '',
      providerId: currentUser?.providerData?.[0]?.providerId || 'google.com',
    }),
    [currentUser],
  );

  const courseOptions = useMemo(() => {
    const byCourse = new Map();
    resultRuns.forEach((run) => {
      if (!run.courseId) return;
      const existing = byCourse.get(run.courseId);
      const updatedAt = run.updatedAt?.toMillis?.() ?? 0;
      if (!existing || updatedAt > existing.updatedAt) {
        byCourse.set(run.courseId, {
          courseId: run.courseId,
          courseLabel: run.courseLabel || run.courseId,
          updatedAt,
        });
      }
    });
    return [...byCourse.values()]
      .sort((a, b) => a.courseLabel.localeCompare(b.courseLabel));
  }, [resultRuns]);

  const selectedCourse = useMemo(
    () => courseOptions.find((course) => course.courseId === runCourseId) ?? null,
    [courseOptions, runCourseId],
  );

  const editableRuns = useMemo(
    () => resultRuns
      .filter((run) => run.courseId === runCourseId && ['finished', 'abandoned'].includes(run.status))
      .sort((a, b) => getRunTerminalAtMs(b) - getRunTerminalAtMs(a)),
    [resultRuns, runCourseId],
  );

  useEffect(() => {
    if (runCourseId || courseOptions.length === 0) return;
    setRunCourseId(courseOptions[0].courseId);
  }, [courseOptions, runCourseId]);

  const clearMessages = () => {
    setFeedback('');
    setError('');
  };

  const resetRunEditor = (nextCourseId = runCourseId) => {
    setRunEditId('');
    setRunEditStartId('');
    setRunParticipantId('');
    setRunParticipantLabel('');
    setRunStatus('finished');
    setRunStartAt('');
    setRunTerminalAt('');
    if (nextCourseId !== runCourseId) {
      setRunCourseId(nextCourseId);
    }
  };

  const closeRunEditor = () => {
    setEditorOpen(false);
    setError('');
  };

  const handleCreateRun = () => {
    clearMessages();
    if (!runCourseId) {
      setError("Sélectionnez d’abord une course.");
      return;
    }
    resetRunEditor(runCourseId);
    setEditorOpen(true);
  };

  const handleEditRun = (run) => {
    clearMessages();
    setRunCourseId(run.courseId || '');
    setRunEditId(run.runId || run.id || '');
    setRunEditStartId(run.startId || run.runId || run.id || '');
    setRunParticipantId(run.participantId || '');
    setRunParticipantLabel(run.participantLabel || '');
    setRunStatus(run.status === 'abandoned' ? 'abandoned' : 'finished');
    setRunStartAt(formatDateTimeLocalInput(run.officialStartAtClientMs || run.latestStartAtClientMs));
    setRunTerminalAt(formatDateTimeLocalInput(getRunTerminalAtMs(run)));
    setEditorOpen(true);
  };

  const handleSaveRun = async (e) => {
    e.preventDefault();
    clearMessages();

    if (!adminActor.uid) {
      setError("Compte administrateur introuvable.");
      return;
    }
    if (!selectedCourse) {
      setError("Sélectionnez une course.");
      return;
    }

    const participant = participants.find((entry) => entry.id === runParticipantId) ?? null;
    const participantLabel = runParticipantLabel.trim() || participant?.label || '';
    const startAtClientMs = parseDateTimeLocalInput(runStartAt);
    const terminalAtClientMs = parseDateTimeLocalInput(runTerminalAt);

    if (!participantLabel) {
      setError("Saisissez un participant.");
      return;
    }
    if (!Number.isFinite(startAtClientMs) || !Number.isFinite(terminalAtClientMs)) {
      setError(`Saisissez une heure de départ et une heure de ${runStatus === 'abandoned' ? 'abandon' : 'fin'} valides.`);
      return;
    }
    if (terminalAtClientMs <= startAtClientMs) {
      setError(`${runStatus === 'abandoned' ? "L'abandon" : "L'arrivée"} doit être postérieur${runStatus === 'abandoned' ? '' : 'e'} au départ.`);
      return;
    }

    setBusyKey('run-save');
    try {
      const result = await upsertAdminRun(event.id, {
        runId: runEditId || undefined,
        startId: runEditStartId || undefined,
        courseId: selectedCourse.courseId,
        courseLabel: selectedCourse.courseLabel,
        participantId: runParticipantId || participant?.id || '',
        participantLabel,
        startAtClientMs,
        terminalAtClientMs,
        status: runStatus,
        actor: adminActor,
      });
      setFeedback(runEditId
        ? `Run mis à jour (${getRunStatusLabel(result.status).toLowerCase()}) pour ${result.participantLabel} sur ${result.courseLabel}.`
        : `Run créé (${getRunStatusLabel(result.status).toLowerCase()}) pour ${result.participantLabel} sur ${result.courseLabel}.`);
      setEditorOpen(false);
      resetRunEditor(selectedCourse.courseId);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleToggleRunActive = async (run, active) => {
    clearMessages();
    const key = `run-active:${run.runId || run.id}`;
    setBusyKey(key);
    try {
      await toggleResultRunActive(event.id, {
        runId: run.runId || run.id || '',
        officialStartClickId: run.officialStartClickId,
        latestStartClickId: run.latestStartClickId,
        finishClickId: run.finishClickId,
        abandonClickId: run.abandonClickId,
        active,
      });
      setFeedback(`Run ${active ? 'activé' : 'désactivé'} pour ${run.participantLabel || '—'}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Correction manuelle des runs</h2>
          <div className="admin-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCreateRun}
              disabled={busyKey === 'run-save'}
            >
              Nouveau run
            </button>
          </div>
        </div>
        <p className="hint">
          Créez un run terminé ou abandonné, ou remplacez un run existant sur une course. La correction met à jour <code>resultRuns</code> et recrée les événements actifs <code>start</code> / <code>finish</code> ou <code>abandon</code>.
        </p>
        {feedback && <div className="admin-feedback">{feedback}</div>}
        {error && <div className="form-error">{error}</div>}
      </section>

      <section className="config-section">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Participant</th>
                <th>État</th>
                <th>Actif</th>
                <th>Départ</th>
                <th>Fin / abandon</th>
                <th>Temps</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="8">
                  <div className="admin-run-filter">
                    <label className="form-label" htmlFor="admin-run-course">Course</label>
                    <select
                      id="admin-run-course"
                      className="form-input"
                      value={runCourseId}
                      onChange={(e) => {
                        setRunCourseId(e.target.value);
                        resetRunEditor(e.target.value);
                      }}
                    >
                      <option value="">Sélectionner une course</option>
                      {courseOptions.map((course) => (
                        <option key={course.courseId} value={course.courseId}>{course.courseLabel}</option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
              {runCourseId && editableRuns.map((run) => (
                <tr key={run.runId || run.id} className={getRunIsActive(run) ? '' : 'admin-row-inactive'}>
                  <td>{run.courseLabel || run.courseId}</td>
                  <td>{run.participantLabel || '—'}</td>
                  <td>{getRunStatusLabel(run.status)}</td>
                  <td className="admin-cell-center">
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={getRunIsActive(run)}
                        disabled={busyKey !== '' && busyKey !== `run-active:${run.runId || run.id}`}
                        onChange={(e) => handleToggleRunActive(run, e.target.checked)}
                      />
                    </label>
                  </td>
                  <td>{formatClientDateTime(run.officialStartAtClientMs || run.latestStartAtClientMs)}</td>
                  <td>{formatClientDateTime(getRunTerminalAtMs(run))}</td>
                  <td className="admin-uid">{run.status === 'abandoned' ? 'Abandon' : run.durationLabel || '—'}</td>
                  <td className="admin-cell-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEditRun(run)}
                      disabled={busyKey === 'run-save'}
                    >
                      Éditer
                    </button>
                  </td>
                </tr>
              ))}
              {runCourseId && editableRuns.length === 0 && (
                <tr>
                  <td colSpan="8">
                    <div className="stream-empty">Aucun run terminé ou abandonné sur cette course.</div>
                  </td>
                </tr>
              )}
              {!runCourseId && (
                <tr>
                  <td colSpan="8">
                    <div className="stream-empty">Sélectionnez une course pour afficher les runs existants.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editorOpen && (
        <div className="dialog-overlay" onClick={closeRunEditor}>
          <div className="dialog admin-run-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{runEditId ? 'Modifier un run' : 'Créer un run'}</div>
            <div className="dialog-desc">
              {selectedCourse ? selectedCourse.courseLabel : 'Choisissez d’abord une course'}
            </div>
            {error && <div className="form-error">{error}</div>}
            <form className="admin-run-dialog-form" onSubmit={handleSaveRun}>
              <div className="admin-form-grid">
                <label className="admin-form-field">
                  <span className="form-label">État du run</span>
                  <select
                    className="form-input"
                    value={runStatus}
                    onChange={(e) => setRunStatus(e.target.value)}
                  >
                    <option value="finished">Terminé</option>
                    <option value="abandoned">Abandonné</option>
                  </select>
                </label>

                <label className="admin-form-field">
                  <span className="form-label">Participant connu</span>
                  <select
                    className="form-input"
                    value={runParticipantId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const nextParticipant = participants.find((entry) => entry.id === nextId) ?? null;
                      setRunParticipantId(nextId);
                      if (nextParticipant) setRunParticipantLabel(nextParticipant.label);
                    }}
                  >
                    <option value="">Sélectionner</option>
                    {participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>{participant.label}</option>
                    ))}
                  </select>
                </label>

                <label className="admin-form-field">
                  <span className="form-label">Nom affiché</span>
                  <input
                    className="form-input"
                    value={runParticipantLabel}
                    onChange={(e) => setRunParticipantLabel(e.target.value)}
                    placeholder="Nom du participant"
                    required
                  />
                </label>

                <label className="admin-form-field">
                  <span className="form-label">Départ</span>
                  <input
                    type="datetime-local"
                    step="1"
                    className="form-input"
                    value={runStartAt}
                    onChange={(e) => setRunStartAt(e.target.value)}
                    required
                  />
                </label>

                <label className="admin-form-field">
                  <span className="form-label">{runStatus === 'abandoned' ? 'Abandon' : 'Arrivée'}</span>
                  <input
                    type="datetime-local"
                    step="1"
                    className="form-input"
                    value={runTerminalAt}
                    onChange={(e) => setRunTerminalAt(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="dialog-actions">
                <button className="btn btn-primary" type="submit" disabled={busyKey === 'run-save' || !selectedCourse}>
                  {busyKey === 'run-save' ? 'Enregistrement…' : runEditId ? 'Enregistrer les modifications' : 'Créer le run'}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={busyKey === 'run-save'}
                  onClick={() => resetRunEditor(runCourseId)}
                >
                  Réinitialiser
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={busyKey === 'run-save'}
                  onClick={closeRunEditor}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function getErrorLabel(error) {
  if (error?.message === 'admin-run-missing-run-id') return 'Identifiant du run manquant.';
  if (error?.message === 'admin-run-missing-fields') return 'Course ou participant manquant.';
  if (error?.message === 'admin-run-invalid-status') return 'Le type de run est invalide.';
  if (error?.message === 'admin-run-invalid-times') return 'Les horodatages départ / fin sont invalides.';
  return error?.code ? `Erreur : ${error.code}` : error?.message || "Une erreur est survenue.";
}

function getRunTerminalAtMs(run) {
  return run.finishAtClientMs ?? run.abandonAtClientMs ?? 0;
}

function getRunIsActive(run) {
  return run.active !== false;
}

function getRunStatusLabel(status) {
  return status === 'abandoned' ? 'Abandon' : 'Terminé';
}

function formatClientDateTime(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(ms));
}

function formatDateTimeLocalInput(ms) {
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function parseDateTimeLocalInput(value) {
  if (!value) return Number.NaN;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : Number.NaN;
}
