import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

const googleProvider = new GoogleAuthProvider();

export default function LoginPage() {
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

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

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" aria-hidden>DD</div>
        <h1 className="login-title">Direct Diffusion</h1>
        <p className="login-subtitle">
          Les vues d&apos;administration, flux et participants sont accessibles via Google OAuth.
          La saisie résultats utilise un flux séparé sur la page dédiée.
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
      </div>
    </div>
  );
}

function getErrorLabel(code) {
  switch (code) {
    case 'auth/popup-closed-by-user': return 'La fenêtre Google a été fermée avant la fin de la connexion.';
    case 'auth/popup-blocked': return 'La fenêtre Google a été bloquée par le navigateur.';
    default: return `Erreur : ${code}`;
  }
}
