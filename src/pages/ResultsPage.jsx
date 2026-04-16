import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';
import { subscribeParticipants } from '../firebase/participants';
import {
  abandonCurrentCompetitor,
  armCurrentCompetitor,
  cancelCurrentCompetitor,
  claimStation,
  completeCurrentCompetitor,
  mirrorPendingStartClicks,
  releaseStation,
  setStartStationCourse,
  submitResultAccessRequest,
  subscribeCurrentCompetitor,
  subscribeResultAccess,
  subscribeResultAccessRequest,
  subscribeResultEvents,
  subscribeStation,
  syncStartBuffer,
  verifyBrowserClock,
} from '../firebase/results';
import {
  clearStartBuffer,
  createClickEntry,
  loadStartBuffer,
  saveStartBuffer,
} from '../utils/resultsBuffer';
import { createLogger } from '../utils/logger';
import { deriveFinishedCourses } from '../utils/resultsDerivation';

const log = createLogger('ResultsPage');

export default function ResultsPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [signInState, setSignInState] = useState('idle');
  const [clockState, setClockState] = useState({
    status: 'pending',
    driftMs: 0,
    error: '',
    serverNow: null,
    measuredAtClientMs: null,
  });
  const [requestEmail, setRequestEmail] = useState('');
  const [submitState, setSubmitState] = useState('idle');
  const [resultAccess, setResultAccess] = useState(null);
  const [resultRequest, setResultRequest] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedStation, setSelectedStation] = useState('');
  const [stationState, setStationState] = useState('idle');
  const [stationError, setStationError] = useState('');
  const [stationDocs, setStationDocs] = useState({ start: null, finish: null });
  const [currentCompetitor, setCurrentCompetitor] = useState(null);
  const [resultEvents, setResultEvents] = useState([]);
  const [startBuffer, setStartBuffer] = useState([]);
  const [courseDraft, setCourseDraft] = useState('');
  const [currentCourse, setCurrentCourse] = useState(null);
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [depossessionNotice, setDepossessionNotice] = useState('');
  const [hadSelectedStationOwnership, setHadSelectedStationOwnership] = useState(false);

  useEffect(() => {
    if (user !== false || signInState === 'signing-in') return;
    log.info('starting anonymous sign-in for results page');
    setSignInState('signing-in');
    signInAnonymously(auth)
      .then((credential) => {
        log.info('anonymous sign-in succeeded', {
          uid: credential.user.uid,
          isAnonymous: credential.user.isAnonymous,
        });
        setSignInState('done');
      })
      .catch((error) => {
        log.error('anonymous sign-in failed', error);
        setSignInState('error');
        setActionError(getErrorLabel(error));
      });
  }, [user, signInState]);

  useEffect(() => {
    if (!user || user === false) return;

    log.info('starting browser clock verification', { uid: user.uid });
    setClockState({
      status: 'checking',
      driftMs: 0,
      error: '',
      serverNow: null,
      measuredAtClientMs: null,
    });
    verifyBrowserClock(user.uid)
      .then(({ driftMs, serverNow }) => {
        const measuredAtClientMs = Date.now();
        log.info('browser clock verification completed', { uid: user.uid, driftMs });
        setClockState({
          status: Math.abs(driftMs) > 1000 ? 'invalid' : 'valid',
          driftMs,
          error: '',
          serverNow,
          measuredAtClientMs,
        });
      })
      .catch((error) => {
        log.error('browser clock verification failed', error);
        setClockState({
          status: 'unavailable',
          driftMs: 0,
          error: getErrorLabel(error),
          serverNow: null,
          measuredAtClientMs: null,
        });
      });
  }, [user?.uid]);

  useEffect(() => {
    if (!user || user === false) return;
    return subscribeResultAccess(user.uid, setResultAccess);
  }, [user?.uid]);

  useEffect(() => {
    if (!user || user === false) return;
    return subscribeResultAccessRequest(user.uid, (request) => {
      setResultRequest(request);
      if (request?.email) setRequestEmail(request.email);
    });
  }, [user?.uid]);

  const canStart = !!resultAccess?.results_start;
  const canFinish = !!resultAccess?.results_finish;
  const hasResultAccess = canStart || canFinish;
  const actor = useMemo(() => {
    if (!user || user === false) return null;
    return {
      uid: user.uid,
      email: (resultAccess?.email || resultRequest?.email || user.email || '').trim().toLowerCase(),
      providerId: primaryProvider(user),
    };
  }, [user, resultAccess?.email, resultRequest?.email]);

  useEffect(() => {
    if (!hasResultAccess) {
      log.debug('results access not granted yet', {
        request: resultRequest,
        access: resultAccess,
      });
      setSelectedStation('');
      return;
    }
  }, [hasResultAccess, resultRequest, resultAccess]);

  useEffect(() => {
    if (!hasResultAccess) return;
    return subscribeCurrentCompetitor(setCurrentCompetitor);
  }, [hasResultAccess]);

  useEffect(() => {
    if (!canStart) return;
    return subscribeParticipants(setParticipants);
  }, [canStart]);

  useEffect(() => {
    if (!canStart) return;
    return subscribeResultEvents(setResultEvents);
  }, [canStart]);

  useEffect(() => {
    const unsubs = [];
    if (canStart) {
      unsubs.push(subscribeStation('start', (doc) => setStationDocs((prev) => ({ ...prev, start: doc }))));
    }
    if (canFinish) {
      unsubs.push(subscribeStation('finish', (doc) => setStationDocs((prev) => ({ ...prev, finish: doc }))));
    }
    return () => unsubs.forEach((unsub) => unsub());
  }, [canStart, canFinish]);

  useEffect(() => {
    if (!selectedStation || !actor || !hasResultAccess) return;
    log.info('claiming station from results page', { station: selectedStation, actor });
    setStationState('claiming');
    setStationError('');
    claimStation(selectedStation, actor)
      .then(() => {
        log.info('station claimed', { station: selectedStation, actorUid: actor.uid });
        setStationState('claimed');
      })
      .catch((error) => {
        log.error('station claim failed', { station: selectedStation, error });
        setStationState('error');
        setStationError(getErrorLabel(error));
      });
  }, [selectedStation, actor?.uid, hasResultAccess]);

  useEffect(() => {
    const runId = currentCompetitor?.runId;
    if (!runId || currentCompetitor?.selectedByUid !== actor?.uid || selectedStation !== 'start') {
      setStartBuffer([]);
      return;
    }
    setStartBuffer(loadStartBuffer(runId));
  }, [currentCompetitor?.runId, currentCompetitor?.selectedByUid, actor?.uid, selectedStation]);

  useEffect(() => {
    if (selectedStation !== 'start') return;
    if (currentCompetitor?.courseId) {
      setCurrentCourse({
        courseId: currentCompetitor.courseId,
        courseLabel: currentCompetitor.courseLabel || currentCompetitor.courseId,
      });
      setCourseDraft(currentCompetitor.courseLabel || currentCompetitor.courseId);
    }
  }, [currentCompetitor?.courseId, currentCompetitor?.courseLabel, selectedStation]);

  useEffect(() => {
    if (selectedStation !== 'start' || currentCompetitor?.courseId) return;
    const stationCourseId = stationDocs.start?.currentCourseId;
    if (stationCourseId) {
      setCurrentCourse({
        courseId: stationCourseId,
        courseLabel: stationDocs.start?.currentCourseLabel || stationCourseId,
      });
      setCourseDraft(stationDocs.start?.currentCourseLabel || stationCourseId);
    }
  }, [
    selectedStation,
    currentCompetitor?.courseId,
    stationDocs.start?.currentCourseId,
    stationDocs.start?.currentCourseLabel,
  ]);

  useEffect(() => () => {
    if (selectedStation && actor?.uid) {
      releaseStation(selectedStation, actor.uid).catch(() => {});
    }
  }, [selectedStation, actor?.uid]);

  useEffect(() => {
    if (!selectedStation || !actor?.uid) return;
    const stationDoc = selectedStation === 'start' ? stationDocs.start : stationDocs.finish;
    if (stationDoc?.assignedUid === actor.uid) {
      setHadSelectedStationOwnership(true);
    }
  }, [selectedStation, stationDocs.start?.assignedUid, stationDocs.finish?.assignedUid, actor?.uid]);

  useEffect(() => {
    if (!selectedStation || !actor?.uid || !hadSelectedStationOwnership) return;
    const stationDoc = selectedStation === 'start' ? stationDocs.start : stationDocs.finish;
    const stationLabel = selectedStation === 'start' ? 'départ' : 'arrivée';

    if (!stationDoc) {
      setDepossessionNotice(`Vous avez été dépossédé du poste ${stationLabel}. Les actions sont désormais bloquées tant que vous ne reprenez pas ce poste.`);
      return;
    }

    if (!stationDoc.assignedUid || stationDoc.assignedUid !== actor.uid) {
      setDepossessionNotice(`Vous avez été dépossédé du poste ${stationLabel}. Les actions sont désormais bloquées tant que vous ne reprenez pas ce poste.`);
    }
  }, [selectedStation, stationDocs.start?.assignedUid, stationDocs.finish?.assignedUid, actor?.uid, hadSelectedStationOwnership]);

  useEffect(() => {
    setHadSelectedStationOwnership(false);
  }, [selectedStation]);

  if (user === false || signInState === 'signing-in') {
    return <ResultsLoadingCard label="Connexion anonyme du poste résultats…" />;
  }

  if (signInState === 'error') {
    return <ResultsErrorCard title="Connexion impossible" message={actionError} onLogout={onLogout} />;
  }

  if (!user) {
    return <ResultsLoadingCard label="Préparation du poste résultats…" />;
  }

  if (clockState.status === 'checking' || clockState.status === 'pending') {
    return <ResultsLoadingCard label="Vérification de l’horloge du navigateur…" />;
  }

  if (!hasResultAccess) {
    if (resultAccess?.tv) {
      return (
        <ResultsErrorCard
          title="Accès TV uniquement"
          message="Ce compte léger peut accéder à l’affichage, aux flux et aux layouts, mais pas à la saisie résultats."
          onLogout={onLogout}
          actions={(
            <>
              <button className="btn btn-primary login-btn" onClick={() => navigate('/')}>
                Aller sur Affichage
              </button>
              <button className="btn btn-secondary login-btn" onClick={onLogout}>
                Se déconnecter
              </button>
            </>
          )}
        />
      );
    }

    const pendingLike = resultRequest || (resultAccess && !resultAccess.tv ? resultAccess : null);
    if (pendingLike) {
      log.info('rendering pending result access screen', pendingLike);
      return (
        <ResultsShell title="Demande en attente" subtitle="Votre demande d’accès résultats a bien été enregistrée.">
          <div className="results-status-card">
            <div className="results-status-line"><strong>Email:</strong> {pendingLike.email || '—'}</div>
            <div className="results-status-line"><strong>UID:</strong> {user.uid}</div>
            <div className="results-status-line"><strong>Statut:</strong> {statusLabel(pendingLike.status)}</div>
            <button className="btn btn-secondary login-btn" onClick={onLogout}>Se déconnecter</button>
          </div>
        </ResultsShell>
      );
    }

    return (
      <ResultsShell
        title="Demande d’accès résultats"
        subtitle="Saisissez votre email. L’administrateur validera ensuite le poste depuis la vue d’administration."
      >
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!requestEmail.trim()) return;
            log.info('submitting result access request from results page', {
              uid: user.uid,
              email: requestEmail.trim().toLowerCase(),
            });
            setSubmitState('sending');
            setActionError('');
            try {
              await submitResultAccessRequest({
                uid: user.uid,
                email: requestEmail,
                providerId: primaryProvider(user),
              });
              log.info('result access request submitted', {
                uid: user.uid,
                email: requestEmail.trim().toLowerCase(),
              });
              setSubmitState('sent');
            } catch (error) {
              log.error('result access request submission failed', error);
              setSubmitState('error');
              setActionError(getErrorLabel(error));
            }
          }}
        >
          <input
            type="email"
            className="form-input"
            placeholder="votre@email.com"
            value={requestEmail}
            onChange={(e) => setRequestEmail(e.target.value)}
            required
            autoFocus
          />
          <button className="btn btn-primary login-btn" type="submit" disabled={submitState === 'sending'}>
            {submitState === 'sending' ? 'Envoi…' : 'Envoyer la demande'}
          </button>
          <button className="btn btn-secondary login-btn" type="button" onClick={onLogout}>
            Se déconnecter
          </button>
          {actionError && <div className="form-error">{actionError}</div>}
        </form>
      </ResultsShell>
    );
  }

  const handleDepossessionConfirm = () => {
    setDepossessionNotice('');
    setSelectedStation('');
    setStationState('idle');
    setHadSelectedStationOwnership(false);
  };

  if (!selectedStation) {
    return (
      <>
        <ResultsShell
          title="Choix du poste"
          titleAside={actor?.email || 'poste anonyme'}
          subtitle="Sélectionnez le poste que vous allez tenir."
        >
          <div className="results-station-grid">
            {canStart && (
              <StationChoiceCard
                station="start"
                doc={stationDocs.start}
                actorUid={actor?.uid}
                onSelect={() => setSelectedStation('start')}
              />
            )}
            {canFinish && (
              <StationChoiceCard
                station="finish"
                doc={stationDocs.finish}
                actorUid={actor?.uid}
                onSelect={() => setSelectedStation('finish')}
              />
            )}
          </div>
          <button className="btn btn-secondary login-btn" onClick={onLogout}>Se déconnecter</button>
          <ClockStatusPanel clockState={clockState} />
        </ResultsShell>
        <ResultsNoticeDialog message={depossessionNotice} onConfirm={handleDepossessionConfirm} />
      </>
    );
  }

  if (stationState === 'claiming') {
    return <ResultsLoadingCard label={`Réservation du poste ${selectedStation === 'start' ? 'départ' : 'arrivée'}…`} />;
  }

  if (stationState === 'error') {
    return (
      <ResultsErrorCard
        title="Poste indisponible"
        message={stationError || 'Ce poste est déjà utilisé sur un autre appareil.'}
        actions={(
          <>
            {(canStart && canFinish) && (
              <button className="btn btn-secondary login-btn" onClick={() => { setSelectedStation(''); setStationState('idle'); }}>
                Changer de poste
              </button>
            )}
            <button className="btn btn-secondary login-btn" onClick={onLogout}>Se déconnecter</button>
          </>
        )}
      />
    );
  }

  if (selectedStation === 'start') {
    return (
      <>
        <StartStationView
          actor={actor}
          stationDoc={stationDocs.start}
          participants={participants}
          resultEvents={resultEvents}
          currentCompetitor={currentCompetitor}
          startBuffer={startBuffer}
          setStartBuffer={setStartBuffer}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          actionError={actionError}
          setActionError={setActionError}
          courseDraft={courseDraft}
          setCourseDraft={setCourseDraft}
          currentCourse={currentCourse}
          setCurrentCourse={setCurrentCourse}
          onReleaseStation={async () => {
            await releaseStation('start', actor.uid);
            setSelectedStation('');
            setStationState('idle');
          }}
          onLogout={onLogout}
          showUnavailableNotice={!depossessionNotice}
        />
        <ResultsNoticeDialog message={depossessionNotice} onConfirm={handleDepossessionConfirm} />
      </>
    );
  }

  return (
    <>
      <FinishStationView
        actor={actor}
        stationDoc={stationDocs.finish}
        currentCompetitor={currentCompetitor}
        busyAction={busyAction}
        setBusyAction={setBusyAction}
        actionError={actionError}
        setActionError={setActionError}
        onReleaseStation={async () => {
          await releaseStation('finish', actor.uid);
          setSelectedStation('');
          setStationState('idle');
        }}
        onLogout={onLogout}
        showUnavailableNotice={!depossessionNotice}
      />
      <ResultsNoticeDialog message={depossessionNotice} onConfirm={handleDepossessionConfirm} />
    </>
  );
}

function StartStationView({
  actor,
  stationDoc,
  participants,
  resultEvents,
  currentCompetitor,
  startBuffer,
  setStartBuffer,
  busyAction,
  setBusyAction,
  actionError,
  setActionError,
  courseDraft,
  setCourseDraft,
  currentCourse,
  setCurrentCourse,
  onReleaseStation,
  onLogout,
  showUnavailableNotice,
}) {
  const ownsStation = stationDoc?.assignedUid === actor.uid;
  const ownsCurrent = currentCompetitor?.selectedByUid === actor.uid;
  const isArmed = ownsCurrent && currentCompetitor?.status === 'armed';
  const isRunning = currentCompetitor?.status === 'running';
  const hasBufferedStart = startBuffer.length > 0;
  const canChangeCourse = !currentCompetitor && ownsStation;
  const [emailPopoverOpen, setEmailPopoverOpen] = useState(false);
  const currentCourseSummary = useMemo(
    () => (currentCourse ? deriveFinishedCourses(resultEvents).find((course) => course.courseId === currentCourse.courseId) : null),
    [currentCourse, resultEvents],
  );
  const participantCounts = useMemo(
    () => (currentCourseSummary?.runs ?? []).reduce((acc, run) => {
      acc[run.participantId] = (acc[run.participantId] || 0) + 1;
      return acc;
    }, {}),
    [currentCourseSummary],
  );
  const participantAbandonCounts = useMemo(
    () => (currentCourseSummary?.abandonSummary ?? []).reduce((acc, entry) => {
      if (!entry.participantId) return acc;
      acc[entry.participantId] = entry.count;
      return acc;
    }, {}),
    [currentCourseSummary],
  );
  const recentCourses = useMemo(() => {
    const byCourse = new Map();

    if (currentCourse?.courseId) {
      byCourse.set(currentCourse.courseId, {
        courseId: currentCourse.courseId,
        courseLabel: currentCourse.courseLabel || currentCourse.courseId,
        lastActivityMs: Number.MAX_SAFE_INTEGER,
      });
    }

    resultEvents.forEach((event) => {
      if (!event.active || !event.courseId) return;
      const lastActivityMs = event.clickedAtClientMs ?? 0;
      const existing = byCourse.get(event.courseId);
      if (!existing || lastActivityMs > existing.lastActivityMs) {
        byCourse.set(event.courseId, {
          courseId: event.courseId,
          courseLabel: event.courseLabel || event.courseId,
          lastActivityMs,
        });
      }
    });

    return [...byCourse.values()]
      .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
      .slice(0, 12);
  }, [currentCourse, resultEvents]);

  const appendStartClick = async () => {
    if (!currentCompetitor?.runId) return;
    const next = [...startBuffer, createClickEntry()];
    log.info('local start click buffered', {
      runId: currentCompetitor.runId,
      bufferSize: next.length,
      lastClick: next[next.length - 1],
    });
    setStartBuffer(next);
    saveStartBuffer(currentCompetitor.runId, next);
    try {
      await mirrorPendingStartClicks({ currentCompetitor, clicks: next, actor });
    } catch (error) {
      log.error('mirror pending start clicks failed', error);
      setActionError(getErrorLabel(error));
    }
  };

  if (!currentCourse && !currentCompetitor) {
    return (
      <ResultsShell
        title="Poste départ"
        titleAside={actor?.email || 'poste anonyme'}
        subtitle="Nommer la course avant de sélectionner un participant."
      >
        <StationToolbar onReleaseStation={onReleaseStation} onLogout={onLogout} />
        {actionError && <div className="form-error">{actionError}</div>}
        <div className="results-course-setup-card">
          <label className="form-label" htmlFor="course-name">Nom de la course</label>
          <input
            id="course-name"
            className="form-input"
            placeholder="Ex : Course 1"
            value={courseDraft}
            onChange={(e) => setCourseDraft(e.target.value)}
            autoFocus
          />
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={!courseDraft.trim() || busyAction === 'course'}
              onClick={async () => {
                const label = courseDraft.trim();
                const nextCourse = {
                  courseId: createCourseId(label),
                  courseLabel: label,
                };
                setBusyAction('course');
                setActionError('');
                try {
                  await setStartStationCourse({
                    uid: actor.uid,
                    courseId: nextCourse.courseId,
                    courseLabel: nextCourse.courseLabel,
                  });
                  setCurrentCourse(nextCourse);
                } catch (error) {
                  log.error('setting start station course failed', error);
                  setActionError(getErrorLabel(error));
                } finally {
                  setBusyAction('');
                }
              }}
            >
              {busyAction === 'course' ? 'Validation…' : 'Valider la course'}
            </button>
          </div>
          {recentCourses.length > 0 && (
            <div className="results-course-history">
              <div className="results-course-history-title">Courses disponibles</div>
              <div className="results-course-history-list">
                {recentCourses.map((course) => (
                  <button
                    key={course.courseId}
                    type="button"
                    className="results-course-history-item"
                    disabled={busyAction === 'course'}
                    onClick={async () => {
                      setBusyAction('course');
                      setActionError('');
                      try {
                        await setStartStationCourse({
                          uid: actor.uid,
                          courseId: course.courseId,
                          courseLabel: course.courseLabel,
                        });
                        setCurrentCourse({
                          courseId: course.courseId,
                          courseLabel: course.courseLabel,
                        });
                        setCourseDraft(course.courseLabel);
                      } catch (error) {
                        log.error('selecting existing course failed', error);
                        setActionError(getErrorLabel(error));
                      } finally {
                        setBusyAction('');
                      }
                    }}
                  >
                    <span>{course.courseLabel}</span>
                    {course.lastActivityMs === Number.MAX_SAFE_INTEGER && (
                      <span className="results-course-history-badge">En cours</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ResultsShell>
    );
  }

  return (
    <ResultsShell noHeader>
      <StartStationHeader
        email={actor.email || 'poste anonyme'}
        courseLabel={currentCourse?.courseLabel || currentCompetitor?.courseLabel || '—'}
        emailPopoverOpen={emailPopoverOpen}
        onToggleEmail={() => setEmailPopoverOpen((value) => !value)}
        onReleaseStation={onReleaseStation}
        onChangeCourse={() => {
          if (!canChangeCourse) return;
          setBusyAction('change-course');
          setActionError('');
          setStartStationCourse({
            uid: actor.uid,
            courseId: null,
            courseLabel: '',
          })
            .then(() => {
              setCurrentCourse(null);
              setCourseDraft('');
            })
            .catch((error) => {
              log.error('clearing start station course failed', error);
              setActionError(getErrorLabel(error));
            })
            .finally(() => {
              setBusyAction('');
            });
        }}
        onLogout={onLogout}
        canChangeCourse={canChangeCourse && busyAction !== 'change-course'}
      />

      {actionError && <div className="form-error">{actionError}</div>}

      {!ownsStation && showUnavailableNotice && (
        <div className="results-status-card">
          <div className="results-big-name">Poste non disponible</div>
          <p className="login-subtitle">Ce poste départ n’est plus affecté à votre session. Les actions sont bloquées tant que vous ne reprenez pas le poste.</p>
        </div>
      )}

      {!currentCompetitor && ownsStation && (
        <div className="results-participant-list">
          {participants.length === 0 && <div className="stream-empty">Aucun participant disponible.</div>}
          {participants.map((participant) => (
            <button
              key={participant.id}
              className={`results-participant-button${participantCounts[participant.id] ? ' results-participant-button--done' : ''}`}
              disabled={busyAction !== '' || !currentCourse || !ownsStation}
              onClick={async () => {
                log.info('arming competitor from start station', {
                  participantId: participant.id,
                  participantLabel: participant.label,
                  actorUid: actor.uid,
                  course: currentCourse,
                });
                setBusyAction(`arm:${participant.id}`);
                setActionError('');
                try {
                  const seed = createClickEntry();
                  const runId = seed.clickId;
                  const startId = seed.clickId;
                  await armCurrentCompetitor({
                    participant,
                    actor,
                    runId,
                    startId,
                    courseId: currentCourse.courseId,
                    courseLabel: currentCourse.courseLabel,
                    selectedAtClientMs: Date.now(),
                  });
                  clearStartBuffer(runId);
                  setStartBuffer([]);
                } catch (error) {
                  log.error('arming competitor failed', error);
                  setActionError(getErrorLabel(error));
                } finally {
                  setBusyAction('');
                }
              }}
            >
              <span>{busyAction === `arm:${participant.id}` ? 'Préparation…' : participant.label}</span>
              <span className="results-participant-pills">
                {participantCounts[participant.id] ? (
                  <span className="results-participant-pill">{participantCounts[participant.id]}</span>
                ) : null}
                {participantAbandonCounts[participant.id] ? (
                  <span className="results-participant-pill results-participant-pill--danger">
                    {participantAbandonCounts[participant.id]}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {currentCompetitor && !ownsCurrent && (
        <div className="results-status-card">
          <div className="results-big-name">{currentCompetitor.participantLabel}</div>
          <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
          <p className="login-subtitle">Une course est déjà en préparation ou en cours sur ce poste.</p>
        </div>
      )}

      {isArmed && ownsStation && (
        <div className="results-action-card">
          <div className="results-big-name">{currentCompetitor.participantLabel}</div>
          <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
          <div className="results-status-line">Start ID: <span className="admin-uid">{currentCompetitor.startId}</span></div>
          <div className="results-status-line">Départs en mémoire: {startBuffer.length}</div>
          <div className="results-action-grid">
            {hasBufferedStart && (
              <button
                className="btn btn-secondary results-big-button"
                disabled={busyAction === 'sync'}
                onClick={async () => {
                  log.info('syncing local start buffer', {
                    runId: currentCompetitor.runId,
                    clickCount: startBuffer.length,
                    actorUid: actor.uid,
                  });
                  setBusyAction('sync');
                  setActionError('');
                  try {
                    await syncStartBuffer({ currentCompetitor, clicks: startBuffer, actor });
                    clearStartBuffer(currentCompetitor.runId);
                    setStartBuffer([]);
                  } catch (error) {
                    log.error('sync start buffer failed', error);
                    setActionError(getErrorLabel(error));
                  } finally {
                    setBusyAction('');
                  }
                }}
              >
                {busyAction === 'sync' ? 'Synchronisation…' : 'Suivant'}
              </button>
            )}
            {!hasBufferedStart && (
              <button className="btn btn-primary results-big-button" onClick={appendStartClick}>
                Départ
              </button>
            )}
            <button
              className="btn btn-danger results-big-button"
              disabled={busyAction === 'cancel'}
              onClick={async () => {
                log.info('cancelling current competitor from start station', {
                  runId: currentCompetitor.runId,
                  actorUid: actor.uid,
                });
                setBusyAction('cancel');
                setActionError('');
                try {
                  await cancelCurrentCompetitor(currentCompetitor.runId, actor.uid);
                  clearStartBuffer(currentCompetitor.runId);
                  setStartBuffer([]);
                } catch (error) {
                  log.error('cancel current competitor failed', error);
                  setActionError(getErrorLabel(error));
                } finally {
                  setBusyAction('');
                }
              }}
            >
              {busyAction === 'cancel' ? 'Annulation…' : 'Annuler'}
            </button>
          </div>
        </div>
      )}

      {isRunning && (
        <div className="results-status-card">
          <div className="results-big-name">{currentCompetitor.participantLabel}</div>
          <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
          <p className="login-subtitle">
            {ownsStation
              ? 'Course en cours. En attente de l’arrivée.'
              : 'Course en cours, mais ce poste n’est plus affecté à votre session.'}
          </p>
        </div>
      )}
    </ResultsShell>
  );
}

function StartStationHeader({
  email,
  courseLabel,
  emailPopoverOpen,
  onToggleEmail,
  onReleaseStation,
  onChangeCourse,
  onLogout,
  canChangeCourse,
}) {
  return (
    <div className="results-station-header">
      <div className="results-station-header-main">
        <div className="results-station-header-title">Poste départ</div>
        <button className="results-email-chip" onClick={onToggleEmail} type="button">
          <span className="results-email-chip-text">{email}</span>
        </button>
        {emailPopoverOpen && (
          <div className="results-email-popover" onClick={onToggleEmail}>
            {email}
          </div>
        )}
      </div>
      <div className="results-station-course">{courseLabel}</div>
      <div className="results-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={onReleaseStation}>
          Libérer poste
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onChangeCourse} disabled={!canChangeCourse}>
          Changer de course
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onLogout}>
          Déconnexion
        </button>
      </div>
    </div>
  );
}

function FinishStationView({
  actor,
  stationDoc,
  currentCompetitor,
  busyAction,
  setBusyAction,
  actionError,
  setActionError,
  onReleaseStation,
  onLogout,
  showUnavailableNotice,
}) {
  const ownsStation = stationDoc?.assignedUid === actor.uid;
  const startClickCount = Array.isArray(currentCompetitor?.pendingStartClicks)
    ? currentCompetitor.pendingStartClicks.length
    : 0;
  const canFinishCurrent = startClickCount > 0 || Number.isFinite(currentCompetitor?.latestStartAtClientMs);

  return (
    <ResultsShell noHeader>
      <InlineStationHeader title="Poste arrivée" email={actor.email || 'poste anonyme'} />
      <StationToolbar onReleaseStation={onReleaseStation} onLogout={onLogout} />
      {actionError && <div className="form-error">{actionError}</div>}

      {!ownsStation && showUnavailableNotice && (
        <div className="results-status-card">
          <div className="results-big-name">Poste non disponible</div>
          <p className="login-subtitle">Ce poste arrivée n’est plus affecté à votre session. Les actions sont bloquées tant que vous ne reprenez pas le poste.</p>
        </div>
      )}

      {!currentCompetitor && (
        <div className="results-status-card">
          <div className="results-big-name">En attente</div>
          <p className="login-subtitle">Aucun concurrent n’a encore été lancé depuis le départ.</p>
        </div>
      )}

      {currentCompetitor && ownsStation && (
        <div className="results-action-card">
          <div className="results-big-name">{currentCompetitor.participantLabel}</div>
          <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
          <div className="results-status-line">Start ID: <span className="admin-uid">{currentCompetitor.startId}</span></div>
          {!canFinishCurrent && (
            <p className="login-subtitle">En attente du clic départ avant d’autoriser l’arrivée.</p>
          )}
          {canFinishCurrent && (
            <>
              <p className="login-subtitle">Appuyez dès que le concurrent franchit l’arrivée.</p>
              <div className="results-action-grid">
                <button
                  className="btn btn-primary results-big-button results-big-button--success"
                  disabled={busyAction === 'finish' || busyAction === 'abandon'}
                  onClick={async () => {
                    log.info('finish click triggered', {
                      runId: currentCompetitor?.runId,
                      actorUid: actor.uid,
                    });
                    setBusyAction('finish');
                    setActionError('');
                    try {
                      await completeCurrentCompetitor({
                        actor,
                        click: createClickEntry(),
                      });
                    } catch (error) {
                      log.error('finish click failed', error);
                      setActionError(getErrorLabel(error));
                    } finally {
                      setBusyAction('');
                    }
                  }}
                >
                  {busyAction === 'finish' ? 'Envoi…' : 'Arrivé'}
                </button>
                <button
                  className="btn btn-danger results-big-button"
                  disabled={busyAction === 'finish' || busyAction === 'abandon'}
                  onClick={async () => {
                    log.info('abandon click triggered', {
                      runId: currentCompetitor?.runId,
                      actorUid: actor.uid,
                    });
                    setBusyAction('abandon');
                    setActionError('');
                    try {
                      await abandonCurrentCompetitor({
                        actor,
                        click: createClickEntry(),
                      });
                    } catch (error) {
                      log.error('abandon click failed', error);
                      setActionError(getErrorLabel(error));
                    } finally {
                      setBusyAction('');
                    }
                  }}
                >
                  {busyAction === 'abandon' ? 'Envoi…' : 'Abandonné'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {currentCompetitor && !ownsStation && (
        <div className="results-status-card">
          <div className="results-big-name">{currentCompetitor.participantLabel}</div>
          <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
          <p className="login-subtitle">Le concurrent est en attente d’arrivée, mais ce poste n’est plus affecté à votre session.</p>
        </div>
      )}
    </ResultsShell>
  );
}

function InlineStationHeader({ title, email }) {
  const [emailPopoverOpen, setEmailPopoverOpen] = useState(false);

  return (
    <div className="results-inline-header">
      <div className="results-inline-header-title">{title}</div>
      <button className="results-email-chip" onClick={() => setEmailPopoverOpen((value) => !value)} type="button">
        <span className="results-email-chip-text">({email})</span>
      </button>
      {emailPopoverOpen && (
        <div className="results-email-popover" onClick={() => setEmailPopoverOpen(false)}>
          {email}
        </div>
      )}
    </div>
  );
}

function StationChoiceCard({ station, doc, actorUid, onSelect }) {
  const busy = doc?.assignedUid && doc.assignedUid !== actorUid;
  const label = station === 'start' ? 'Départ' : 'Arrivée';

  return (
    <button className="results-station-card" disabled={busy} onClick={onSelect}>
      <div className="results-station-title">{label}</div>
      <div className="results-station-subtitle">
        {busy ? `Occupé par ${doc.assignedEmail || doc.assignedUid}` : 'Disponible'}
      </div>
    </button>
  );
}

function StationToolbar({ onReleaseStation, onLogout }) {
  return (
    <div className="results-toolbar">
      <button className="btn btn-secondary btn-sm" onClick={onReleaseStation}>
        Libérer le poste
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onLogout}>
        Déconnexion
      </button>
    </div>
  );
}

function ResultsShell({ title, titleAside, subtitle, children, noHeader = false }) {
  return (
    <div className="results-shell">
      <div className="results-shell-card">
        {!noHeader && (
          <div className="results-shell-head">
            <div className="results-shell-title-row">
              <h1 className="results-shell-title">{title}</h1>
              {titleAside && (
                <div className="results-shell-title-aside">
                  <span className="results-shell-title-aside-text">({titleAside})</span>
                </div>
              )}
            </div>
            {subtitle && <p className="results-shell-subtitle">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function ResultsNoticeDialog({ message, onConfirm }) {
  if (!message) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-title">Poste retiré</div>
        <div className="dialog-desc">{message}</div>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onConfirm}>
            J’ai compris
          </button>
        </div>
      </div>
    </div>
  );
}

function ClockStatusPanel({ clockState }) {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const trustedNow = Number.isFinite(clockState.serverNow) && Number.isFinite(clockState.measuredAtClientMs)
    ? clockState.serverNow + (nowMs - clockState.measuredAtClientMs)
    : null;

  return (
    <div className="results-clock-panel">
      <div className="results-clock-grid">
        <div className="results-clock-card">
          <div className="results-clock-label">Heure du poste</div>
          <div className="results-clock-value">{formatClockTime(nowMs)}</div>
        </div>
        <div className="results-clock-card">
          <div className="results-clock-label">Heure de référence</div>
          <div className="results-clock-value">{trustedNow ? formatClockTime(trustedNow) : 'Indisponible'}</div>
        </div>
        <div
          className={`results-clock-card${
            Math.abs(clockState.driftMs) > 10000
              ? ' results-clock-card--danger'
              : Math.abs(clockState.driftMs) > 1000
                ? ' results-clock-card--warn'
                : ''
          }`}
        >
          <div className="results-clock-label">Décalage constaté</div>
          <div className="results-clock-value">
            {formatDrift(clockState.driftMs)}
          </div>
        </div>
      </div>
      {clockState.status === 'invalid' && (
        <div className="form-error">L’horloge du poste dérive de plus d’une seconde par rapport à la référence.</div>
      )}
      {clockState.status === 'unavailable' && (
        <div className="results-clock-note">
          Source de temps indisponible. {clockState.error || 'Le décalage n’a pas pu être vérifié.'}
        </div>
      )}
    </div>
  );
}

function ResultsLoadingCard({ label }) {
  return (
    <ResultsShell title="Résultats" subtitle={label}>
      <div className="results-loading-block">
        <div className="login-spinner" />
      </div>
    </ResultsShell>
  );
}

function ResultsErrorCard({ title, message, onLogout, actions }) {
  return (
    <ResultsShell title={title} subtitle={message}>
      <div className="results-status-card">
        {actions || <button className="btn btn-secondary login-btn" onClick={onLogout}>Se déconnecter</button>}
      </div>
    </ResultsShell>
  );
}

function primaryProvider(user) {
  return user?.providerData?.[0]?.providerId || 'anonymous';
}

function statusLabel(status) {
  if (status === 'approved') return 'Approuvée';
  if (status === 'rejected') return 'Refusée';
  return 'En attente';
}

function getErrorLabel(error) {
  if (error?.message === 'station-occupied') return 'Ce poste est déjà utilisé sur un autre appareil.';
  if (error?.message === 'station-not-owned') return 'Ce poste n’est plus affecté à votre session.';
  if (error?.message === 'station-not-claimed') return 'Ce poste n’est plus réservé.';
  if (error?.message === 'current-competitor-busy') return 'Un concurrent est déjà en cours.';
  if (error?.message === 'no-current-competitor') return 'Aucun concurrent en cours.';
  if (error?.message === 'clock-check-failed') return 'La source de temps n’a pas répondu.';
  return error?.code ? `Erreur : ${error.code}` : error?.message || 'Une erreur est survenue.';
}

function formatClockTime(ms) {
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDrift(driftMs) {
  const sign = driftMs > 0 ? '+' : driftMs < 0 ? '-' : '';
  return `${sign}${Math.abs(Math.round(driftMs))} ms`;
}

function slugifyCourse(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'course';
}

function createCourseId(label) {
  return `${slugifyCourse(label)}-${Date.now().toString(36)}`;
}
