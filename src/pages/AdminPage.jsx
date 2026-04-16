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

const ROLE_LABELS = {
  administration: 'Administration',
  admin_flux: 'Flux',
  results: 'Résultats',
};

const DEFAULT_NEW_USER_ROLES = {
  administration: false,
  admin_flux: false,
  results: false,
};

export default function AdminPage({ currentUser }) {
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRoles, setNewRoles] = useState(DEFAULT_NEW_USER_ROLES);
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeAllowedUsers(setAllowedUsers), []);
  useEffect(() => subscribeAccessRequests(setRequests), []);

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
      setNewRoles(DEFAULT_NEW_USER_ROLES);
      setFeedback(`Accès ajouté pour ${email}.`);
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
      await approveAccessRequest(email, { administration: false, admin_flux: false, results: false });
      setFeedback(`Demande approuvée pour ${email}.`);
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
      setFeedback(`Demande refusée pour ${email}.`);
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
          Gérez ici les demandes d&apos;accès et les rôles stockés dans <code>allowedUsers</code>.
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
          <h2 className="section-title">Demandes en cours</h2>
          <span className="admin-counter">{requests.length}</span>
        </div>
        {requests.length === 0 ? (
          <div className="stream-empty">Aucune demande d&apos;accès en attente.</div>
        ) : (
          <div className="admin-card-list">
            {requests.map((request) => (
              <article key={request.id} className="admin-card">
                <div className="admin-card-main">
                  <div className="admin-email">{request.email}</div>
                  {request.displayName && (
                    <div className="admin-subline">{request.displayName}</div>
                  )}
                  <div className="admin-subline">
                    Demandé {formatTimestamp(request.requestedAt)}
                  </div>
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
        <h2 className="section-title">Ajouter un utilisateur</h2>
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
          <h2 className="section-title">Utilisateurs autorisés</h2>
          <span className="admin-counter">{allowedUsers.length}</span>
        </div>
        {allowedUsers.length === 0 ? (
          <div className="stream-empty">Aucun utilisateur autorisé.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  {ADMIN_ROLE_KEYS.map((role) => (
                    <th key={role}>{ROLE_LABELS[role]}</th>
                  ))}
                  <th>Mise à jour</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allowedUsers.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="admin-email">{entry.email ?? entry.id}</div>
                      {entry.id === currentEmail && (
                        <div className="admin-subline">Compte courant</div>
                      )}
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
                            <span />
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
    </div>
  );
}

function RoleEditor({ roles, disabled, onToggle }) {
  return (
    <div className="admin-role-grid">
      {ADMIN_ROLE_KEYS.map((role) => (
        <label key={role} className="admin-role-pill">
          <input
            type="checkbox"
            checked={!!roles[role]}
            disabled={disabled}
            onChange={(e) => onToggle(role, e.target.checked)}
          />
          <span>{ROLE_LABELS[role]}</span>
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

function getErrorLabel(error) {
  return error?.code ? `Erreur : ${error.code}` : "Une erreur est survenue.";
}
