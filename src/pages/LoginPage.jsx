import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, signInAnonymously, signInWithPopup } from 'firebase/auth';
import AnonymousAccountList from '../components/AnonymousAccountList';
import { useEventContext } from '../context/EventContext';
import { auth } from '../firebase';
import { submitFootballAccessRequest } from '../firebase/football';
import { submitResultAccessRequest } from '../firebase/results';
import { footballAccessLabel } from '../utils/football';
import { createLogger } from '../utils/logger';
import { forgetAnonymousAccount, listAnonymousAccounts, restoreAnonymousAccount } from '../utils/anonymousAccounts';
import { buildEventRoute } from '../utils/routes';

const googleProvider = new GoogleAuthProvider();
const log = createLogger('LoginPage');

export default function LoginPage({ user, deviceAccess, deviceRequest }) {
  const { event } = useEventContext();
  const navigate = useNavigate();
  const isFootball = event.type === 'football';
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestStatus, setRequestStatus] = useState('idle');
  const [requestError, setRequestError] = useState('');
  const [knownAccounts, setKnownAccounts] = useState(() => listAnonymousAccounts(auth, event.id));
  const [resumeUid, setResumeUid] = useState('');
  const [resumeError, setResumeError] = useState('');

  useEffect(() => {
    setKnownAccounts(listAnonymousAccounts(auth, event.id));
  }, [event.id, user?.uid, user === false]);

  async function handleGoogleSignIn() {
    setStatus('sending');
    setErrorMsg('');
    try {
      log.info('starting google popup login');
      await signInWithPopup(auth, googleProvider);
      log.info('google popup login succeeded');
    } catch (err) {
      log.error('google popup login failed', err);
      setStatus('error');
      setErrorMsg(getErrorLabel(err.code));
    }
  }

  async function handleRequestAccess(e) {
    e.preventDefault();
    if (!requestEmail.trim()) return;

    setRequestStatus('sending');
    setRequestError('');
    try {
      log.info('starting lightweight access request', { email: requestEmail.trim().toLowerCase() });
      const credential = auth.currentUser?.isAnonymous
        ? { user: auth.currentUser }
        : await signInAnonymously(auth);

      log.info('anonymous session ready', {
        uid: credential.user.uid,
        isAnonymous: credential.user.isAnonymous,
      });

      if (isFootball) {
        await submitFootballAccessRequest(event.id, {
          uid: credential.user.uid,
          email: requestEmail.trim().toLowerCase(),
          providerId: 'anonymous',
        });
      } else {
        await submitResultAccessRequest(event.id, {
          uid: credential.user.uid,
          email: requestEmail.trim().toLowerCase(),
          providerId: 'anonymous',
        });
      }

      log.info('lightweight access request stored', {
        uid: credential.user.uid,
        email: requestEmail.trim().toLowerCase(),
      });
      setRequestStatus('sent');
    } catch (err) {
      log.error('lightweight access request failed', err);
      setRequestStatus('error');
      setRequestError(getErrorLabel(err.code || err.message));
    }
  }

  async function handleResumeAnonymous(uid) {
    if (!uid) return;

    setResumeUid(uid);
    setResumeError('');
    try {
      log.info('restoring anonymous account', { uid });
      await restoreAnonymousAccount(auth, event.id, uid);
      log.info('anonymous account restored', { uid });
    } catch (err) {
      log.error('anonymous account restore failed', { uid, error: err });
      setKnownAccounts(listAnonymousAccounts(auth, event.id));
      setResumeError('Impossible de reprendre ce compte léger local. Il a été retiré de la liste.');
    } finally {
      setResumeUid('');
    }
  }

  function handleDeleteAnonymous(uid) {
    forgetAnonymousAccount(auth, event.id, uid);
    setKnownAccounts(listAnonymousAccounts(auth, event.id));
    if (resumeUid === uid) {
      setResumeUid('');
    }
  }

  const hasApprovedLightAccess = !!deviceAccess;
  const waitingEntry = !hasApprovedLightAccess && deviceRequest?.status === 'pending' ? deviceRequest : null;
  if (user?.isAnonymous && waitingEntry) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo" aria-hidden>DD</div>
          <h1 className="login-title">Demande en attente</h1>
          <p className="login-subtitle">
            Votre demande d&apos;accès léger a bien été enregistrée.
          </p>
          <div className="results-status-card">
            <div className="results-status-line"><strong>Email:</strong> {waitingEntry.email || '—'}</div>
            <div className="results-status-line"><strong>UID:</strong> {user.uid}</div>
            <div className="results-status-line"><strong>Statut:</strong> {statusLabel(waitingEntry.status)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isFootball && user?.isAnonymous && (deviceAccess?.tv || deviceAccess?.score || deviceAccess?.commentator)) {
    const targetRoute = deviceAccess.tv
      ? buildEventRoute(event.slug, 'display', event.type)
      : buildEventRoute(event.slug, 'scoreboard', event.type);

    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo" aria-hidden>DD</div>
          <h1 className="login-title">Accès foot actif</h1>
          <p className="login-subtitle">
            Ce compte léger peut accéder à la vue {footballAccessLabel(deviceAccess).toLowerCase()}.
          </p>
          <div className="results-status-card">
            <div className="results-status-line"><strong>Email:</strong> {deviceAccess.email || '—'}</div>
            <div className="results-status-line"><strong>UID:</strong> {user.uid}</div>
            <div className="results-status-line"><strong>Rôles:</strong> {footballAccessLabel(deviceAccess)}</div>
            <button className="btn btn-primary login-btn" onClick={() => navigate(targetRoute)}>
              {deviceAccess.tv ? 'Aller sur Affichage' : 'Aller sur Score'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user?.isAnonymous && deviceAccess?.tv) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo" aria-hidden>DD</div>
          <h1 className="login-title">Accès TV actif</h1>
          <p className="login-subtitle">
            Ce compte léger peut accéder à l&apos;affichage, aux flux et aux layouts.
          </p>
          <div className="results-status-card">
            <div className="results-status-line"><strong>Email:</strong> {deviceAccess.email || '—'}</div>
            <div className="results-status-line"><strong>UID:</strong> {user.uid}</div>
            <button className="btn btn-primary login-btn" onClick={() => navigate(buildEventRoute(event.slug, 'display', event.type))}>
              Aller sur Affichage
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" aria-hidden>DD</div>
        <h1 className="login-title">Direct Diffusion</h1>
        <p className="login-subtitle">
          {isFootball
            ? 'Les vues d’administration foot sont accessibles via Google OAuth.'
            : 'Les vues d&apos;administration, flux et participants sont accessibles via Google OAuth.'}
        </p>
        <button
          className="btn btn-google login-btn"
          onClick={handleGoogleSignIn}
          disabled={status === 'sending'}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13 17.8 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17z"/>
            <path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.8 23.8 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.8-6z"/>
            <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.2 0-11.5-4.2-13.4-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/>
          </svg>
          {status === 'sending' ? 'Connexion…' : 'Se connecter avec Google'}
        </button>
        {status === 'error' && <div className="form-error">{errorMsg}</div>}

        {knownAccounts.length > 0 && (
          <>
            <div className="login-divider"><span>comptes légers</span></div>
            <div className="login-form">
              <p className="login-subtitle">
                Reprendre un compte léger déjà utilisé sur ce navigateur.
              </p>
              <AnonymousAccountList
                accounts={knownAccounts}
                onSelect={handleResumeAnonymous}
                onDelete={handleDeleteAnonymous}
                disabled={status === 'sending' || requestStatus === 'sending' || !!resumeUid}
              />
              {resumeError && <div className="form-error">{resumeError}</div>}
            </div>
          </>
        )}

        <div className="login-divider"><span>ou</span></div>

        <form className="login-form" onSubmit={handleRequestAccess}>
          <p className="login-subtitle">
            {isFootball
              ? 'Demander un accès léger TV, score ou commentaire en saisissant simplement votre email.'
              : 'Demander un accès léger en saisissant simplement votre email.'}
          </p>
          <input
            type="email"
            className="form-input"
            placeholder="votre@email.com"
            value={requestEmail}
            onChange={(e) => setRequestEmail(e.target.value)}
            required
          />
          <button
            className="btn btn-secondary login-btn"
            type="submit"
            disabled={requestStatus === 'sending'}
          >
            {requestStatus === 'sending' ? 'Envoi…' : 'Demander un accès'}
          </button>
          {requestError && <div className="form-error">{requestError}</div>}
        </form>
      </div>
    </div>
  );
}

function statusLabel(status) {
  if (status === 'approved') return 'Approuvée';
  if (status === 'rejected') return 'Refusée';
  return 'En attente';
}

function getErrorLabel(code) {
  switch (code) {
    case 'auth/popup-closed-by-user': return 'La fenêtre Google a été fermée avant la fin de la connexion.';
    case 'auth/popup-blocked': return 'La fenêtre Google a été bloquée par le navigateur.';
    default: return `Erreur : ${code}`;
  }
}
