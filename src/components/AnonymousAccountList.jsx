import { useState } from 'react';

export default function AnonymousAccountList({
  accounts,
  onSelect,
  onDelete,
  disabled = false,
}) {
  const [accountToDelete, setAccountToDelete] = useState(null);

  if (!accounts?.length) return null;

  const handleConfirmDelete = () => {
    if (!accountToDelete) return;
    onDelete?.(accountToDelete.uid);
    setAccountToDelete(null);
  };

  return (
    <>
      <div className="login-account-list">
        {accounts.map((account) => {
          const label = account.email || `UID ${shortUid(account.uid)}`;
          return (
            <div key={account.uid} className="login-account-row">
              <button
                type="button"
                className="login-account-btn login-account-btn--select"
                onClick={() => onSelect?.(account.uid)}
                disabled={disabled}
              >
                <span className="login-account-primary">{label}</span>
                <span className="login-account-meta">{buildAccountMetaLabel(account)}</span>
              </button>
              <button
                type="button"
                className="login-account-delete"
                aria-label={`Supprimer ${label} de la liste locale`}
                title="Supprimer de la liste locale"
                onClick={() => setAccountToDelete(account)}
                disabled={disabled}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M10 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {accountToDelete && (
        <div className="dialog-overlay" onClick={() => setAccountToDelete(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Supprimer ce compte léger ?</div>
            <div className="dialog-desc">
              {`Le compte ${accountToDelete.email || `UID ${shortUid(accountToDelete.uid)}`} sera retiré uniquement de ce navigateur.`}
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setAccountToDelete(null)}>
                Annuler
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function buildAccountMetaLabel(account) {
  const parts = [`UID ${shortUid(account.uid)}`];

  if (account.roles?.tv) parts.push('TV');
  if (account.roles?.results_start) parts.push('Départ');
  if (account.roles?.results_finish) parts.push('Arrivée');
  if (account.requestStatus === 'pending') parts.push('Demande en attente');

  return parts.join(' · ');
}

function shortUid(uid) {
  return uid?.slice(0, 8) || '—';
}
