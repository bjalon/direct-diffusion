import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import AnonymousAccountList from '../components/AnonymousAccountList';
import { useEventContext } from '../context/EventContext';
import { auth, ensureFirestoreOnline } from '../firebase';
import { subscribeParticipants } from '../firebase/participants';
import {
  abandonCurrentCompetitor,
  armCurrentCompetitor,
  cancelCurrentCompetitor,
  claimStation,
  completeCurrentCompetitor,
  mirrorPendingStartClicks,
  readCurrentStationAssignment,
  releaseStation,
  setStartStationCourse,
  submitResultAccessRequest,
  subscribeCurrentStationAssignment,
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
import { forgetAnonymousAccount, listAnonymousAccounts, restoreAnonymousAccount } from '../utils/anonymousAccounts';
import { deriveFinishedCourses, deriveGeneralRanking, deriveRunsFromEvents } from '../utils/resultsDerivation';
import { buildEventRoute } from '../utils/routes';

const log = createLogger('ResultsPage');
const RESUME_EVENT_DEBOUNCE_MS = 750;

export default function ResultsPage({ user, onLogout }) {
  const { event } = useEventContext();
  const navigate = useNavigate();
  useResultsResumeLifecycle();
  const [signInState, setSignInState] = useState('idle');
  const [knownAccounts, setKnownAccounts] = useState(() => listAnonymousAccounts(auth, event.id));
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
  const [selectedStationAssignment, setSelectedStationAssignment] = useState(null);
  const [pendingStationSelection, setPendingStationSelection] = useState('');
  const [stationState, setStationState] = useState('idle');
  const [stationRecoveryState, setStationRecoveryState] = useState('idle');
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
  const [expectedStationRelease, setExpectedStationRelease] = useState('');
  const [resultsBrowserView, setResultsBrowserView] = useState('station');
  const [resultsBrowserCourseId, setResultsBrowserCourseId] = useState('');

  useEffect(() => {
    if (user !== false) return;
    setKnownAccounts(listAnonymousAccounts(auth, event.id));
  }, [event.id, user?.uid, user === false]);

  const clearSelectedStationState = (nextStationError = '') => {
    setSelectedStation('');
    setSelectedStationAssignment(null);
    setPendingStationSelection('');
    setStationState('idle');
    setHadSelectedStationOwnership(false);
    setResultsBrowserView('station');
    setResultsBrowserCourseId('');
    if (nextStationError) {
      setStationError(nextStationError);
    }
  };

  const resolveStationActionError = async (error, station) => {
    if (error?.message !== 'station-not-owned' && error?.message !== 'station-not-claimed') {
      setActionError(getErrorLabel(error));
      return false;
    }

    try {
      const assignment = await readCurrentStationAssignment(event.id, station);
      if (!assignment || assignment.assignedUid !== actor?.uid) {
        log.info('redirecting to station choice after station loss', {
          station,
          actorUid: actor?.uid,
          assignment,
          reason: error?.message,
        });
        setActionError('');
        setDepossessionNotice('');
        clearSelectedStationState(`Le poste ${stationLabel(station)} n’est plus réservé pour votre session.`);
        return true;
      }
    } catch (readError) {
      log.warn('failed to verify current station after action error', {
        station,
        actorUid: actor?.uid,
        error: readError,
      });
    }

    setActionError(getErrorLabel(error));
    return false;
  };

  useEffect(() => {
    if (user !== false || signInState === 'signing-in') return;
    if (knownAccounts.length > 0) return;
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
  }, [user, signInState, knownAccounts.length]);

  const handleResultsAnonymousSignIn = async () => {
    log.info('starting anonymous sign-in for results page from chooser');
    setSignInState('signing-in');
    setActionError('');
    try {
      const credential = await signInAnonymously(auth);
      log.info('anonymous sign-in succeeded', {
        uid: credential.user.uid,
        isAnonymous: credential.user.isAnonymous,
      });
      setSignInState('done');
    } catch (error) {
      log.error('anonymous sign-in failed', error);
      setSignInState('error');
      setActionError(getErrorLabel(error));
    }
  };

  const handleRestoreAnonymousSignIn = async (uid) => {
    if (!uid) return;
    log.info('restoring anonymous results account', { uid });
    setSignInState('signing-in');
    setActionError('');
    try {
      await restoreAnonymousAccount(auth, event.id, uid);
      log.info('anonymous results account restored', { uid });
      setSignInState('done');
    } catch (error) {
      log.error('anonymous results account restore failed', { uid, error });
      setKnownAccounts(listAnonymousAccounts(auth, event.id));
      setSignInState('error');
      setActionError('Impossible de reprendre ce compte léger local.');
    }
  };

  const handleDeleteAnonymousSignIn = (uid) => {
    forgetAnonymousAccount(auth, event.id, uid);
    setKnownAccounts(listAnonymousAccounts(auth, event.id));
  };

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
    verifyBrowserClock(event.id, user.uid)
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
  }, [event.id, user?.uid]);

  useEffect(() => {
    if (!user || user === false) return;
    return subscribeResultAccess(event.id, user.uid, setResultAccess);
  }, [event.id, user?.uid]);

  useEffect(() => {
    if (!user || user === false) return;
    return subscribeResultAccessRequest(event.id, user.uid, (request) => {
      setResultRequest(request);
      if (request?.email) setRequestEmail(request.email);
    });
  }, [event.id, user?.uid]);

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
      setSelectedStationAssignment(null);
      setPendingStationSelection('');
      setStationState('idle');
      setStationRecoveryState('idle');
      setHadSelectedStationOwnership(false);
      setResultsBrowserView('station');
      setResultsBrowserCourseId('');
    }
  }, [hasResultAccess, resultRequest, resultAccess]);

  useEffect(() => {
    if (!hasResultAccess) return;
    return subscribeCurrentCompetitor(event.id, setCurrentCompetitor);
  }, [event.id, hasResultAccess]);

  useEffect(() => {
    if (!canStart) return;
    return subscribeParticipants(event.id, setParticipants);
  }, [event.id, canStart]);

  useEffect(() => {
    if (!hasResultAccess) return;
    return subscribeResultEvents(event.id, setResultEvents);
  }, [event.id, hasResultAccess]);

  useEffect(() => {
    const unsubs = [];
    if (canStart) {
      unsubs.push(subscribeStation(event.id, 'start', (doc) => setStationDocs((prev) => ({ ...prev, start: doc }))));
    }
    if (canFinish) {
      unsubs.push(subscribeStation(event.id, 'finish', (doc) => setStationDocs((prev) => ({ ...prev, finish: doc }))));
    }
    return () => unsubs.forEach((unsub) => unsub());
  }, [event.id, canStart, canFinish]);

  useEffect(() => {
    if (selectedStation || !actor?.uid || !user || user === false || !hasResultAccess) return;

    let cancelled = false;
    setStationRecoveryState('checking');

    (async () => {
      try {
        const [startAssignment, finishAssignment] = await Promise.all([
          readCurrentStationAssignment(event.id, 'start'),
          readCurrentStationAssignment(event.id, 'finish'),
        ]);
        if (cancelled) return;

        const ownedStation = startAssignment?.assignedUid === actor.uid
          ? { station: 'start', assignment: startAssignment }
          : finishAssignment?.assignedUid === actor.uid
            ? { station: 'finish', assignment: finishAssignment }
            : null;

        if (!ownedStation) {
          setSelectedStationAssignment(null);
          setPendingStationSelection('');
          setStationState('idle');
          setStationRecoveryState('ready');
          return;
        }

        const stillAllowed = ownedStation.station === 'start' ? canStart : canFinish;
        if (!stillAllowed) {
          log.warn('releasing stale station assignment after permission loss', {
            station: ownedStation.station,
            actorUid: actor.uid,
          });
          try {
            await releaseStation(event.id, ownedStation.station, actor.uid);
          } catch (error) {
            log.warn('failed to release stale station assignment', {
              station: ownedStation.station,
              actorUid: actor.uid,
              error,
            });
          }
          if (cancelled) return;

          setDepossessionNotice(`Votre accès au poste ${stationLabel(ownedStation.station)} a été retiré. Vous revenez au choix du poste.`);
          setSelectedStation('');
          setSelectedStationAssignment(null);
          setPendingStationSelection('');
          setStationState('idle');
          setHadSelectedStationOwnership(false);
          setStationRecoveryState('ready');
          return;
        }

        log.info('restoring previously owned station on results page', {
          station: ownedStation.station,
          actorUid: actor.uid,
        });
        setStationError('');
        setPendingStationSelection(ownedStation.station);
        setSelectedStation(ownedStation.station);
        setSelectedStationAssignment(ownedStation.assignment);
        setStationState('claimed');
        setStationRecoveryState('ready');
      } catch (error) {
        if (cancelled) return;
        log.error('station restore failed', error);
        setStationState('idle');
        setStationError(getErrorLabel(error));
        setStationRecoveryState('ready');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedStation,
    actor?.uid,
    hasResultAccess,
    canStart,
    canFinish,
    user,
  ]);

  useEffect(() => {
    if (!selectedStation) {
      setSelectedStationAssignment(null);
      return;
    }

    return subscribeCurrentStationAssignment(
      event.id,
      selectedStation,
      (doc) => {
        setSelectedStationAssignment(doc);
      },
      (error) => {
        if (expectedStationRelease === selectedStation) return;
        if (error?.code === 'permission-denied') {
          setDepossessionNotice(`L’administrateur vous a retiré le poste ${stationLabel(selectedStation)}. Vous revenez au choix du poste.`);
          setSelectedStation('');
          setSelectedStationAssignment(null);
          setPendingStationSelection('');
          setStationState('idle');
          setHadSelectedStationOwnership(false);
          return;
        }
        setStationError(getErrorLabel(error));
      },
    );
  }, [event.id, selectedStation, expectedStationRelease]);

  useEffect(() => {
    if (!selectedStation || !actor?.uid) return;
    const stillAllowed = selectedStation === 'start' ? canStart : canFinish;
    if (stillAllowed || expectedStationRelease === selectedStation) return;

    let cancelled = false;
    setExpectedStationRelease(selectedStation);

    releaseStation(event.id, selectedStation, actor.uid)
      .catch((error) => {
        log.warn('failed to release station after permission loss', {
          station: selectedStation,
          actorUid: actor.uid,
          error,
        });
      })
      .finally(() => {
        if (cancelled) return;
        setExpectedStationRelease('');
        setDepossessionNotice(`Votre accès au poste ${stationLabel(selectedStation)} a été retiré. Vous revenez au choix du poste.`);
        setSelectedStation('');
        setSelectedStationAssignment(null);
        setPendingStationSelection('');
        setStationState('idle');
        setHadSelectedStationOwnership(false);
      });

    return () => {
      cancelled = true;
    };
  }, [event.id, selectedStation, actor?.uid, canStart, canFinish, expectedStationRelease]);

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

  useEffect(() => {
    if (!selectedStation || !actor?.uid) return;
    if (selectedStationAssignment?.assignedUid === actor.uid) {
      setHadSelectedStationOwnership(true);
    }
  }, [selectedStation, selectedStationAssignment?.assignedUid, actor?.uid]);

  useEffect(() => {
    if (!selectedStation || !actor?.uid || !hadSelectedStationOwnership || expectedStationRelease === selectedStation) return;
    if (!selectedStationAssignment) {
      setDepossessionNotice(`L’administrateur vous a retiré le poste ${stationLabel(selectedStation)}. Vous revenez au choix du poste.`);
      setSelectedStation('');
      setPendingStationSelection('');
      setStationState('idle');
      setHadSelectedStationOwnership(false);
      return;
    }

    if (selectedStationAssignment.assignedUid !== actor.uid) {
      setDepossessionNotice(`L’administrateur vous a retiré le poste ${stationLabel(selectedStation)}. Vous revenez au choix du poste.`);
      setSelectedStation('');
      setSelectedStationAssignment(null);
      setPendingStationSelection('');
      setStationState('idle');
      setHadSelectedStationOwnership(false);
    }
  }, [
    selectedStation,
    selectedStationAssignment,
    actor?.uid,
    hadSelectedStationOwnership,
    expectedStationRelease,
  ]);

  useEffect(() => {
    setHadSelectedStationOwnership(false);
  }, [selectedStation]);

  useEffect(() => {
    if (selectedStation) return;
    setResultsBrowserView('station');
    setResultsBrowserCourseId('');
  }, [selectedStation]);

  useEffect(() => {
    if (selectedStation !== 'finish' || resultsBrowserView === 'station') return;
    if (!Number.isFinite(currentCompetitor?.latestStartAtClientMs)) return;

    log.info('returning finish station from results browser after start click', {
      browserView: resultsBrowserView,
      runId: currentCompetitor?.runId,
      startId: currentCompetitor?.startId,
    });
    setResultsBrowserView('station');
  }, [
    selectedStation,
    resultsBrowserView,
    currentCompetitor?.latestStartAtClientMs,
    currentCompetitor?.runId,
    currentCompetitor?.startId,
  ]);

  const handleClaimStation = async (station) => {
    if (!actor || !hasResultAccess) return;
    log.info('claiming station from results page', { station, actor });
    setPendingStationSelection(station);
    setStationState('claiming');
    setStationError('');
    try {
      await claimStation(event.id, station, actor);
      log.info('station claimed', { station, actorUid: actor.uid });
      setSelectedStation(station);
      setSelectedStationAssignment({
        station,
        assignedUid: actor.uid,
        assignedEmail: actor.email ?? '',
        assignedProviderId: actor.providerId ?? 'anonymous',
      });
      setStationState('claimed');
    } catch (error) {
      log.error('station claim failed', { station, error });
      setStationState('idle');
      setStationError(getErrorLabel(error));
    }
  };

  const handleReleaseSelectedStation = async () => {
    if (!selectedStation || !actor?.uid) return;
    setExpectedStationRelease(selectedStation);
    setActionError('');
    try {
      await releaseStation(event.id, selectedStation, actor.uid);
      clearSelectedStationState();
    } catch (error) {
      log.error('station release failed', { station: selectedStation, actorUid: actor.uid, error });
      await resolveStationActionError(error, selectedStation);
    } finally {
      setExpectedStationRelease('');
    }
  };

  const handleResultsLogout = async () => {
    if (!selectedStation || !actor?.uid) {
      onLogout();
      return;
    }

    setExpectedStationRelease(selectedStation);
    try {
      await releaseStation(event.id, selectedStation, actor.uid);
    } catch (error) {
      log.warn('station release failed during logout', {
        station: selectedStation,
        actorUid: actor.uid,
        error,
      });
    } finally {
      setExpectedStationRelease('');
      onLogout();
    }
  };

  if (user === false && signInState !== 'signing-in' && knownAccounts.length > 0) {
    return (
      <ResultsShell
        title="Connexion résultats"
        subtitle="Reprenez un compte léger déjà utilisé ou créez un nouveau compte pour ce poste."
      >
        <div className="login-form">
          <AnonymousAccountList
            accounts={knownAccounts}
            onSelect={handleRestoreAnonymousSignIn}
            onDelete={handleDeleteAnonymousSignIn}
          />
          <button className="btn btn-secondary login-btn" type="button" onClick={handleResultsAnonymousSignIn}>
            Utiliser un nouveau compte léger
          </button>
          {actionError && <div className="form-error">{actionError}</div>}
        </div>
      </ResultsShell>
    );
  }

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
          onLogout={handleResultsLogout}
          actions={(
            <>
              <button className="btn btn-primary login-btn" onClick={() => navigate(buildEventRoute(event.slug, 'display'))}>
                Aller sur Affichage
              </button>
              <button className="btn btn-secondary login-btn" onClick={handleResultsLogout}>
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
            <button className="btn btn-secondary login-btn" onClick={handleResultsLogout}>Se déconnecter</button>
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
              await submitResultAccessRequest(event.id, {
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
          <button className="btn btn-secondary login-btn" type="button" onClick={handleResultsLogout}>
            Se déconnecter
          </button>
          {actionError && <div className="form-error">{actionError}</div>}
        </form>
      </ResultsShell>
    );
  }

  const handleDepossessionConfirm = () => {
    setDepossessionNotice('');
    clearSelectedStationState();
  };

  if (stationRecoveryState === 'checking') {
    return <ResultsLoadingCard label="Restauration du poste résultats…" />;
  }

  if (stationState === 'claiming') {
    return <ResultsLoadingCard label={`Réservation du poste ${stationLabel(pendingStationSelection)}…`} />;
  }

  if (!selectedStation) {
    return (
      <>
        <ResultsShell
          title="Choix du poste"
          titleAside={actor?.email || 'poste anonyme'}
          subtitle="Sélectionnez le poste que vous allez tenir."
          variant="chooser"
        >
          {stationError && <div className="form-error">{stationError}</div>}
          <div className="results-station-grid">
            {canStart && (
              <StationChoiceCard
                station="start"
                disabled={stationState === 'claiming'}
                onSelect={() => handleClaimStation('start')}
              />
            )}
            {canFinish && (
              <StationChoiceCard
                station="finish"
                disabled={stationState === 'claiming'}
                onSelect={() => handleClaimStation('finish')}
              />
            )}
          </div>
          <button className="btn btn-secondary login-btn" onClick={handleResultsLogout}>Se déconnecter</button>
          <ClockStatusPanel clockState={clockState} />
        </ResultsShell>
        <ResultsNoticeDialog message={depossessionNotice} onConfirm={handleDepossessionConfirm} />
      </>
    );
  }

  if (resultsBrowserView !== 'station') {
    return (
      <>
        <StationResultsBrowser
          actor={actor}
          station={selectedStation}
          resultEvents={resultEvents}
          browserView={resultsBrowserView}
          setBrowserView={setResultsBrowserView}
          selectedCourseId={resultsBrowserCourseId}
          setSelectedCourseId={setResultsBrowserCourseId}
          preferredCourseId={
            currentCompetitor?.courseId
            || currentCourse?.courseId
            || stationDocs.start?.currentCourseId
            || ''
          }
          preferredCourseLabel={
            currentCompetitor?.courseLabel
            || currentCourse?.courseLabel
            || stationDocs.start?.currentCourseLabel
            || ''
          }
        />
        <ResultsNoticeDialog message={depossessionNotice} onConfirm={handleDepossessionConfirm} />
      </>
    );
  }

  if (selectedStation === 'start') {
    return (
      <>
        <StartStationView
          actor={actor}
          ownsStation={selectedStationAssignment?.assignedUid === actor.uid}
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
          onActionError={resolveStationActionError}
          onOpenResultsBrowser={() => setResultsBrowserView('menu')}
          onReleaseStation={handleReleaseSelectedStation}
          onLogout={handleResultsLogout}
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
        ownsStation={selectedStationAssignment?.assignedUid === actor.uid}
        resultEvents={resultEvents}
        currentCompetitor={currentCompetitor}
        busyAction={busyAction}
        setBusyAction={setBusyAction}
        actionError={actionError}
        setActionError={setActionError}
        onActionError={resolveStationActionError}
        onOpenResultsBrowser={() => setResultsBrowserView('menu')}
        onReleaseStation={handleReleaseSelectedStation}
        onLogout={handleResultsLogout}
        showUnavailableNotice={!depossessionNotice}
      />
      <ResultsNoticeDialog message={depossessionNotice} onConfirm={handleDepossessionConfirm} />
    </>
  );
}

function StartStationView({
  actor,
  ownsStation,
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
  onActionError,
  onOpenResultsBrowser,
  onReleaseStation,
  onLogout,
  showUnavailableNotice,
}) {
  const { event } = useEventContext();
  const ownsCurrent = currentCompetitor?.selectedByUid === actor.uid;
  const isArmed = ownsCurrent && currentCompetitor?.status === 'armed';
  const isRunning = currentCompetitor?.status === 'running';
  const hasBufferedStart = startBuffer.length > 0;
  const canChangeCourse = !currentCompetitor && ownsStation;
  const selectableParticipants = useMemo(
    () => participants.filter((participant) => participant.active !== false),
    [participants],
  );
  const finishedCourses = useMemo(() => deriveFinishedCourses(resultEvents), [resultEvents]);
  const currentCourseSummary = useMemo(
    () => (currentCourse ? finishedCourses.find((course) => course.courseId === currentCourse.courseId) : null),
    [currentCourse, finishedCourses],
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
  const sortedSelectableParticipants = useMemo(
    () => [...selectableParticipants].sort((a, b) => {
      const participationDiff = (participantCounts[a.id] || 0) - (participantCounts[b.id] || 0);
      if (participationDiff !== 0) {
        return participationDiff;
      }

      const orderDiff = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
      if (orderDiff !== 0) {
        return orderDiff;
      }

      return (a.label || '').localeCompare(b.label || '');
    }),
    [participantCounts, selectableParticipants],
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
      await mirrorPendingStartClicks(event.id, { currentCompetitor, clicks: next, actor });
    } catch (error) {
      log.error('mirror pending start clicks failed', error);
      await onActionError(error, 'start');
    }
  };

  if (!currentCourse && !currentCompetitor) {
    return (
      <ResultsShell noHeader variant="operator">
        <StationSelectionScreen
          title="Poste départ"
          email={actor?.email || 'poste anonyme'}
          actionError={actionError}
          footerActions={(
            <>
              <button className="btn btn-secondary btn-sm" onClick={onReleaseStation}>
                Libérer poste
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onOpenResultsBrowser}>
                Résultats
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onLogout}>
                Déconnexion
              </button>
            </>
          )}
        >
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
                    await setStartStationCourse(event.id, {
                      uid: actor.uid,
                      courseId: nextCourse.courseId,
                      courseLabel: nextCourse.courseLabel,
                    });
                    setCurrentCourse(nextCourse);
                  } catch (error) {
                    log.error('setting start station course failed', error);
                    onActionError(error, 'start');
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
                          await setStartStationCourse(event.id, {
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
                          onActionError(error, 'start');
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
        </StationSelectionScreen>
      </ResultsShell>
    );
  }

  const handleChangeCourse = () => {
    if (!canChangeCourse) return;
    setBusyAction('change-course');
    setActionError('');
    setStartStationCourse(event.id, {
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
        onActionError(error, 'start');
      })
      .finally(() => {
        setBusyAction('');
      });
  };

  if (!currentCompetitor && ownsStation) {
    return (
      <ResultsShell noHeader variant="operator">
        <StationSelectionScreen
          title="Poste départ"
          courseLabel={currentCourse?.courseLabel || '—'}
          email={actor.email || 'poste anonyme'}
          actionError={actionError}
          footerActions={(
            <>
              <button className="btn btn-secondary btn-sm" onClick={onReleaseStation}>
                Libérer poste
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleChangeCourse} disabled={!canChangeCourse || busyAction === 'change-course'}>
                Changer course
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onOpenResultsBrowser}>
                Résultats
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onLogout}>
                Déconnexion
              </button>
            </>
          )}
        >
          <div className="results-participant-selection-card">
            <div className="results-participant-list results-participant-list--selection">
              {sortedSelectableParticipants.length === 0 && <div className="stream-empty">Aucun participant actif disponible.</div>}
              {sortedSelectableParticipants.map((participant) => (
                <button
                  key={participant.id}
                  className="results-participant-button results-participant-button--compact"
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
                      await armCurrentCompetitor(event.id, {
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
                      await onActionError(error, 'start');
                    } finally {
                      setBusyAction('');
                    }
                  }}
                >
                  <span className="results-participant-button-label">
                    {busyAction === `arm:${participant.id}` ? 'Préparation…' : participant.label}
                  </span>
                  <span className="results-participant-stats">
                    <span className="results-participant-stat results-participant-stat--danger">
                      Ab {participantAbandonCounts[participant.id] || 0}
                    </span>
                    <span className="results-participant-stat">
                      Fin {participantCounts[participant.id] || 0}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </StationSelectionScreen>
      </ResultsShell>
    );
  }

  let actionZone = null;

  if (!ownsStation && showUnavailableNotice) {
    actionZone = (
      <div className="results-status-card results-station-action-card">
        <div className="results-big-name">Poste non disponible</div>
        <p className="login-subtitle">Ce poste départ n’est plus affecté à votre session. Les actions sont bloquées tant que vous ne reprenez pas le poste.</p>
      </div>
    );
  } else if (currentCompetitor && !ownsCurrent) {
    actionZone = (
      <div className="results-status-card results-station-action-card">
        <div className="results-big-name">{currentCompetitor.participantLabel}</div>
        <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
        <p className="login-subtitle">Une course est déjà en préparation ou en cours sur ce poste.</p>
      </div>
    );
  } else if (isArmed && ownsStation) {
    actionZone = (
      <section className="results-action-card results-station-action-card">
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
                  await syncStartBuffer(event.id, { currentCompetitor, clicks: startBuffer, actor });
                  clearStartBuffer(currentCompetitor.runId);
                  setStartBuffer([]);
                } catch (error) {
                  log.error('sync start buffer failed', error);
                  await onActionError(error, 'start');
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
                await cancelCurrentCompetitor(event.id, currentCompetitor.runId, actor.uid);
                clearStartBuffer(currentCompetitor.runId);
                setStartBuffer([]);
              } catch (error) {
                log.error('cancel current competitor failed', error);
                await onActionError(error, 'start');
              } finally {
                setBusyAction('');
              }
            }}
          >
            {busyAction === 'cancel' ? 'Annulation…' : 'Annuler'}
          </button>
        </div>
      </section>
    );
  } else if (isRunning) {
    actionZone = (
      <div className="results-status-card results-station-action-card">
        <div className="results-big-name">{currentCompetitor.participantLabel}</div>
        <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
        <p className="login-subtitle">
          {ownsStation
            ? 'Course en cours. En attente de l’arrivée.'
            : 'Course en cours, mais ce poste n’est plus affecté à votre session.'}
        </p>
      </div>
    );
  }

  return (
    <ResultsShell noHeader variant="operator">
      <StationOperatorScreen
        title="Poste départ"
        courseLabel={currentCourse?.courseLabel || currentCompetitor?.courseLabel || '—'}
        email={actor.email || 'poste anonyme'}
        actionError={actionError}
        actionZone={actionZone}
        footerActions={(
          <>
            <button className="btn btn-secondary btn-sm" onClick={onReleaseStation}>
              Libérer poste
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleChangeCourse} disabled={!canChangeCourse || busyAction === 'change-course'}>
              Changer course
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onOpenResultsBrowser}>
              Résultats
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onLogout}>
              Déconnexion
            </button>
          </>
        )}
      />
    </ResultsShell>
  );
}

function FinishStationView({
  actor,
  ownsStation,
  resultEvents,
  currentCompetitor,
  busyAction,
  setBusyAction,
  actionError,
  setActionError,
  onActionError,
  onOpenResultsBrowser,
  onReleaseStation,
  onLogout,
  showUnavailableNotice,
}) {
  const { event } = useEventContext();
  const finishedCourses = useMemo(() => deriveFinishedCourses(resultEvents), [resultEvents]);
  const recentRuns = useMemo(() => deriveRunsFromEvents(resultEvents).slice(0, 3), [resultEvents]);
  const hasLocalStart = Number.isFinite(currentCompetitor?.latestStartAtClientMs);
  const canFinishCurrent = hasLocalStart;
  const canAbandonCurrent = currentCompetitor?.status === 'running' && hasLocalStart;
  const activeCourse = useMemo(() => {
    if (currentCompetitor?.courseId) {
      return {
        courseId: currentCompetitor.courseId,
        courseLabel: currentCompetitor.courseLabel || currentCompetitor.courseId,
      };
    }
    const latestCourse = finishedCourses[0];
    return latestCourse
      ? {
          courseId: latestCourse.courseId,
          courseLabel: latestCourse.courseLabel || latestCourse.courseId,
        }
      : null;
  }, [currentCompetitor?.courseId, currentCompetitor?.courseLabel, finishedCourses]);

  let actionZone = null;

  if (!ownsStation && showUnavailableNotice) {
    actionZone = (
      <div className="results-status-card results-station-action-card">
        <div className="results-big-name">Poste non disponible</div>
        <p className="login-subtitle">Ce poste arrivée n’est plus affecté à votre session. Les actions sont bloquées tant que vous ne reprenez pas le poste.</p>
      </div>
    );
  } else if (!currentCompetitor) {
    actionZone = (
      <div className="results-status-card results-station-action-card">
        <div className="results-big-name">En attente</div>
        <p className="login-subtitle">Aucun concurrent n’a encore été lancé depuis le départ.</p>
      </div>
    );
  } else if (!ownsStation) {
    actionZone = (
      <div className="results-status-card results-station-action-card">
        <div className="results-big-name">{currentCompetitor.participantLabel}</div>
        <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
        <p className="login-subtitle">Le concurrent est en attente d’arrivée, mais ce poste n’est plus affecté à votre session.</p>
      </div>
    );
  } else {
    actionZone = (
      <section className="results-action-card results-station-action-card">
        <div className="results-big-name">{currentCompetitor.participantLabel}</div>
        <div className="results-status-line">Course: {currentCompetitor.courseLabel || currentCompetitor.courseId}</div>
        <div className="results-status-line">Start ID: <span className="admin-uid">{currentCompetitor.startId}</span></div>
        {!canFinishCurrent && (
          <p className="login-subtitle">En attente du clic départ sur le poste départ.</p>
        )}
        {canFinishCurrent && (
          <>
            <p className="login-subtitle">
              {canAbandonCurrent
                ? 'Appuyez dès que le concurrent franchit l’arrivée.'
                : 'Arrivée disponible immédiatement. Abandon disponible après validation du départ par le poste départ.'}
            </p>
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
                    await completeCurrentCompetitor(event.id, {
                      actor,
                      click: createClickEntry(),
                    });
                  } catch (error) {
                    log.error('finish click failed', error);
                    await onActionError(error, 'finish');
                  } finally {
                    setBusyAction('');
                  }
                }}
              >
                {busyAction === 'finish' ? 'Envoi…' : 'Arrivé'}
              </button>
              <button
                className="btn btn-danger results-big-button"
                disabled={!canAbandonCurrent || busyAction === 'finish' || busyAction === 'abandon'}
                onClick={async () => {
                  log.info('abandon click triggered', {
                    runId: currentCompetitor?.runId,
                    actorUid: actor.uid,
                  });
                  setBusyAction('abandon');
                  setActionError('');
                  try {
                    await abandonCurrentCompetitor(event.id, {
                      actor,
                      click: createClickEntry(),
                    });
                  } catch (error) {
                    log.error('abandon click failed', error);
                    await onActionError(error, 'finish');
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
      </section>
    );
  }

  return (
    <ResultsShell noHeader variant="operator">
      <StationOperatorScreen
        title="Poste arrivée"
        courseLabel={activeCourse?.courseLabel || '—'}
        email={actor.email || 'poste anonyme'}
        actionError={actionError}
        actionZone={actionZone}
        footerActions={(
          <>
            <button className="btn btn-secondary btn-sm" onClick={onReleaseStation}>
              Libérer poste
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onOpenResultsBrowser} disabled={hasLocalStart}>
              Résultats
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onLogout}>
              Déconnexion
            </button>
          </>
        )}
      >
        <ResultsSummarySection
          title="3 derniers résultats"
          runs={recentRuns}
          emptyLabel="Aucun résultat enregistré pour le moment."
        />
      </StationOperatorScreen>
    </ResultsShell>
  );
}

function StationOperatorScreen({
  title,
  courseLabel,
  email,
  actionError,
  actionZone,
  footerActions,
  children,
}) {
  return (
    <div className="results-station-screen">
      <StationScreenHeader title={title} courseLabel={courseLabel} email={email} />
      {actionError && <div className="form-error">{actionError}</div>}
      <div className="results-station-screen-fixed">
        {actionZone}
      </div>
      <div className="results-station-screen-scroll">
        <div className="results-station-results">
          {children}
        </div>
      </div>
      <div className="results-footer-toolbar">
        {footerActions}
      </div>
    </div>
  );
}

function StationSelectionScreen({
  title,
  courseLabel,
  email,
  actionError,
  footerActions,
  children,
}) {
  return (
    <div className="results-station-screen results-station-screen--selection">
      <StationScreenHeader title={title} courseLabel={courseLabel} email={email} />
      {actionError && <div className="form-error">{actionError}</div>}
      <div className="results-station-screen-scroll">
        <div className="results-station-results">
          {children}
        </div>
      </div>
      {footerActions ? (
        <div className="results-footer-toolbar">
          {footerActions}
        </div>
      ) : null}
    </div>
  );
}

function StationResultsBrowser({
  actor,
  station,
  resultEvents,
  browserView,
  setBrowserView,
  selectedCourseId,
  setSelectedCourseId,
  preferredCourseId,
  preferredCourseLabel,
}) {
  const finishedCourses = useMemo(() => deriveFinishedCourses(resultEvents), [resultEvents]);
  const competitionRuns = useMemo(() => deriveGeneralRanking(resultEvents), [resultEvents]);
  const availableCourse = useMemo(() => {
    if (!finishedCourses.length) return null;
    if (selectedCourseId) {
      return finishedCourses.find((course) => course.courseId === selectedCourseId) ?? null;
    }
    if (preferredCourseId) {
      return finishedCourses.find((course) => course.courseId === preferredCourseId) ?? null;
    }
    return finishedCourses[0];
  }, [finishedCourses, preferredCourseId, selectedCourseId]);

  if (browserView === 'menu') {
    return (
      <ResultsShell noHeader variant="operator">
        <StationSelectionScreen
          title="Résultats"
          courseLabel={station === 'start' ? 'poste départ' : 'poste arrivée'}
          email={actor?.email || 'poste anonyme'}
          footerActions={(
            <button className="btn btn-secondary btn-sm" onClick={() => setBrowserView('station')}>
              Retour au poste
            </button>
          )}
        >
          <div className="results-browser-menu">
            <button className="results-browser-card" onClick={() => setBrowserView('competition')} type="button">
              <div className="results-browser-card-title">Résultats de la compétition</div>
              <div className="results-browser-card-subtitle">
                Classement global de tous les temps enregistrés.
              </div>
            </button>

            <section className="results-summary-card">
              <div className="results-summary-card-title">Résultats d’une course</div>
              {finishedCourses.length === 0 && (
                <div className="results-summary-empty">Aucune course terminée pour le moment.</div>
              )}
              {finishedCourses.length > 0 && (
                <div className="results-browser-course-list">
                  {finishedCourses.map((course) => (
                    <button
                      key={course.courseId}
                      type="button"
                      className={`results-browser-course-item${availableCourse?.courseId === course.courseId ? ' results-browser-course-item--active' : ''}`}
                      onClick={() => {
                        setSelectedCourseId(course.courseId);
                        setBrowserView('course');
                      }}
                    >
                      {course.courseLabel}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </StationSelectionScreen>
      </ResultsShell>
    );
  }

  if (browserView === 'course') {
    return (
      <ResultsShell noHeader variant="operator">
        <StationSelectionScreen
          title="Résultats course"
          courseLabel={availableCourse?.courseLabel || preferredCourseLabel || ''}
          email={actor?.email || 'poste anonyme'}
          footerActions={(
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setBrowserView('menu')}>
                Retour navigation
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setBrowserView('station')}>
                Retour au poste
              </button>
            </>
          )}
        >
          <ResultsSummarySection
            title="Classement"
            runs={availableCourse?.runs ?? []}
            emptyLabel="Aucun résultat enregistré sur cette course."
          />
        </StationSelectionScreen>
      </ResultsShell>
    );
  }

  return (
    <ResultsShell noHeader variant="operator">
      <StationSelectionScreen
        title="Résultats compétition"
        email={actor?.email || 'poste anonyme'}
        footerActions={(
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setBrowserView('menu')}>
              Retour navigation
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setBrowserView('station')}>
              Retour au poste
            </button>
          </>
        )}
      >
        <ResultsSummarySection
          title="Classement général"
          runs={competitionRuns}
          emptyLabel="Aucun résultat enregistré sur la compétition."
        />
      </StationSelectionScreen>
    </ResultsShell>
  );
}

function StationScreenHeader({ title, courseLabel, email }) {
  const [emailPopoverOpen, setEmailPopoverOpen] = useState(false);

  return (
    <div className="results-station-screen-header">
      <div className="results-station-screen-title-row">
        <div className="results-station-screen-title">{title}</div>
        {courseLabel ? (
          <div className="results-station-screen-course" title={courseLabel}>
            {courseLabel}
          </div>
        ) : null}
      </div>
      <div className="results-station-account-row">
        <button className="results-email-chip" onClick={() => setEmailPopoverOpen((value) => !value)} type="button">
          <span className="results-email-chip-text">({email})</span>
        </button>
        {emailPopoverOpen && (
          <div className="results-email-popover results-email-popover--account" onClick={() => setEmailPopoverOpen(false)}>
            {email}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsSummarySection({ title, runs, emptyLabel }) {
  return (
    <section className="results-summary-card">
      <div className="results-summary-card-title">{title}</div>
      {runs.length === 0 && (
        <div className="results-summary-empty">{emptyLabel}</div>
      )}
      {runs.length > 0 && (
        <div className="results-summary-list">
          {runs.map((run) => (
            <article
              key={`${title}:${run.runId}:${run.latestFinishClickId ?? run.latestAbandonClickId ?? run.latestStartClickId}`}
              className={`results-summary-item${run.isAbandoned ? ' results-summary-item--danger' : ''}`}
            >
              <div className="results-summary-name" title={run.participantLabel}>
                {run.participantLabel}
              </div>
              <div className={`results-summary-time${run.isAbandoned ? ' results-summary-time--danger' : ''}`}>
                {run.isAbandoned ? 'Abandon' : run.durationLabel || formatResultTimestamp(run.lastEventAtClientMs)}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StationChoiceCard({ station, disabled = false, onSelect }) {
  const label = station === 'start' ? 'Départ' : 'Arrivée';

  return (
    <button className="results-station-card" disabled={disabled} onClick={onSelect}>
      <div className="results-station-title">{label}</div>
      <div className="results-station-subtitle">Sélectionner ce poste</div>
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

function ResultsShell({ title, titleAside, subtitle, children, noHeader = false, variant = 'default' }) {
  return (
    <div className={`results-shell results-shell--${variant}`}>
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

function stationLabel(station) {
  return station === 'finish' ? 'arrivée' : 'départ';
}

function useResultsResumeLifecycle() {
  const lastResumeAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const handleResume = (reason) => {
      if (document.visibilityState === 'hidden') return;

      const now = Date.now();
      if (now - lastResumeAtRef.current < RESUME_EVENT_DEBOUNCE_MS) return;
      lastResumeAtRef.current = now;

      log.info('results page resumed; ensuring firestore network', { reason, resumedAtMs: now });
      ensureFirestoreOnline().catch((error) => {
        log.warn('failed to ensure firestore network after resume', { reason, error });
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResume('visibilitychange');
      }
    };
    const handleOnline = () => handleResume('online');
    const handlePageShow = (event) => handleResume(event.persisted ? 'pageshow-persisted' : 'pageshow');

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
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
  if (error?.message === 'start-not-synced') return 'Le départ n’est pas encore disponible pour cette action. L’abandon reste bloqué tant que le poste départ n’a pas validé Suivant.';
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

function formatResultTimestamp(ms) {
  if (!Number.isFinite(ms)) return 'heure inconnue';
  return new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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
