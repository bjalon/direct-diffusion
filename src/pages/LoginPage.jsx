import { useState, useEffect } from 'react';
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '../firebase';

const googleProvider = new GoogleAuthProvider();

const EMAIL_KEY = 'emailForSignIn';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  // idle | sending | sent | completing | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // true when the user opened the magic link on a different device (email not in localStorage)
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  // On mount: check if this URL is a Firebase sign-in link
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) {
      // Same device — complete sign-in automatically
      completeSignIn(saved);
    } else {
      // Different device — ask the user to re-enter their email
      setNeedsEmailConfirm(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function completeSignIn(emailAddress) {
    setStatus('completing');
    try {
      await signInWithEmailLink(auth, emailAddress, window.location.href);
      localStorage.removeItem(EMAIL_KEY);
      // Clean Firebase params from the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      setStatus('error');
      setErrorMsg(getErrorLabel(err.code));
    }
  }

  async function handleGoogleSignIn() {
    setStatus('sending');
    setErrorMsg('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setStatus('error');
      setErrorMsg(getErrorLabel(err.code));
    }
  }

  async function handleSendLink(e) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setErrorMsg('');
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.origin + '/',
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_KEY, email);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(getErrorLabel(err.code));
    }
  }

  async function handleConfirmEmail(e) {
    e.preventDefault();
    if (!email) return;
    await completeSignIn(email);
  }

  // ── Completing sign-in ──────────────────────────────────────────────────────
  if (status === 'completing') {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-spinner" aria-label="Connexion en cours" />
          <p className="login-subtitle">Connexion en cours…</p>
        </div>
      </div>
    );
  }

  // ── Email sent confirmation ─────────────────────────────────────────────────
  if (status === 'sent') {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-icon login-icon--ok">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5">
              <path d="M22 6 12 13 2 6" />
              <rect x="2" y="4" width="20" height="16" rx="2" />
            </svg>
          </div>
          <h1 className="login-title">Vérifiez votre boîte mail</h1>
          <p className="login-subtitle">
            Un lien de connexion a été envoyé à{' '}
            <strong className="login-email">{email}</strong>.
            Cliquez sur le lien dans l'email pour accéder à l'application.
          </p>
          <button
            className="btn btn-secondary login-btn"
            onClick={() => { setStatus('idle'); setEmail(''); }}
          >
            Utiliser une autre adresse
          </button>
        </div>
      </div>
    );
  }

  // ── Different-device email confirm ──────────────────────────────────────────
  if (needsEmailConfirm) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="login-title">Confirmez votre adresse</h1>
          <p className="login-subtitle">
            Le lien a été ouvert sur un autre appareil. Entrez votre adresse email
            pour confirmer la connexion.
          </p>
          <form className="login-form" onSubmit={handleConfirmEmail}>
            <input
              type="email"
              className="form-input"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button className="btn btn-primary login-btn" type="submit">
              Confirmer
            </button>
          </form>
          {status === 'error' && (
            <div className="form-error">{errorMsg}</div>
          )}
        </div>
      </div>
    );
  }

  // ── Default: email request form ─────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" aria-hidden>DD</div>
        <h1 className="login-title">Direct Diffusion</h1>
        <p className="login-subtitle">
          Entrez votre adresse email pour recevoir un lien de connexion.
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
          Se connecter avec Google
        </button>

        <div className="login-divider"><span>ou</span></div>

        <form className="login-form" onSubmit={handleSendLink}>
          <input
            type="email"
            className="form-input"
            placeholder="votre@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <button
            className="btn btn-secondary login-btn"
            type="submit"
            disabled={status === 'sending'}
          >
            {status === 'sending' ? 'Envoi…' : 'Envoyer le lien magique'}
          </button>
        </form>
        {status === 'error' && (
          <div className="form-error">{errorMsg}</div>
        )}
      </div>
    </div>
  );
}

function getErrorLabel(code) {
  switch (code) {
    case 'auth/invalid-email':           return 'Adresse email invalide.';
    case 'auth/invalid-action-code':     return 'Le lien est invalide ou a expiré. Demandez un nouveau lien.';
    case 'auth/expired-action-code':     return 'Le lien a expiré. Demandez un nouveau lien.';
    case 'auth/user-disabled':           return 'Ce compte a été désactivé.';
    default:                             return `Erreur : ${code}`;
  }
}
