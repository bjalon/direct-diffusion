export const HOME_ROUTE = '/';
export const EVENTS_ADMIN_ROUTE = '/events-admin';

export const SOAPBOX_EVENT_ROUTE_PATTERNS = {
  base: '/events/:eventSlug',
  display: '/events/:eventSlug/tv/affichage',
  flow: '/events/:eventSlug/tv/flow',
  flowAdmin: '/events/:eventSlug/tv/flow-admin',
  layouts: '/events/:eventSlug/tv/layouts',
  participants: '/events/:eventSlug/tv/participants',
  admin: '/events/:eventSlug/tv/admin',
  results: '/events/:eventSlug/tv/resultats',
  runs: '/events/:eventSlug/tv/runs',
  archives: '/events/:eventSlug/tv/archives',
  chrono: '/events/:eventSlug/chrono',
};

export const FOOTBALL_EVENT_ROUTE_PATTERNS = {
  base: '/foot/:eventSlug',
  display: '/foot/:eventSlug/affichage',
  flow: '/foot/:eventSlug/flow',
  flowAdmin: '/foot/:eventSlug/flow-admin',
  layouts: '/foot/:eventSlug/layouts',
  participants: '/foot/:eventSlug/equipes',
  admin: '/foot/:eventSlug/admin',
  runs: '/foot/:eventSlug/rencontres',
  scoreboard: '/foot/:eventSlug/score',
};

export const EVENT_ROUTE_KEYS = Array.from(new Set([
  ...Object.keys(SOAPBOX_EVENT_ROUTE_PATTERNS),
  ...Object.keys(FOOTBALL_EVENT_ROUTE_PATTERNS),
])).filter((key) => key !== 'base');

export function eventRouteFamily(eventType = 'soapbox') {
  return eventType === 'football'
    ? FOOTBALL_EVENT_ROUTE_PATTERNS
    : SOAPBOX_EVENT_ROUTE_PATTERNS;
}

export function buildEventRoute(eventSlug, routeKey, eventType = 'soapbox') {
  const pattern = eventRouteFamily(eventType)[routeKey];
  if (!pattern) {
    throw new Error(`unknown-event-route:${eventType}:${routeKey}`);
  }
  return pattern.replace(':eventSlug', eventSlug);
}

export function eventRoot(eventSlug, eventType = 'soapbox') {
  return eventRouteFamily(eventType).base.replace(':eventSlug', eventSlug);
}

export const LEGACY_ROUTE_REDIRECTS = [
  { from: '/cas', to: HOME_ROUTE },
  { from: '/cas/*', to: HOME_ROUTE },
  { from: '/cas/tv', to: HOME_ROUTE },
  { from: '/cav', to: HOME_ROUTE },
  { from: '/cav/*', to: HOME_ROUTE },
  { from: '/config', to: HOME_ROUTE },
  { from: '/streams-admin', to: HOME_ROUTE },
  { from: '/participants', to: HOME_ROUTE },
  { from: '/layouts', to: HOME_ROUTE },
  { from: '/admin', to: HOME_ROUTE },
  { from: '/results-view', to: HOME_ROUTE },
  { from: '/results-admin', to: HOME_ROUTE },
  { from: '/results-runs', to: HOME_ROUTE },
  { from: '/results-archives', to: HOME_ROUTE },
  { from: '/results', to: HOME_ROUTE },
];
