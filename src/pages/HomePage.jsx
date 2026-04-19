import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  eventTypeLabel,
  subscribeEvents,
} from '../firebase/events';
import { buildEventRoute, EVENTS_ADMIN_ROUTE } from '../utils/routes';
import { getEventIconSrc, getEventLocationLabel } from '../utils/eventPresentation';

function groupEventsByType(events) {
  return events.reduce((groups, event) => {
    const key = event.type || 'other';
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
    return groups;
  }, new Map());
}

export default function HomePage({
  user,
  globalRoles,
  onGoogleSignIn,
  onLogout,
}) {
  const [promotedEvents, setPromotedEvents] = useState([]);

  const canManageEvents = !!globalRoles?.admin_events;

  useEffect(() => subscribeEvents(setPromotedEvents, { promotedOnly: true }), []);

  const groupedEvents = useMemo(() => [...groupEventsByType(promotedEvents).entries()], [promotedEvents]);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div>
          <div className="home-kicker">Direct Diffusion</div>
          <h1 className="home-title">Événements</h1>
          <p className="home-subtitle">
            Choisis un événement pour accéder à son affichage TV, son chrono et son administration.
          </p>
        </div>

        <div className="home-auth">
          <Link
            className={`btn btn-ghost btn-sm home-admin-link${canManageEvents ? ' enabled' : ''}`}
            to={EVENTS_ADMIN_ROUTE}
            title="Administration des événements"
          >
            Administration
          </Link>
          {user?.email && <div className="home-auth-label">{user.email}</div>}
          {!user || user === false || user.isAnonymous ? (
            <button className="btn btn-primary" type="button" onClick={onGoogleSignIn}>
              Connexion Google
            </button>
          ) : (
            <button className="btn btn-secondary" type="button" onClick={onLogout}>
              Déconnexion
            </button>
          )}
        </div>
      </section>

      {groupedEvents.length === 0 ? (
        <section className="config-section">
          <div className="stream-empty">Aucun événement disponible pour le moment.</div>
        </section>
      ) : (
        groupedEvents.map(([type, events]) => (
          <section key={type} className="config-section">
            <div className="admin-section-head">
              <h2 className="section-title">{eventTypeLabel(type)}</h2>
              <span className="admin-counter">{events.length}</span>
            </div>
            <div className="home-event-grid">
              {events.map((event) => (
                <Link
                  key={event.id}
                  className="home-event-card"
                  to={buildEventRoute(event.slug || event.id, 'display')}
                >
                  <div className="home-event-card-head">
                    <img className="home-event-icon" src={getEventIconSrc(event)} alt="" />
                    <div className="home-event-card-copy">
                      <div className="home-event-title">{event.title}</div>
                      <div className="home-event-meta">{eventTypeLabel(event.type)}</div>
                    </div>
                  </div>
                  <div className="home-event-meta">Début {formatHumanDate(event.startsAt)}</div>
                  {getEventLocationLabel(event) && (
                    <div className="home-event-meta">{getEventLocationLabel(event)}</div>
                  )}
                  {event.endsAt && (
                    <div className="home-event-meta">Fin {formatHumanDate(event.endsAt)}</div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function formatHumanDate(value) {
  const date = value?.toDate?.() ?? value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
