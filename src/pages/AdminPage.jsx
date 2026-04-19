import { useEffect, useMemo, useState } from 'react';
import { useEventContext } from '../context/EventContext';
import {
  ADMIN_ROLE_KEYS,
  approveAccessRequest,
  deleteAllowedUser,
  rejectAccessRequest,
  saveAllowedUser,
  subscribeAccessRequests,
  subscribeAllowedUsers,
} from '../firebase/admin';
import {
  approveResultAccessRequest,
  deleteAllowedResultUser,
  rejectResultAccessRequest,
  releaseStationAsAdmin,
  saveAllowedResultUser,
  subscribeAllowedResultUsers,
  subscribeCurrentStationAssignment,
  subscribePendingResultAccessRequests,
} from '../firebase/results';
import {
  approveFootballAccessRequest,
  deleteAllowedFootballUser,
  rejectFootballAccessRequest,
  releaseScoreStationAsAdmin,
  saveAllowedFootballUser,
  subscribeAllowedFootballUsers,
  subscribePendingFootballAccessRequests,
  subscribeScoreStations,
  subscribeMatches,
} from '../firebase/football';
import { createLogger } from '../utils/logger';
import { FOOTBALL_LIGHT_ROLE_KEYS, FOOTBALL_LIGHT_ROLE_LABELS, enrichMatches, normalizeFootballRoles } from '../utils/football';
import { subscribeParticipants } from '../firebase/participants';

const log = createLogger('AdminPage');

const NORMAL_ROLE_LABELS = {
  administration: 'Administration',
  admin_flux: 'Flux',
  participants: 'Participants',
};

const LIGHT_ROLE_KEYS = ['results_start', 'results_finish', 'tv'];

const RESULT_ROLE_LABELS = {
  results_start: 'Départ',
  results_finish: 'Arrivée',
  tv: 'TV',
};

const DEFAULT_NORMAL_ROLES = {
  administration: false,
  admin_flux: false,
  participants: false,
};

export default function AdminPage({ currentUser }) {
  const { event } = useEventContext();
  const isFootball = event.type === 'football';
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [allowedResultUsers, setAllowedResultUsers] = useState([]);
  const [resultRequests, setResultRequests] = useState([]);
  const [stationAssignments, setStationAssignments] = useState({ start: null, finish: null });
  const [allowedFootballUsers, setAllowedFootballUsers] = useState([]);
  const [footballRequests, setFootballRequests] = useState([]);
  const [scoreStations, setScoreStations] = useState([]);
  const [footballMatches, setFootballMatches] = useState([]);
  const [footballTeams, setFootballTeams] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRoles, setNewRoles] = useState(DEFAULT_NORMAL_ROLES);
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeAllowedUsers(event.id, setAllowedUsers), [event.id]);
  useEffect(() => subscribeAccessRequests(event.id, setRequests), [event.id]);
  useEffect(() => {
    if (isFootball) {
      setAllowedResultUsers([]);
      return undefined;
    }
    return subscribeAllowedResultUsers(event.id, setAllowedResultUsers);
  }, [event.id, isFootball]);
  useEffect(() => {
    if (isFootball) {
      setResultRequests([]);
      return undefined;
    }
    return subscribePendingResultAccessRequests(event.id, setResultRequests);
  }, [event.id, isFootball]);
  useEffect(() => {
    if (isFootball) {
      setStationAssignments({ start: null, finish: null });
      return undefined;
    }
    return subscribeCurrentStationAssignment(event.id, 'start', (doc) => {
      setStationAssignments((prev) => ({ ...prev, start: doc }));
    });
  }, [event.id, isFootball]);
  useEffect(() => {
    if (isFootball) {
      return undefined;
    }
    return subscribeCurrentStationAssignment(event.id, 'finish', (doc) => {
      setStationAssignments((prev) => ({ ...prev, finish: doc }));
    });
  }, [event.id, isFootball]);
  useEffect(() => {
    if (!isFootball) {
      setAllowedFootballUsers([]);
      return undefined;
    }
    return subscribeAllowedFootballUsers(event.id, setAllowedFootballUsers);
  }, [event.id, isFootball]);
  useEffect(() => {
    if (!isFootball) {
      setFootballRequests([]);
      return undefined;
    }
    return subscribePendingFootballAccessRequests(event.id, setFootballRequests);
  }, [event.id, isFootball]);
  useEffect(() => {
    if (!isFootball) {
      setScoreStations([]);
      setFootballMatches([]);
      setFootballTeams([]);
      return undefined;
    }
    return subscribeScoreStations(event.id, setScoreStations);
  }, [event.id, isFootball]);
  useEffect(() => {
    if (!isFootball) return undefined;
    return subscribeMatches(event.id, setFootballMatches);
  }, [event.id, isFootball]);
  useEffect(() => {
    if (!isFootball) return undefined;
    return subscribeParticipants(event.id, setFootballTeams);
  }, [event.id, isFootball]);

  const currentEmail = currentUser?.email?.trim().toLowerCase() ?? '';
  const currentUserEntry = useMemo(
    () => allowedUsers.find((entry) => entry.id === currentEmail) ?? null,
    [allowedUsers, currentEmail],
  );
  const footballMatchesWithTeams = useMemo(
    () => enrichMatches(footballMatches, footballTeams, []),
    [footballMatches, footballTeams],
  );

  const clearMessages = () => {
    setFeedback('');
    setError('');
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    clearMessages();
    setBusyKey(`add:${email}`);
    try {
      log.info('adding google user', { email, roles: newRoles });
      await saveAllowedUser(event.id, email, newRoles);
      setNewEmail('');
      setNewRoles(DEFAULT_NORMAL_ROLES);
      setFeedback(`Accès Google ajouté pour ${email}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleRoleToggle = async (email, role, checked) => {
    clearMessages();

    if (email === currentEmail && role === 'administration' && !checked) {
      setError("Vous ne pouvez pas retirer votre propre rôle d'administration.");
      return;
    }

    const entry = allowedUsers.find((user) => user.id === email);
    if (!entry) return;

    setBusyKey(`role:${email}:${role}`);
    try {
      log.info('toggling google role', { email, role, checked });
      await saveAllowedUser(event.id, email, { ...entry, [role]: checked });
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleDeleteUser = async (email) => {
    clearMessages();

    if (email === currentEmail) {
      setError("Vous ne pouvez pas supprimer votre propre accès.");
      return;
    }

    setBusyKey(`delete:${email}`);
    try {
      log.info('deleting google user', { email });
      await deleteAllowedUser(event.id, email);
      setFeedback(`Accès supprimé pour ${email}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleApproveRequest = async (email) => {
    clearMessages();
    setBusyKey(`approve:${email}`);
    try {
      log.info('approving google access request', { email });
      await approveAccessRequest(event.id, email, DEFAULT_NORMAL_ROLES);
      setFeedback(`Demande Google approuvée pour ${email}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleRejectRequest = async (email) => {
    clearMessages();
    setBusyKey(`reject:${email}`);
    try {
      log.info('rejecting google access request', { email });
      await rejectAccessRequest(event.id, email);
      setFeedback(`Demande Google refusée pour ${email}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleApproveResultRequest = async (uid) => {
    clearMessages();
    setBusyKey(`result-approve:${uid}`);
    try {
      log.info('approving results access request', { uid });
      await approveResultAccessRequest(event.id, uid);
      setFeedback(`Demande résultats approuvée pour ${uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleRejectResultRequest = async (uid) => {
    clearMessages();
    setBusyKey(`result-reject:${uid}`);
    try {
      log.info('rejecting results access request', { uid });
      await rejectResultAccessRequest(event.id, uid);
      setFeedback(`Demande résultats refusée pour ${uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleApproveFootballRequest = async (uid) => {
    clearMessages();
    setBusyKey(`football-approve:${uid}`);
    try {
      log.info('approving football access request', { uid });
      await approveFootballAccessRequest(event.id, uid);
      setFeedback(`Demande foot approuvée pour ${uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleRejectFootballRequest = async (uid) => {
    clearMessages();
    setBusyKey(`football-reject:${uid}`);
    try {
      log.info('rejecting football access request', { uid });
      await rejectFootballAccessRequest(event.id, uid);
      setFeedback(`Demande foot refusée pour ${uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleResultRoleToggle = async (uid, role, checked) => {
    clearMessages();
    const entry = allowedResultUsers.find((user) => user.id === uid);
    if (!entry) return;

    const nextRoles = {
      ...entry,
      [role]: checked,
    };
    if (role === 'tv' && checked) {
      nextRoles.results_start = false;
      nextRoles.results_finish = false;
    }
    if ((role === 'results_start' || role === 'results_finish') && checked) {
      nextRoles.tv = false;
    }

    setBusyKey(`result-role:${uid}:${role}`);
    try {
      log.info('toggling result role', { uid, role, checked });
      await saveAllowedResultUser(event.id, uid, nextRoles);
      setFeedback(`Droits légers mis à jour pour ${entry.email || uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleFootballRoleToggle = async (uid, role, checked) => {
    clearMessages();
    const entry = allowedFootballUsers.find((user) => user.id === uid);
    if (!entry) return;

    const nextRoles = normalizeFootballRoles({
      ...entry,
      [role]: checked,
    });

    setBusyKey(`football-role:${uid}:${role}`);
    try {
      log.info('toggling football role', { uid, role, checked });
      await saveAllowedFootballUser(event.id, uid, { ...entry, ...nextRoles });
      setFeedback(`Droits foot mis à jour pour ${entry.email || uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleDeleteResultUser = async (uid) => {
    clearMessages();
    setBusyKey(`result-delete:${uid}`);
    try {
      log.info('deleting result operator', { uid });
      await deleteAllowedResultUser(event.id, uid);
      setFeedback(`Accès résultats supprimé pour ${uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleDeleteFootballUser = async (uid) => {
    clearMessages();
    setBusyKey(`football-delete:${uid}`);
    try {
      log.info('deleting football operator', { uid });
      await deleteAllowedFootballUser(event.id, uid);
      setFeedback(`Accès foot supprimé pour ${uid}.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleReleaseStation = async (station) => {
    clearMessages();
    setBusyKey(`release-station:${station}`);
    try {
      log.info('releasing station as admin', { station });
      await releaseStationAsAdmin(event.id, station);
      setFeedback(`Poste ${station === 'start' ? 'départ' : 'arrivée'} libéré.`);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleReleaseScoreStation = async (matchId) => {
    clearMessages();
    setBusyKey(`release-score-station:${matchId}`);
    try {
      log.info('releasing football score station as admin', { matchId });
      await releaseScoreStationAsAdmin(event.id, matchId);
      setFeedback('Poste score libéré.');
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };


  return (
    <div className="config-page">
      <section className="config-section">
        <h2 className="section-title">Administration</h2>
        <p className="hint">
          Les accès Google de cet événement sont gérés dans <code>events/{event.id}/allowedUsers</code>.
          {' '}
          {isFootball ? (
            <>
              Les opérateurs foot non-OAuth sont gérés par <code>uid</code> dans{' '}
              <code>events/{event.id}/allowedFootballUsers</code>.
            </>
          ) : (
            <>
              Les opérateurs résultats et TV non-OAuth sont gérés par <code>uid</code> dans{' '}
              <code>events/{event.id}/allowedResultUsers</code>.
            </>
          )}
        </p>
        {currentUserEntry && (
          <div className="admin-banner">
            Connecté en tant que <strong>{currentUserEntry.email ?? currentUserEntry.id}</strong>.
          </div>
        )}
        {feedback && <div className="admin-feedback">{feedback}</div>}
        {error && <div className="form-error">{error}</div>}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Demandes Google</h2>
          <span className="admin-counter">{requests.length}</span>
        </div>
        {requests.length === 0 ? (
          <div className="stream-empty">Aucune demande Google en attente.</div>
        ) : (
          <div className="admin-card-list">
            {requests.map((request) => (
              <article key={request.id} className="admin-card">
                <div className="admin-card-main">
                  <div className="admin-email">{request.email}</div>
                  {request.displayName && <div className="admin-subline">{request.displayName}</div>}
                  <div className="admin-subline">Demandé {formatTimestamp(request.requestedAt)}</div>
                </div>
                <div className="admin-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleApproveRequest(request.email)}
                    disabled={busyKey !== '' && busyKey !== `approve:${request.email}`}
                  >
                    {busyKey === `approve:${request.email}` ? 'Validation…' : 'Approuver'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRejectRequest(request.email)}
                    disabled={busyKey !== '' && busyKey !== `reject:${request.email}`}
                  >
                    {busyKey === `reject:${request.email}` ? 'Refus…' : 'Refuser'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">{isFootball ? 'Demandes Foot' : 'Demandes Résultats'}</h2>
          <span className="admin-counter">{isFootball ? footballRequests.length : resultRequests.length}</span>
        </div>
        {(isFootball ? footballRequests.length : resultRequests.length) === 0 ? (
          <div className="stream-empty">{isFootball ? 'Aucune demande foot en attente.' : 'Aucune demande résultats en attente.'}</div>
        ) : (
          <div className="admin-card-list">
            {(isFootball ? footballRequests : resultRequests).map((request) => (
              <article key={request.id} className="admin-card">
                <div className="admin-card-main">
                  <div className="admin-email">{request.email || request.uid}</div>
                  <div className="admin-subline">UID {request.uid}</div>
                  <div className="admin-subline">
                    Provider: {getProviderLabel(request.providerId)}
                  </div>
                  <div className="admin-subline">Demandé {formatTimestamp(request.requestedAt)}</div>
                </div>
                <div className="admin-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => (isFootball ? handleApproveFootballRequest(request.uid) : handleApproveResultRequest(request.uid))}
                    disabled={busyKey !== '' && busyKey !== `${isFootball ? 'football' : 'result'}-approve:${request.uid}`}
                  >
                    {busyKey === `${isFootball ? 'football' : 'result'}-approve:${request.uid}` ? 'Validation…' : 'Approuver'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => (isFootball ? handleRejectFootballRequest(request.uid) : handleRejectResultRequest(request.uid))}
                    disabled={busyKey !== '' && busyKey !== `${isFootball ? 'football' : 'result'}-reject:${request.uid}`}
                  >
                    {busyKey === `${isFootball ? 'football' : 'result'}-reject:${request.uid}` ? 'Refus…' : 'Refuser'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="config-section">
        <h2 className="section-title">Ajouter un compte Google</h2>
        <form className="add-stream-form" onSubmit={handleAddUser}>
          <label className="form-label" htmlFor="new-user-email">Adresse email</label>
          <input
            id="new-user-email"
            type="email"
            className="form-input"
            placeholder="utilisateur@exemple.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
          <RoleEditor
            roles={newRoles}
            roleKeys={ADMIN_ROLE_KEYS}
            labels={NORMAL_ROLE_LABELS}
            disabled={busyKey.startsWith('add:')}
            onToggle={(role, checked) => setNewRoles((prev) => ({ ...prev, [role]: checked }))}
          />
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busyKey.startsWith('add:')}>
              {busyKey.startsWith('add:') ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Comptes Google autorisés</h2>
          <span className="admin-counter">{allowedUsers.length}</span>
        </div>
        {allowedUsers.length === 0 ? (
          <div className="stream-empty">Aucun compte Google autorisé.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  {ADMIN_ROLE_KEYS.map((role) => <th key={role}>{NORMAL_ROLE_LABELS[role]}</th>)}
                  <th>Mise à jour</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allowedUsers.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="admin-email">{entry.email ?? entry.id}</div>
                      {entry.id === currentEmail && <div className="admin-subline">Compte courant</div>}
                    </td>
                    {ADMIN_ROLE_KEYS.map((role) => {
                      const key = `role:${entry.id}:${role}`;
                      const lockSelfAdmin = entry.id === currentEmail && role === 'administration';
                      return (
                        <td key={role} className="admin-cell-center">
                          <label className="admin-check">
                            <input
                              type="checkbox"
                              checked={!!entry[role]}
                              disabled={(busyKey !== '' && busyKey !== key) || lockSelfAdmin}
                              onChange={(e) => handleRoleToggle(entry.id, role, e.target.checked)}
                            />
                          </label>
                        </td>
                      );
                    })}
                    <td className="admin-updated-at">{formatTimestamp(entry.updatedAt)}</td>
                    <td className="admin-cell-actions">
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteUser(entry.id)}
                        disabled={entry.id === currentEmail || (busyKey !== '' && busyKey !== `delete:${entry.id}`)}
                      >
                        {busyKey === `delete:${entry.id}` ? 'Suppression…' : 'Retirer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">
            Utilisateurs non-OAuth
            <span className="admin-section-note">
              {isFootball ? ' (tv, score, commentaire)' : ' (vert départ et rouge arrivée actuels)'}
            </span>
          </h2>
          <span className="admin-counter">{isFootball ? allowedFootballUsers.length : allowedResultUsers.length}</span>
          <div className="admin-actions">
            {isFootball ? null : (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!stationAssignments.start?.assignedUid || (busyKey !== '' && busyKey !== 'release-station:start')}
                  onClick={() => handleReleaseStation('start')}
                >
                  {busyKey === 'release-station:start' ? 'Libération…' : 'Retirer le poste départ'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!stationAssignments.finish?.assignedUid || (busyKey !== '' && busyKey !== 'release-station:finish')}
                  onClick={() => handleReleaseStation('finish')}
                >
                  {busyKey === 'release-station:finish' ? 'Libération…' : 'Retirer le poste arrivée'}
                </button>
              </>
            )}
          </div>
        </div>
        {(isFootball ? allowedFootballUsers.length : allowedResultUsers.length) === 0 ? (
          <div className="stream-empty">Aucun utilisateur non-OAuth autorisé.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>UID</th>
                  {(isFootball ? FOOTBALL_LIGHT_ROLE_KEYS : LIGHT_ROLE_KEYS).map((role) => (
                    <th key={role}>{isFootball ? FOOTBALL_LIGHT_ROLE_LABELS[role] : RESULT_ROLE_LABELS[role]}</th>
                  ))}
                  <th>Mise à jour</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(isFootball ? allowedFootballUsers : allowedResultUsers).map((entry) => {
                  const rowClassName = isFootball
                    ? (scoreStations.some((station) => station.assignedUid === entry.id) ? 'admin-row-start' : '')
                    : [
                      stationAssignments.start?.assignedUid === entry.id ? 'admin-row-start' : '',
                      stationAssignments.finish?.assignedUid === entry.id ? 'admin-row-finish' : '',
                    ].filter(Boolean).join(' ');

                  return (
                    <tr key={entry.id} className={rowClassName}>
                      <td>
                        <div className="admin-email">{entry.email || '—'}</div>
                        {isFootball && scoreStations.some((station) => station.assignedUid === entry.id) && (
                          <div className="admin-subline">Poste score actif sur au moins une rencontre</div>
                        )}
                        {!isFootball && stationAssignments.start?.assignedUid === entry.id && (
                          <div className="admin-subline">Poste départ actif</div>
                        )}
                        {!isFootball && stationAssignments.finish?.assignedUid === entry.id && (
                          <div className="admin-subline">Poste arrivée actif</div>
                        )}
                      </td>
                      <td className="admin-uid">{entry.uid || entry.id}</td>
                      {(isFootball ? FOOTBALL_LIGHT_ROLE_KEYS : LIGHT_ROLE_KEYS).map((role) => {
                        const key = `${isFootball ? 'football' : 'result'}-role:${entry.id}:${role}`;
                        return (
                          <td key={role} className="admin-cell-center">
                            <label className="admin-check">
                              <input
                                type="checkbox"
                                checked={!!entry[role]}
                                disabled={busyKey !== '' && busyKey !== key}
                                onChange={(e) => (
                                  isFootball
                                    ? handleFootballRoleToggle(entry.id, role, e.target.checked)
                                    : handleResultRoleToggle(entry.id, role, e.target.checked)
                                )}
                              />
                            </label>
                          </td>
                        );
                      })}
                      <td className="admin-updated-at">{formatTimestamp(entry.updatedAt)}</td>
                      <td className="admin-cell-actions">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => (isFootball ? handleDeleteFootballUser(entry.id) : handleDeleteResultUser(entry.id))}
                          disabled={busyKey !== '' && busyKey !== `${isFootball ? 'football' : 'result'}-delete:${entry.id}`}
                        >
                          {busyKey === `${isFootball ? 'football' : 'result'}-delete:${entry.id}` ? 'Suppression…' : 'Retirer'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isFootball && (
        <section className="config-section">
          <div className="admin-section-head">
            <h2 className="section-title">Postes score actifs</h2>
            <span className="admin-counter">{scoreStations.length}</span>
          </div>
          {scoreStations.length === 0 ? (
            <div className="stream-empty">Aucun poste score actif.</div>
          ) : (
            <div className="admin-card-list">
              {scoreStations.map((station) => {
                const match = footballMatchesWithTeams.find((entry) => entry.id === station.id);
                return (
                  <article key={station.id} className="admin-card">
                    <div className="admin-card-main">
                      <div className="admin-email">
                        {match ? `${match.homeLabel} vs ${match.awayLabel}` : `Rencontre ${station.id}`}
                      </div>
                      <div className="admin-subline">{station.email || station.assignedUid}</div>
                      {station.claimedAt && <div className="admin-subline">Pris {formatTimestamp(station.claimedAt)}</div>}
                    </div>
                    <div className="admin-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleReleaseScoreStation(station.id)}
                        disabled={busyKey !== '' && busyKey !== `release-score-station:${station.id}`}
                      >
                        {busyKey === `release-score-station:${station.id}` ? 'Libération…' : 'Retirer le poste score'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

    </div>
  );
}

function RoleEditor({ roles, roleKeys, labels, disabled, onToggle }) {
  return (
    <div className="admin-role-grid">
      {roleKeys.map((role) => (
        <label key={role} className="admin-role-pill">
          <input
            type="checkbox"
            checked={!!roles[role]}
            disabled={disabled}
            onChange={(e) => onToggle(role, e.target.checked)}
          />
          <span>{labels[role]}</span>
        </label>
      ))}
    </div>
  );
}

function formatTimestamp(value) {
  const date = value?.toDate?.();
  if (!date) return 'en attente';

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getProviderLabel(providerId) {
  if (providerId === 'google.com') return 'Google OAuth';
  if (providerId === 'anonymous') return 'Anonyme Firebase';
  return providerId || 'inconnu';
}

function getErrorLabel(error) {
  return error?.code ? `Erreur : ${error.code}` : error?.message || "Une erreur est survenue.";
}
