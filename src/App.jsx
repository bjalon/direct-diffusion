import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { requestAccess } from './firebase/admin';
import { getUserRoles, saveStreams, seedStreamsIfEmpty, subscribeStreams } from './firebase/streams';
import NavBar from './components/NavBar';
import { buildSrcFromUrl, normalizeFacebookEmbedSrc } from './utils/iframeParser';
import { createLogger } from './utils/logger';
import { loadConfig, normalizeConfigState, saveConfig } from './utils/storage';
import AdminPage from './pages/AdminPage';
import ConfigPage from './pages/ConfigPage';
import DisplayPage from './pages/DisplayPage';
import LoginPage from './pages/LoginPage';
import ParticipantsPage from './pages/ParticipantsPage';
import LayoutsPage from './pages/LayoutsPage';
import ResultsArchivePage from './pages/ResultsArchivePage';
import ResultsRunsPage from './pages/ResultsRunsPage';
import ResultsViewerPage from './pages/ResultsViewerPage';
import ResultsPage from './pages/ResultsPage';
import AdminStreamsPage from './pages/AdminStreamsPage';
import { BUILTIN_VIRTUAL_STREAM } from './utils/virtualDisplay';
import { subscribeResultAccess, subscribeResultAccessRequest } from './firebase/results';

function orientationToRotation(orientation) {
  const map = { 'landscape-ccw': -90, 'landscape-cw': 90, landscape: -90, portrait: 0 };
  return map[orientation] ?? 0;
}

function normalizeBroadcastState(value) {
  return value === 'live' || value === 'replay' ? value : 'none';
}

function normaliseStream(raw) {
  if (!raw || !raw.id) return null;
  const origW = raw.originalWidth ?? 267;
  const origH = raw.originalHeight ?? 476;
  const rotation = typeof raw.rotation === 'number'
    ? raw.rotation
    : orientationToRotation(raw.orientation);
  const base = {
    id: raw.id,
    rotation,
    originalWidth: origW,
    originalHeight: origH,
    broadcastState: normalizeBroadcastState(raw.broadcastState),
  };

  if (raw.src) {
    return {
      ...base,
      label: raw.label ?? raw.src,
      src: normalizeFacebookEmbedSrc(raw.src),
      videoUrl: raw.videoUrl ?? raw.src,
    };
  }
  if (raw.url) {
    return { ...base, label: raw.label ?? raw.url, src: buildSrcFromUrl(raw.url, origW, origH), videoUrl: raw.url };
  }
  return null;
}

const log = createLogger('App');

export default function App() {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState(null);
  const [layoutSlots, setLayoutSlots] = useState(loadConfig);
  const [streams, setStreams] = useState([]);
  const [accessRequestState, setAccessRequestState] = useState('idle');
  const [deviceAccess, setDeviceAccess] = useState(null);
  const [deviceRequest, setDeviceRequest] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      log.info('auth state changed', {
        uid: nextUser?.uid,
        email: nextUser?.email,
        isAnonymous: nextUser?.isAnonymous,
        providers: nextUser?.providerData?.map((provider) => provider.providerId),
      });
      setUser(nextUser ?? false);
      setAccessRequestState('idle');
      setRoles(nextUser && !nextUser.isAnonymous ? null : false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || user === false || user.isAnonymous) {
      log.debug('skip roles loading', {
        hasUser: !!user,
        isAnonymous: user?.isAnonymous,
      });
      setRoles(false);
      return;
    }

    setRoles(null);
    log.info('loading user roles', { email: user.email, uid: user.uid });
    getUserRoles(user.email)
      .then((nextRoles) => {
        log.info('roles loaded', { email: user.email, roles: nextRoles });
        setRoles(nextRoles ?? false);
      })
      .catch((error) => {
        log.error('roles loading failed', { email: user.email, error });
        setRoles(false);
      });
  }, [user]);

  useEffect(() => {
    if (!user || user === false) {
      setDeviceAccess(null);
      return undefined;
    }
    return subscribeResultAccess(user.uid, setDeviceAccess);
  }, [user?.uid]);

  useEffect(() => {
    if (!user || user === false) {
      setDeviceRequest(null);
      return undefined;
    }
    return subscribeResultAccessRequest(user.uid, setDeviceRequest);
  }, [user?.uid]);

  useEffect(() => {
    const canReadStreams = (!user || user === false)
      ? false
      : (user.isAnonymous ? !!deviceAccess?.tv : !!(roles && roles !== false));

    if (!canReadStreams) {
      log.debug('skip stream subscription', {
        hasUser: !!user,
        isAnonymous: user?.isAnonymous,
        roles,
        deviceAccess,
      });
      setStreams([]);
      return;
    }

    log.info('subscribing streams', { email: user.email });
    const unsub = subscribeStreams(setStreams);

    fetch('./streams.json')
      .then((response) => (response.ok ? response.json() : []))
      .then((raw) => {
        log.debug('streams.json loaded', { count: Array.isArray(raw) ? raw.length : 0 });
        if (!Array.isArray(raw) || raw.length === 0) return;
        const normalised = raw.map(normaliseStream).filter(Boolean);
        if (normalised.length > 0) seedStreamsIfEmpty(normalised).catch(() => {});
      })
      .catch((error) => {
        log.warn('streams.json fetch failed', { error });
      });

    return unsub;
  }, [user, roles, deviceAccess?.tv]);

  if (user === null || (user && user !== false && !user.isAnonymous && roles === null)) {
    return (
      <div className="app-loading">
        <div className="login-spinner" />
      </div>
    );
  }

  const permissions = (() => {
    if (roles && roles !== false) {
      const isAdministration = !!roles.administration && hasGoogleProvider(user);
      return {
        administration: isAdministration,
        admin_flux: !!roles.admin_flux && hasGoogleProvider(user),
        streams_admin: (!!roles.admin_flux || !!roles.administration) && hasGoogleProvider(user),
        participants: !!roles.participants && hasGoogleProvider(user),
        tv: false,
        results_view: isAdministration,
        identityLabel: user?.email || '',
      };
    }

    if (user?.isAnonymous && deviceAccess?.tv) {
      return {
        administration: false,
        admin_flux: false,
        streams_admin: false,
        participants: false,
        tv: true,
        results_view: true,
        identityLabel: deviceAccess.email || user.uid,
      };
    }

    return null;
  })();

  const updateConfig = (updater) => {
    const prevFull = { ...layoutSlots, streams };
    const next = typeof updater === 'function' ? updater(prevFull) : updater;
    const { streams: nextStreams, ...nextLayoutSlots } = next;
    const normalizedLayoutState = normalizeConfigState(nextLayoutSlots);

    setLayoutSlots(normalizedLayoutState);
    saveConfig(normalizedLayoutState);
    log.info('layout config updated', {
      configurationId: normalizedLayoutState.activeConfigurationId,
      layout: normalizedLayoutState.layout,
      slots: normalizedLayoutState.slots,
      streamCount: nextStreams?.length,
    });

    if (nextStreams !== streams && permissions?.admin_flux) {
      log.info('saving streams to firestore', { count: nextStreams.length });
      saveStreams(nextStreams);
    }
  };

  return (
    <HashRouter>
      <AppShell
        user={user}
        permissions={permissions}
        config={{
          ...layoutSlots,
          streams: [
            {
              ...BUILTIN_VIRTUAL_STREAM,
              delay: layoutSlots.virtualDisplayDelay ?? 10,
              startPause: layoutSlots.virtualDisplayStartPause ?? 4,
              scrollSpeed: layoutSlots.virtualDisplayScrollSpeed ?? 28,
              endPause: layoutSlots.virtualDisplayEndPause ?? 4,
            },
            ...streams.filter((stream) => !stream.type),
          ],
        }}
        updateConfig={updateConfig}
        accessRequestState={accessRequestState}
        setAccessRequestState={setAccessRequestState}
        deviceAccess={deviceAccess}
        deviceRequest={deviceRequest}
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
  deviceAccess,
  deviceRequest,
}) {
  const { pathname } = useLocation();
  const handleLogout = () => signOut(auth);
  const hasLightResultsAccess = !!(user?.isAnonymous && (deviceAccess?.results_start || deviceAccess?.results_finish));
  const showNavbar = pathname !== '/results' && !!user && user !== false && !!permissions;

  if (hasLightResultsAccess && pathname !== '/results') {
    return <Navigate to="/results" replace />;
  }

  return (
    <div className="app-root">
      {showNavbar && (
        <NavBar
          user={user}
          onLogout={handleLogout}
          roles={permissions}
          identityLabel={permissions?.identityLabel}
          config={config}
          onSelectConfiguration={(configurationId) => updateConfig((prev) => ({
            ...prev,
            activeConfigurationId: configurationId,
          }))}
        />
      )}
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
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
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
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <ConfigPage config={config} onUpdate={updateConfig} />
              </RegularRoute>
            )}
          />
          <Route
            path="/streams-admin"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                requiredRole="streams_admin"
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <AdminStreamsPage />
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
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <ParticipantsPage canEdit={!!permissions?.participants} />
              </RegularRoute>
            )}
          />
          <Route
            path="/layouts"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <LayoutsPage currentLayoutId={config.layout} />
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
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <AdminPage currentUser={user} />
              </RegularRoute>
            )}
          />
          <Route
            path="/results-view"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                requiredRole="results_view"
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <ResultsViewerPage />
              </RegularRoute>
            )}
          />
          <Route
            path="/results-admin"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                requiredRole="results_view"
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <Navigate to="/results-view" replace />
              </RegularRoute>
            )}
          />
          <Route
            path="/results-runs"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                requiredRole="administration"
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <ResultsRunsPage currentUser={user} />
              </RegularRoute>
            )}
          />
          <Route
            path="/results-archives"
            element={(
              <RegularRoute
                user={user}
                permissions={permissions}
                requiredRole="administration"
                accessRequestState={accessRequestState}
                setAccessRequestState={setAccessRequestState}
                onLogout={handleLogout}
                deviceAccess={deviceAccess}
                deviceRequest={deviceRequest}
              >
                <ResultsArchivePage />
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
  deviceAccess,
  deviceRequest,
}) {
  if (user === false) {
    return <LoginPage user={user} deviceAccess={deviceAccess} deviceRequest={deviceRequest} />;
  }

  if (user?.isAnonymous && !permissions?.tv) {
    return <LoginPage user={user} deviceAccess={deviceAccess} deviceRequest={deviceRequest} />;
  }

  if (!permissions) {
    log.warn('regular route denied, no permissions', {
      user: user?.email,
      accessRequestState,
      requiredRole,
    });
    return (
      <DeniedAccessCard
        user={user}
        requestState={accessRequestState}
        onLogout={onLogout}
        onRequestAccess={async () => {
          log.info('requesting google access', { email: user.email });
          setAccessRequestState('sending');
          try {
            await requestAccess(user);
            log.info('google access request sent', { email: user.email });
            setAccessRequestState('sent');
          } catch (error) {
            log.error('google access request failed', { email: user.email, error });
            setAccessRequestState('error');
          }
        }}
      />
    );
  }

  if (requiredRole && !permissions[requiredRole]) {
    log.warn('regular route missing role', {
      email: user?.email,
      requiredRole,
      permissions,
    });
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
