import { useState, useEffect } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { subscribeStreams, saveStreams, seedStreamsIfEmpty, getUserRoles } from './firebase/streams';
import { requestAccess } from './firebase/admin';
import { loadConfig, saveConfig } from './utils/storage';
import { buildSrcFromUrl } from './utils/iframeParser';
import NavBar from './components/NavBar';
import DisplayPage from './pages/DisplayPage';
import ConfigPage from './pages/ConfigPage';
import ParticipantsPage from './pages/ParticipantsPage';
import ResultsPage from './pages/ResultsPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';

// ── Stream normalisation (used to seed Firestore from streams.json) ───────────

function orientationToRotation(orientation) {
  const map = { 'landscape-ccw': -90, 'landscape-cw': 90, 'landscape': -90, 'portrait': 0 };
  return map[orientation] ?? 0;
}

function normaliseStream(raw) {
  if (!raw || !raw.id) return null;
  const origW = raw.originalWidth  ?? 267;
  const origH = raw.originalHeight ?? 476;
  const rotation = typeof raw.rotation === 'number'
    ? raw.rotation
    : orientationToRotation(raw.orientation);
  const base = { id: raw.id, rotation, originalWidth: origW, originalHeight: origH };

  if (raw.src) {
    return { ...base, label: raw.label ?? raw.src, src: raw.src, videoUrl: raw.videoUrl ?? raw.src };
  }
  if (raw.url) {
    return { ...base, label: raw.label ?? raw.url, src: buildSrcFromUrl(raw.url, origW, origH), videoUrl: raw.url };
  }
  return null;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  // null = checking auth, false = not authenticated, object = authenticated user
  const [user, setUser] = useState(null);
  // null = checking, false = denied, object = roles doc
  const [roles, setRoles] = useState(null);

  // Layout + slot assignments (persisted to localStorage)
  const [layoutSlots, setLayoutSlots] = useState(loadConfig);

  // Streams from Firestore
  const [streams, setStreams] = useState([]);
  const [accessRequestState, setAccessRequestState] = useState('idle');

  // ── Auth state ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? false);
      if (!u) setRoles(null);
      setAccessRequestState('idle');
    });
    return unsub;
  }, []);

  // ── Authorization + roles ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getUserRoles(user.email)
      .then((r) => setRoles(r ?? false))
      .catch(() => setRoles(false));
  }, [user]);

  // ── Firestore subscription + seed (only when authorized) ──────────────────
  useEffect(() => {
    if (!user || !roles || roles === false) {
      setStreams([]);
      return;
    }

    // Real-time listener
    const unsub = subscribeStreams(setStreams);

    // Seed from public/streams.json if Firestore is empty
    fetch('./streams.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((raw) => {
        if (!Array.isArray(raw) || raw.length === 0) return;
        const normalised = raw.map(normaliseStream).filter(Boolean);
        if (normalised.length > 0) seedStreamsIfEmpty(normalised).catch(() => {});
      })
      .catch(() => {});

    return unsub;
  }, [user, roles]);

  // ── Config updater ──────────────────────────────────────────────────────────
  // Accepts the same (updater | nextConfig) signature as before.
  // Streams → Firestore ; layout+slots → localStorage.
  const updateConfig = (updater) => {
    const prevFull = { ...layoutSlots, streams };
    const next = typeof updater === 'function' ? updater(prevFull) : updater;
    const { streams: nextStreams, ...nextLayoutSlots } = next;

    // Persist layout+slots
    setLayoutSlots(nextLayoutSlots);
    saveConfig(nextLayoutSlots);

    // Persist streams only if user has stream admin role
    if (nextStreams !== streams && permissions?.admin_flux) {
      saveStreams(nextStreams);
    }
  };

  const handleLogout = () => signOut(auth);
  const isGoogleUser = user && hasGoogleProvider(user);
  const permissions = roles && roles !== false ? {
    administration: !!roles.administration && isGoogleUser,
    admin_flux: !!roles.admin_flux && isGoogleUser,
    participants: !!roles.participants && isGoogleUser,
    results: !!roles.results,
  } : null;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (user === null || (user && roles === null)) {
    return (
      <div className="app-loading">
        <div className="login-spinner" />
      </div>
    );
  }

  // ── Not authenticated ───────────────────────────────────────────────────────
  if (user === false) {
    return <LoginPage />;
  }

  // ── Not authorized ──────────────────────────────────────────────────────────
  if (roles === false) {
    return (
      <DeniedAccessCard
        user={user}
        requestState={accessRequestState}
        onLogout={handleLogout}
        onRequestAccess={async () => {
          setAccessRequestState('sending');
          try {
            await requestAccess(user);
            setAccessRequestState('sent');
          } catch {
            setAccessRequestState('error');
          }
        }}
      />
    );
  }

  // ── Authenticated ───────────────────────────────────────────────────────────
  const config = { ...layoutSlots, streams };

  return (
    <HashRouter>
      <div className="app-root">
        <NavBar user={user} onLogout={handleLogout} roles={permissions} />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<DisplayPage config={config} />} />
            <Route path="/config" element={
              <ConfigPage config={config} onUpdate={updateConfig} canEditStreams={!!permissions?.admin_flux} />
            } />
            <Route path="/participants" element={<ParticipantsPage canEdit={!!permissions?.participants} />} />
            <Route path="/results" element={<ResultsPage canEdit={!!permissions?.results} />} />
            <Route
              path="/admin"
              element={permissions?.administration ? <AdminPage currentUser={user} /> : <Navigate to="/" replace />}
            />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

function hasGoogleProvider(user) {
  return user?.providerData?.some((provider) => provider.providerId === 'google.com') ?? false;
}

function DeniedAccessCard({ user, requestState, onLogout, onRequestAccess }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon" style={{ color: 'var(--danger)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="login-title">Accès refusé</h1>
        <p className="login-subtitle">
          L&apos;adresse <strong className="login-email">{user.email}</strong> n&apos;est pas
          autorisée à accéder à cette application.
        </p>
        {requestState === 'sent' && (
          <div className="admin-feedback">
            Votre demande d&apos;accès a été envoyée à l&apos;administration.
          </div>
        )}
        {requestState === 'error' && (
          <div className="form-error">
            Impossible d&apos;enregistrer la demande d&apos;accès.
          </div>
        )}
        <div className="login-form">
          <button
            className="btn btn-primary login-btn"
            onClick={onRequestAccess}
            disabled={requestState === 'sending' || requestState === 'sent'}
          >
            {requestState === 'sending' ? 'Envoi…' : requestState === 'sent' ? 'Demande envoyée' : 'Demander un accès'}
          </button>
          <button className="btn btn-secondary login-btn" onClick={onLogout}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
