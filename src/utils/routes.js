export const HOME_ROUTE = '/';
export const EVENTS_ADMIN_ROUTE = '/events-admin';

export const EVENT_ROUTE_PATTERNS = {
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

export const EVENT_ROUTE_KEYS = Object.keys(EVENT_ROUTE_PATTERNS).filter((key) => key !== 'base');

export function buildEventRoute(eventSlug, routeKey) {
  const pattern = EVENT_ROUTE_PATTERNS[routeKey];
  if (!pattern) {
    throw new Error(`unknown-event-route:${routeKey}`);
  }
  return pattern.replace(':eventSlug', eventSlug);
}

export function eventRoot(eventSlug) {
  return EVENT_ROUTE_PATTERNS.base.replace(':eventSlug', eventSlug);
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
