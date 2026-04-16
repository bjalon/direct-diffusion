import { useEffect, useState } from 'react';
import { subscribeResultEvents, toggleResultEventActive } from '../firebase/results';
import { formatEventTimestamp, sortEventsNewestFirst } from '../utils/resultsDerivation';

export default function ResultsAuditPage() {
  const [events, setEvents] = useState([]);
  const [busyId, setBusyId] = useState('');

  useEffect(() => subscribeResultEvents((entries) => setEvents(sortEventsNewestFirst(entries))), []);

  return (
    <div className="config-page">
      <section className="config-section">
        <h2 className="section-title">Journal Résultats</h2>
        <p className="hint">
          Tous les clics stockés dans Firebase. Désactivez un événement pour le retirer des affichages et des calculs.
        </p>
      </section>

      <section className="config-section">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Participant</th>
                <th>Type</th>
                <th>Start ID</th>
                <th>Click ID</th>
                <th>Horodatage</th>
                <th>Opérateur</th>
                <th>Actif</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{event.courseLabel || event.courseId || '—'}</td>
                  <td>{event.participantLabel || '—'}</td>
                  <td>{event.type === 'start' ? 'Départ' : 'Arrivée'}</td>
                  <td className="admin-uid">{event.startId || '—'}</td>
                  <td className="admin-uid">{event.clickId || event.id}</td>
                  <td>{formatEventTimestamp(event.clickedAtClientMs)}</td>
                  <td>{event.actorEmail || event.actorUid || '—'}</td>
                  <td className="admin-cell-center">
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={event.active !== false}
                        disabled={busyId === event.id}
                        onChange={async (e) => {
                          setBusyId(event.id);
                          try {
                            await toggleResultEventActive(event.id, e.target.checked);
                          } finally {
                            setBusyId('');
                          }
                        }}
                      />
                    </label>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan="8">
                    <div className="stream-empty">Aucun événement résultats enregistré.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
