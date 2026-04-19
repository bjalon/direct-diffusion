import { useEffect, useMemo, useState } from 'react';
import {
  HashRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { requestAccess } from './firebase/admin';
import { getGlobalRoles, subscribeEvent } from './firebase/events';
import {
  releaseOwnedScoreStations,
  subscribeFootballAccess,
  subscribeFootballAccessRequest,
  subscribeFootballEvents,
  subscribeMatches,
} from './firebase/football';
import { subscribeParticipants } from './firebase/participants';
import { getUserRoles, saveStreams, seedStreamsIfEmpty, subscribeStreams } from './firebase/streams';
import NavBar from './components/NavBar';
import { EventProvider } from './context/EventContext';
import { buildSrcFromUrl, normalizeFacebookEmbedSrc } from './utils/iframeParser';
import { footballOverlayByStream } from './utils/football';
import { createLogger } from './utils/logger';
import { rememberAnonymousAccount } from './utils/anonymousAccounts';
import { loadConfig, normalizeConfigState, saveConfig } from './utils/storage';
import { EVENTS_ADMIN_ROUTE, buildEventRoute, HOME_ROUTE, LEGACY_ROUTE_REDIRECTS } from './utils/routes';
import AdminPage from './pages/AdminPage';
import FootballMatchesPage from './pages/FootballMatchesPage';
import FootballScorePage from './pages/FootballScorePage';
import ConfigPage from './pages/ConfigPage';
import DisplayPage from './pages/DisplayPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ParticipantsPage from './pages/ParticipantsPage';
import LayoutsPage from './pages/LayoutsPage';
import EventAdminPage from './pages/EventAdminPage';
import ResultsArchivePage from './pages/ResultsArchivePage';
import ResultsRunsPage from './pages/ResultsRunsPage';
import ResultsViewerPage from './pages/ResultsViewerPage';
import ResultsPage from './pages/ResultsPage';
import AdminStreamsPage from './pages/AdminStreamsPage';
import { BUILTIN_VIRTUAL_STREAM } from './utils/virtualDisplay';
import { subscribeResultAccess, subscribeResultAccessRequest } from './firebase/results';
const googleProvider = new GoogleAuthProvider();
const log = createLogger('App');

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

export default function App() {
  const [user, setUser] = useState(null);
  const [globalRoles, setGlobalRoles] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      log.info('auth state changed', {
        uid: nextUser?.uid,
        email: nextUser?.email,
        isAnonymous: nextUser?.isAnonymous,
        providers: nextUser?.providerData?.map((provider) => provider.providerId),
      });
      setUser(nextUser ?? false);
      setGlobalRoles(nextUser && !nextUser.isAnonymous ? null : false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || user === false || user.isAnonymous) {
      setGlobalRoles(false);
      return;
    }

    setGlobalRoles(null);
    getGlobalRoles(user.email)
      .then((roles) => setGlobalRoles(roles ?? false))
      .catch((error) => {
        log.error('global roles loading failed', { email: user.email, error });
        setGlobalRoles(false);
      });
  }, [user]);

  if (user === null || (user && user !== false && !user.isAnonymous && globalRoles === null)) {
    return (
      <div className="app-loading">
        <div className="login-spinner" />
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        {LEGACY_ROUTE_REDIRECTS.map(({ from, to }) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route
          path={HOME_ROUTE}
          element={(
            <HomePage
              user={user}
              globalRoles={globalRoles}
              onGoogleSignIn={async () => signInWithPopup(auth, googleProvider)}
              onLogout={() => signOut(auth)}
            />
          )}
        />
        <Route
          path="/foot"
          element={(
            <HomePage
              user={user}
              globalRoles={globalRoles}
              onGoogleSignIn={async () => signInWithPopup(auth, googleProvider)}
              onLogout={() => signOut(auth)}
              filterType="football"
              title="Football"
              subtitle="Choisis un événement football pour accéder à son affichage, ses flux et sa gestion de score."
              kicker="Direct Diffusion Sport"
            />
          )}
        />
        <Route
          path={EVENTS_ADMIN_ROUTE}
          element={(
            <GlobalEventsAdminRoute
              user={user}
              globalRoles={globalRoles}
              onGoogleSignIn={async () => signInWithPopup(auth, googleProvider)}
              onLogout={() => signOut(auth)}
            />
          )}
        />
        <Route
          path="/events/:eventSlug/*"
          element={<EventShell user={user} globalRoles={globalRoles} />}
        />
        <Route
          path="/foot/:eventSlug/*"
          element={<EventShell user={user} globalRoles={globalRoles} />}
        />
        <Route path="*" element={<Navigate to={HOME_ROUTE} replace />} />
      </Routes>
    </HashRouter>
  );
}

function GlobalEventsAdminRoute({
  user,
  globalRoles,
  onGoogleSignIn,
  onLogout,
}) {
  if (user === false || user?.isAnonymous) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Administration des événements</h1>
          <p className="login-subtitle">
            Cette vue est réservée aux utilisateurs Google autorisés avec le rôle <code>admin_events</code>.
          </p>
          <div className="login-form">
            <button className="btn btn-primary login-btn" onClick={onGoogleSignIn}>
              Se connecter avec Google
            </button>
            <NavigateButton to={HOME_ROUTE} label="Retour à la home" />
          </div>
        </div>
      </div>
    );
  }

  if (!hasGoogleProvider(user) || !globalRoles?.admin_events) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Accès refusé</h1>
          <p className="login-subtitle">
            L&apos;adresse <strong className="login-email">{user?.email || '—'}</strong> n&apos;a pas le droit
            global <code>admin_events</code>.
          </p>
          <div className="login-form">
            <button className="btn btn-secondary login-btn" onClick={onLogout}>
              Se déconnecter
            </button>
            <NavigateButton to={HOME_ROUTE} label="Retour à la home" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <GlobalAdminNavBar user={user} onLogout={onLogout} />
      <main className="app-main">
        <EventAdminPage currentUser={user} />
      </main>
    </div>
  );
}

function GlobalAdminNavBar({ user, onLogout }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  const links = [{ to: EVENTS_ADMIN_ROUTE, label: 'Événements' }];

  return (
    <nav className="navbar">
      <Link to={HOME_ROUTE} className="navbar-brand" onClick={close}>
        Accueil
      </Link>

      <div className="navbar-links">
        {links.map(({ to, label }) => (
          <Link key={to} to={to} className={pathname === to ? 'active' : ''} onClick={close}>
            {label}
          </Link>
        ))}
      </div>

      <div className="navbar-right">
        <span className="navbar-email">{user?.email || '—'}</span>
        <button className="btn btn-secondary btn-sm navbar-logout" onClick={onLogout} type="button">
          Déconnexion
        </button>
        <button
          className="navbar-burger"
          onClick={() => setOpen((value) => !value)}
          aria-label="Menu"
          aria-expanded={open}
          type="button"
        >
          <span /><span /><span />
        </button>
      </div>

      {open && (
        <>
          <div className="navbar-backdrop" onClick={close} />
          <div className="navbar-dropdown">
            <Link to={HOME_ROUTE} onClick={close}>
              Accueil
            </Link>
            {links.map(({ to, label }) => (
              <Link key={to} to={to} className={pathname === to ? 'active' : ''} onClick={close}>
                {label}
              </Link>
            ))}
            <div className="navbar-dropdown-divider" />
            <button className="navbar-dropdown-logout" onClick={() => { onLogout(); close(); }} type="button">
              Déconnexion
            </button>
          </div>
        </>
      )}
    </nav>
  );
}

function EventShell({ user, globalRoles }) {
  const { eventSlug } = useParams();
  const { pathname } = useLocation();
  const [event, setEvent] = useState(undefined);
  const [roles, setRoles] = useState(null);
  const [layoutSlots, setLayoutSlots] = useState(() => loadConfig(eventSlug));
  const [streams, setStreams] = useState([]);
  const [accessRequestState, setAccessRequestState] = useState('idle');
  const [deviceAccess, setDeviceAccess] = useState(null);
  const [deviceRequest, setDeviceRequest] = useState(null);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [footballEvents, setFootballEvents] = useState([]);
  const isGlobalEventAdministrator = !!(globalRoles?.admin_events && hasGoogleProvider(user));
  const isFootballEvent = event?.type === 'football';

  useEffect(() => {
    setLayoutSlots(loadConfig(eventSlug));
  }, [eventSlug]);

  useEffect(() => {
    if (!eventSlug) return undefined;
    return subscribeEvent(eventSlug, setEvent);
  }, [eventSlug]);

  useEffect(() => {
    if (!event || !user || user === false || user.isAnonymous) {
      setRoles(false);
      return;
    }

    if (isGlobalEventAdministrator) {
      setRoles(false);
      return;
    }

    getUserRoles(event.id, user.email)
      .then((nextRoles) => setRoles(nextRoles ?? false))
      .catch((error) => {
        log.error('event roles loading failed', { eventId: event.id, email: user.email, error });
        setRoles(false);
      });
  }, [event?.id, isGlobalEventAdministrator, user]);

  useEffect(() => {
    if (!event?.id || !user || user === false) {
      setDeviceAccess(null);
      return undefined;
    }
    return isFootballEvent
      ? subscribeFootballAccess(event.id, user.uid, setDeviceAccess)
      : subscribeResultAccess(event.id, user.uid, setDeviceAccess);
  }, [event?.id, isFootballEvent, user?.uid]);

  useEffect(() => {
    if (!event?.id || !user || user === false) {
      setDeviceRequest(null);
      return undefined;
    }
    return isFootballEvent
      ? subscribeFootballAccessRequest(event.id, user.uid, setDeviceRequest)
      : subscribeResultAccessRequest(event.id, user.uid, setDeviceRequest);
  }, [event?.id, isFootballEvent, user?.uid]);

  useEffect(() => {
    if (!event?.id || !user?.isAnonymous) return;
    rememberAnonymousAccount(auth, user, event.id, {
      email: deviceAccess?.email || deviceRequest?.email || user.email || '',
      roles: isFootballEvent
        ? {
          tv: !!deviceAccess?.tv,
          score: !!deviceAccess?.score,
          commentator: !!deviceAccess?.commentator,
        }
        : {
          tv: !!deviceAccess?.tv,
          results_start: !!deviceAccess?.results_start,
          results_finish: !!deviceAccess?.results_finish,
        },
      requestStatus: deviceRequest?.status || '',
    });
  }, [
    event?.id,
    isFootballEvent,
    user?.uid,
    user?.isAnonymous,
    user?.email,
    deviceAccess?.email,
    deviceAccess?.tv,
    deviceAccess?.score,
    deviceAccess?.commentator,
    deviceAccess?.results_start,
    deviceAccess?.results_finish,
    deviceRequest?.email,
    deviceRequest?.status,
  ]);

  useEffect(() => {
    const canReadStreams = !!event?.id && (
      user?.isAnonymous ? !!deviceAccess?.tv : isGlobalEventAdministrator || !!(roles && roles !== false)
    );

    if (!canReadStreams || !event?.id) {
      setStreams([]);
      return undefined;
    }

    const unsub = subscribeStreams(event.id, setStreams);
    fetch('./streams.json')
      .then((response) => (response.ok ? response.json() : []))
      .then((raw) => {
        if (!Array.isArray(raw) || raw.length === 0) return;
        const normalised = raw.map(normaliseStream).filter(Boolean);
        if (normalised.length > 0) seedStreamsIfEmpty(event.id, normalised).catch(() => {});
      })
      .catch((error) => {
        log.warn('streams.json fetch failed', { eventId: event.id, error });
      });

    return unsub;
  }, [event?.id, user?.isAnonymous, deviceAccess?.tv, isGlobalEventAdministrator, roles]);

  useEffect(() => {
    const canReadFootballData = !!event?.id && isFootballEvent && (
      isGlobalEventAdministrator
      || !!(roles && roles !== false)
      || !!(user?.isAnonymous && (deviceAccess?.tv || deviceAccess?.score || deviceAccess?.commentator))
    );

    if (!canReadFootballData) {
      setTeams([]);
      return undefined;
    }
    return subscribeParticipants(event.id, setTeams);
  }, [deviceAccess?.commentator, deviceAccess?.score, deviceAccess?.tv, event?.id, isFootballEvent, isGlobalEventAdministrator, roles, user?.isAnonymous]);

  useEffect(() => {
    const canReadFootballData = !!event?.id && isFootballEvent && (
      isGlobalEventAdministrator
      || !!(roles && roles !== false)
      || !!(user?.isAnonymous && (deviceAccess?.tv || deviceAccess?.score || deviceAccess?.commentator))
    );

    if (!canReadFootballData) {
      setMatches([]);
      return undefined;
    }
    return subscribeMatches(event.id, setMatches);
  }, [deviceAccess?.commentator, deviceAccess?.score, deviceAccess?.tv, event?.id, isFootballEvent, isGlobalEventAdministrator, roles, user?.isAnonymous]);

  useEffect(() => {
    const canReadFootballData = !!event?.id && isFootballEvent && (
      isGlobalEventAdministrator
      || !!(roles && roles !== false)
      || !!(user?.isAnonymous && (deviceAccess?.tv || deviceAccess?.score || deviceAccess?.commentator))
    );

    if (!canReadFootballData) {
      setFootballEvents([]);
      return undefined;
    }
    return subscribeFootballEvents(event.id, setFootballEvents);
  }, [deviceAccess?.commentator, deviceAccess?.score, deviceAccess?.tv, event?.id, isFootballEvent, isGlobalEventAdministrator, roles, user?.isAnonymous]);

  const permissions = useMemo(() => {
    if (isGlobalEventAdministrator) {
      return {
        administration: true,
        admin_flux: true,
        streams_admin: true,
        participants: true,
        viewer: true,
        tv: false,
        results_view: true,
        scoreboard: true,
        identityLabel: user?.email || '',
      };
    }

    if (roles && roles !== false) {
      const isAdministration = !!roles.administration && hasGoogleProvider(user);
      return {
        administration: isAdministration,
        admin_flux: !!roles.admin_flux && hasGoogleProvider(user),
        streams_admin: (!!roles.admin_flux || !!roles.administration) && hasGoogleProvider(user),
        participants: !!roles.participants && hasGoogleProvider(user),
        viewer: true,
        tv: false,
        results_view: isAdministration,
        scoreboard: isFootballEvent ? isAdministration : false,
        identityLabel: user?.email || '',
      };
    }

    if (user?.isAnonymous && isFootballEvent && (deviceAccess?.tv || deviceAccess?.score || deviceAccess?.commentator)) {
      return {
        administration: false,
        admin_flux: false,
        streams_admin: false,
        participants: false,
        viewer: !!deviceAccess?.tv,
        tv: !!deviceAccess?.tv,
        results_view: false,
        scoreboard: !!deviceAccess?.score || !!deviceAccess?.commentator,
        identityLabel: deviceAccess.email || user.uid,
      };
    }

    if (user?.isAnonymous && deviceAccess?.tv) {
      return {
        administration: false,
        admin_flux: false,
        streams_admin: false,
        participants: false,
        viewer: true,
        tv: true,
        results_view: true,
        scoreboard: false,
        identityLabel: deviceAccess.email || user.uid,
      };
    }

    return null;
  }, [
    deviceAccess?.commentator,
    deviceAccess?.email,
    deviceAccess?.score,
    deviceAccess?.tv,
    isFootballEvent,
    isGlobalEventAdministrator,
    roles,
    user,
  ]);

  const updateConfig = (updater) => {
    const prevFull = { ...layoutSlots, streams };
    const next = typeof updater === 'function' ? updater(prevFull) : updater;
    const { streams: nextStreams, ...nextLayoutSlots } = next;
    const normalizedLayoutState = normalizeConfigState(nextLayoutSlots);

    setLayoutSlots(normalizedLayoutState);
    saveConfig(normalizedLayoutState, event?.id);

    if (nextStreams !== streams && (permissions?.admin_flux || permissions?.streams_admin) && event?.id) {
      saveStreams(event.id, nextStreams);
    }
  };

  const handleLogout = async () => {
    if (user?.isAnonymous && event?.id) {
      rememberAnonymousAccount(auth, user, event.id, {
        email: deviceAccess?.email || deviceRequest?.email || user.email || '',
        roles: isFootballEvent
          ? {
            tv: !!deviceAccess?.tv,
            score: !!deviceAccess?.score,
            commentator: !!deviceAccess?.commentator,
          }
          : {
            tv: !!deviceAccess?.tv,
            results_start: !!deviceAccess?.results_start,
            results_finish: !!deviceAccess?.results_finish,
          },
        requestStatus: deviceRequest?.status || '',
      });

      if (isFootballEvent && deviceAccess?.score) {
        try {
          await releaseOwnedScoreStations(event.id, user.uid);
        } catch (error) {
          log.warn('football score station release failed during logout', {
            eventId: event.id,
            uid: user.uid,
            error,
          });
        }
      }
    }
    await signOut(auth);
  };

  if (event === undefined || (user && user !== false && !user.isAnonymous && roles === null && !isGlobalEventAdministrator)) {
    return (
      <div className="app-loading">
        <div className="login-spinner" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Événement introuvable</h1>
          <p className="login-subtitle">
            L’événement <strong>{eventSlug}</strong> n’existe pas ou n’est plus disponible.
          </p>
          <NavigateButton to={HOME_ROUTE} label="Retour à la home" />
        </div>
      </div>
    );
  }

  const hasLightResultsAccess = !!(!isFootballEvent && user?.isAnonymous && (deviceAccess?.results_start || deviceAccess?.results_finish));
  const chronoPath = isFootballEvent ? '' : buildEventRoute(event.slug, 'chrono', event.type);
  const displayPath = buildEventRoute(event.slug, 'display', event.type);
  const scoreboardPath = isFootballEvent ? buildEventRoute(event.slug, 'scoreboard', event.type) : '';
  const onSoapboxPath = pathname.startsWith(`/events/${eventSlug}`);
  const onFootballPath = pathname.startsWith(`/foot/${eventSlug}`);
  const showNavbar = (!chronoPath || pathname !== chronoPath) && !!user && user !== false && !!permissions;

  if (isFootballEvent && onSoapboxPath) {
    return <Navigate to={displayPath} replace />;
  }

  if (!isFootballEvent && onFootballPath) {
    return <Navigate to={displayPath} replace />;
  }

  if (hasLightResultsAccess && pathname !== chronoPath) {
    return <Navigate to={chronoPath} replace />;
  }

  if (isFootballEvent && user?.isAnonymous && permissions?.scoreboard && !permissions?.tv && pathname !== scoreboardPath) {
    return <Navigate to={scoreboardPath} replace />;
  }

  const eventConfig = {
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
  };
  const scoreOverlayMap = isFootballEvent ? footballOverlayByStream(matches, teams, footballEvents) : {};

  return (
    <EventProvider value={{ event }}>
      <div className="app-root">
        {showNavbar && (
          <NavBar
            user={user}
            onLogout={handleLogout}
            roles={permissions}
            identityLabel={permissions?.identityLabel}
            config={eventConfig}
            onSelectConfiguration={(configurationId) => updateConfig((prev) => ({
              ...prev,
              activeConfigurationId: configurationId,
            }))}
          />
        )}
        <main className="app-main">
          <Routes>
            {isFootballEvent ? (
              <>
                <Route
                  path="affichage"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="viewer"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <DisplayPage config={eventConfig} scoreOverlayByStream={scoreOverlayMap} />
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="flow"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="viewer"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <ConfigPage config={eventConfig} onUpdate={updateConfig} />
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="flow-admin"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="equipes"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="layouts"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="viewer"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <LayoutsPage currentLayoutId={eventConfig.layout} />
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="admin"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="rencontres"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="administration"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <FootballMatchesPage canEdit={!!permissions?.administration} />
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="score"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="scoreboard"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <FootballScorePage
                        currentUser={user}
                        access={deviceAccess}
                        canAdminister={!!permissions?.administration}
                      />
                    </RegularEventRoute>
                  )}
                />
              </>
            ) : (
              <>
                <Route
                  path="tv/affichage"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="viewer"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <DisplayPage config={eventConfig} />
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/flow"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="viewer"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <ConfigPage config={eventConfig} onUpdate={updateConfig} />
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/flow-admin"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/participants"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/layouts"
                  element={(
                    <RegularEventRoute
                      event={event}
                      user={user}
                      permissions={permissions}
                      requiredRole="viewer"
                      accessRequestState={accessRequestState}
                      setAccessRequestState={setAccessRequestState}
                      onLogout={handleLogout}
                      deviceAccess={deviceAccess}
                      deviceRequest={deviceRequest}
                    >
                      <LayoutsPage currentLayoutId={eventConfig.layout} />
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/admin"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/resultats"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/runs"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route
                  path="tv/archives"
                  element={(
                    <RegularEventRoute
                      event={event}
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
                    </RegularEventRoute>
                  )}
                />
                <Route path="chrono" element={<ResultsPage user={user} onLogout={handleLogout} />} />
              </>
            )}
            <Route path="*" element={<Navigate to={displayPath} replace />} />
          </Routes>
        </main>
      </div>
    </EventProvider>
  );
}

function RegularEventRoute({
  event,
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

  if (user?.isAnonymous && !permissions?.tv && !permissions?.scoreboard) {
    return <LoginPage user={user} deviceAccess={deviceAccess} deviceRequest={deviceRequest} />;
  }

  if (!permissions) {
    return (
      <DeniedAccessCard
        event={event}
        user={user}
        requestState={accessRequestState}
        onLogout={onLogout}
        onRequestAccess={async () => {
          setAccessRequestState('sending');
          try {
            await requestAccess(event.id, user);
            setAccessRequestState('sent');
          } catch {
            setAccessRequestState('error');
          }
        }}
      />
    );
  }

  if (requiredRole && !permissions[requiredRole]) {
    return <Navigate to={buildEventRoute(event.slug, 'display', event.type)} replace />;
  }

  return children;
}

function hasGoogleProvider(user) {
  return user?.providerData?.some((provider) => provider.providerId === 'google.com') ?? false;
}

function DeniedAccessCard({ event, user, requestState, onLogout, onRequestAccess }) {
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
          autorisée sur l&apos;événement <strong>{event.title}</strong>.
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

function NavigateButton({ to, label }) {
  return (
    <a className="btn btn-primary login-btn" href={`#${to}`}>
      {label}
    </a>
  );
}
