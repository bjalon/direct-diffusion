import { useEffect, useMemo, useState } from 'react';
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
  saveAllowedResultUser,
  subscribeAllowedResultUsers,
  subscribePendingResultAccessRequests,
} from '../firebase/results';

const NORMAL_ROLE_LABELS = {
  administration: 'Administration',
  admin_flux: 'Flux',
  participants: 'Participants',
};

const RESULT_ROLE_KEYS = ['results_start', 'results_finish'];

const RESULT_ROLE_LABELS = {
  results_start: 'Départ',
  results_finish: 'Arrivée',
};

const DEFAULT_NORMAL_ROLES = {
  administration: false,
  admin_flux: false,
  participants: false,
};

export default function AdminPage({ currentUser }) {
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [allowedResultUsers, setAllowedResultUsers] = useState([]);
  const [resultRequests, setResultRequests] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRoles, setNewRoles] = useState(DEFAULT_NORMAL_ROLES);
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeAllowedUsers(setAllowedUsers), []);
  useEffect(() => subscribeAccessRequests(setRequests), []);
  useEffect(() => subscribeAllowedResultUsers(setAllowedResultUsers), []);
  useEffect(() => subscribePendingResultAccessRequests(setResultRequests), []);

  const currentEmail = currentUser?.email?.trim().toLowerCase() ?? '';
  const currentUserEntry = useMemo(
    () => allowedUsers.find((entry) => entry.id === currentEmail) ?? null,
    [allowedUsers, currentEmail],
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
      await saveAllowedUser(email, newRoles);
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
      await saveAllowedUser(email, { ...entry, [role]: checked });
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
      await deleteAllowedUser(email);
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
      await approveAccessRequest(email, DEFAULT_NORMAL_ROLES);
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
      await rejectAccessRequest(email);
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
      await approveResultAccessRequest(uid);
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
      await rejectResultAccessRequest(uid);
      setFeedback(`Demande résultats refusée pour ${uid}.`);
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

    setBusyKey(`result-role:${uid}:${role}`);
    try {
      await saveAllowedResultUser(uid, { ...entry, [role]: checked });
      setFeedback(`Droits résultats mis à jour pour ${entry.email || uid}.`);
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
      await deleteAllowedResultUser(uid);
      setFeedback(`Accès résultats supprimé pour ${uid}.`);
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
          Les accès Google sensibles sont gérés dans <code>allowedUsers</code>. Les opérateurs
          résultats sont gérés par <code>uid</code> dans <code>allowedResultUsers</code>.
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
          <h2 className="section-title">Demandes Résultats</h2>
          <span className="admin-counter">{resultRequests.length}</span>
        </div>
        {resultRequests.length === 0 ? (
          <div className="stream-empty">Aucune demande résultats en attente.</div>
        ) : (
          <div className="admin-card-list">
            {resultRequests.map((request) => (
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
                    onClick={() => handleApproveResultRequest(request.uid)}
                    disabled={busyKey !== '' && busyKey !== `result-approve:${request.uid}`}
                  >
                    {busyKey === `result-approve:${request.uid}` ? 'Validation…' : 'Approuver'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRejectResultRequest(request.uid)}
                    disabled={busyKey !== '' && busyKey !== `result-reject:${request.uid}`}
                  >
                    {busyKey === `result-reject:${request.uid}` ? 'Refus…' : 'Refuser'}
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
          <h2 className="section-title">Opérateurs Résultats</h2>
          <span className="admin-counter">{allowedResultUsers.length}</span>
        </div>
        {allowedResultUsers.length === 0 ? (
          <div className="stream-empty">Aucun opérateur résultats autorisé.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>UID</th>
                  {RESULT_ROLE_KEYS.map((role) => <th key={role}>{RESULT_ROLE_LABELS[role]}</th>)}
                  <th>Mise à jour</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allowedResultUsers.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="admin-email">{entry.email || '—'}</div>
                    </td>
                    <td className="admin-uid">{entry.uid || entry.id}</td>
                    {RESULT_ROLE_KEYS.map((role) => {
                      const key = `result-role:${entry.id}:${role}`;
                      return (
                        <td key={role} className="admin-cell-center">
                          <label className="admin-check">
                            <input
                              type="checkbox"
                              checked={!!entry[role]}
                              disabled={busyKey !== '' && busyKey !== key}
                              onChange={(e) => handleResultRoleToggle(entry.id, role, e.target.checked)}
                            />
                          </label>
                        </td>
                      );
                    })}
                    <td className="admin-updated-at">{formatTimestamp(entry.updatedAt)}</td>
                    <td className="admin-cell-actions">
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteResultUser(entry.id)}
                        disabled={busyKey !== '' && busyKey !== `result-delete:${entry.id}`}
                      >
                        {busyKey === `result-delete:${entry.id}` ? 'Suppression…' : 'Retirer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
