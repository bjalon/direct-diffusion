import { createContext, useContext } from 'react';
import { buildEventRoute, eventRoot } from '../utils/routes';

const EventContext = createContext(null);

export function EventProvider({ value, children }) {
  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEventContext() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('missing-event-context');
  }
  return context;
}

export function useEventRoute(routeKey) {
  const { event } = useEventContext();
  return buildEventRoute(event.slug, routeKey, event.type);
}

export function useEventRoot() {
  const { event } = useEventContext();
  return eventRoot(event.slug, event.type);
}
