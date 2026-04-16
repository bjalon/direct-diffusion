import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { requestAccess } from './firebase/admin';
import { getUserRoles, saveStreams, seedStreamsIfEmpty, subscribeStreams } from './firebase/streams';
import NavBar from './components/NavBar';
import { buildSrcFromUrl } from './utils/iframeParser';
import { loadConfig, saveConfig } from './utils/storage';
import AdminPage from './pages/AdminPage';
import ConfigPage from './pages/ConfigPage';
import DisplayPage from './pages/DisplayPage';
import LoginPage from './pages/LoginPage';
import ParticipantsPage from './pages/ParticipantsPage';
import ResultsPage from './pages/ResultsPage';

function orientationToRotation(orientation) {
  const map = { 'landscape-ccw': -90, 'landscape-cw': 90, landscape: -90, portrait: 0 };
  return map[orientation] ?? 0;
}

function normaliseStream(raw) {
  if (!raw || !raw.id) return null;
  const origW = raw.originalWidth ?? 267;
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

export default function App() {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState(null);
  const [layoutSlots, setLayoutSlots] = useState(loadConfig);
  const [streams, setStreams] = useState([]);
  const [accessRequestState, setAccessRequestState] = useState('idle');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser ?? false);
      setAccessRequestState('idle');
      if (!nextUser || nextUser.isAnonymous) {
        setRoles(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || user === false || user.isAnonymous) {
      setRoles(false);
      return;
    }

    setRoles(null);
    getUserRoles(user.email)
      .then((nextRoles) => setRoles(nextRoles ?? false))
      .catch(() => setRoles(false));
  }, [user]);

  useEffect(() => {
    if (!user || user === false || user.isAnonymous || !roles || roles === false) {
      setStreams([]);
      return;
    }

    const unsub = subscribeStreams(setStreams);

    fetch('./streams.json')
      .then((response) => (response.ok ? response.json() : []))
      .then((raw) => {
        if (!Array.isArray(raw) || raw.length === 0) return;
        const normalised = raw.map(normaliseStream).filter(Boolean);
        if (normalised.length > 0) seedStreamsIfEmpty(normalised).catch(() => {});
      })
      .catch(() => {});

    return unsub;
  }, [user, roles]);

  if (user === null || (user && user !== false && !user.isAnonymous && roles === null)) {
    return (
      <div className="app-loading">
        <div className="login-spinner" />
      </div>
    );
  }

  const permissions = roles && roles !== false ? {
    administration: !!roles.administration && hasGoogleProvider(user),
    admin_flux: !!roles.admin_flux && hasGoogleProvider(user),
    participants: !!roles.participants && hasGoogleProvider(user),
  } : null;

  const updateConfig = (updater) => {
    const prevFull = { ...layoutSlots, streams };
    const next = typeof updater === 'function' ? updater(prevFull) : updater;
    const { streams: nextStreams, ...nextLayoutSlots } = next;

    setLayoutSlots(nextLayoutSlots);
    saveConfig(nextLayoutSlots);

    if (nextStreams !== streams && permissions?.admin_flux) {
      saveStreams(nextStreams);
    }
  };

  return (
    <HashRouter>
      <AppShell
        user={user}
        permissions={permissions}
        config={{ ...layoutSlots, streams }}
        updateConfig={updateConfig}
        accessRequestState={accessRequestState}
        setAccessRequestState={setAccessRequestState}
      />
    </HashRouter>
  );
}

function AppShell({
  user,
  permissions,
  config,
  updateConfig,
  accessRequestState,
  setAccessRequestState,
}) {
  const { pathname } = useLocation();
  const handleLogout = () => signOut(auth);
  const showNavbar = pathname !== '/results' && !!user && user !== false && !user.isAnonymous && !!permissions;

  return (
    <div className="app-root">
      {showNavbar && <NavBar user={user} onLogout={handleLogout} roles={permissions} />}
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
              >
                <DisplayPage config={config} />
              </RegularRoute>
            )}
          />
          <Route
            path="/config"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
              >
                <ConfigPage config={config} onUpdate={updateConfig} canEditStreams={!!permissions?.admin_flux} />
              </RegularRoute>
            )}
          />
          <Route
            path="/participants"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                requiredRole="participants"
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
              >
                <ParticipantsPage canEdit={!!permissions?.participants} />
              </RegularRoute>
            )}
          />
          <Route
            path="/admin"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                requiredRole="administration"
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
              >
                <AdminPage currentUser={user} />
              </RegularRoute>
            )}
          />
          <Route path="/results" element={<ResultsPage user={user} onLogout={handleLogout} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function RegularRoute({
  user,
  permissions,
  requiredRole,
  children,
  accessRequestState,
  setAccessRequestState,
  onLogout,
}) {
  if (user === false || user?.isAnonymous) {
    return <LoginPage />;
  }

  if (!permissions) {
    return (
      <DeniedAccessCard
        user={user}
        requestState={accessRequestState}
        onLogout={onLogout}
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

  if (requiredRole && !permissions[requiredRole]) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function hasGoogleProvider(user) {
  return user?.providerData?.some((provider) => provider.providerId === 'google.com') ?? false;
}

function DeniedAccessCard({ user, requestState, onLogout, onRequestAccess }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon" style={{ color: 'var(--danger)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
