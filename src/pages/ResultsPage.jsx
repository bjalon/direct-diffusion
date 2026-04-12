import { useState, useEffect } from 'react';
import { subscribeParticipants } from '../firebase/participants';
import { subscribeRaces, addRace, subscribeResults, addResult, deleteResult, finishRace, reopenRace } from '../firebase/races';
import { parseTime } from '../utils/time';

export default function ResultsPage() {
  const [participants, setParticipants] = useState([]);
  const [races, setRaces]               = useState([]);
  const [selectedRaceId, setSelectedRaceId] = useState(null);
  const [results, setResults]           = useState([]);
  const [dialogParticipant, setDialogParticipant] = useState(null);
  const [raceInput, setRaceInput]       = useState('');
  const [autoSelected, setAutoSelected] = useState(false);

  useEffect(() => subscribeParticipants(setParticipants), []);

  useEffect(() => subscribeRaces((r) => {
    setRaces(r);
  }), []);

  // Auto-select the most recent race once on first load
  useEffect(() => {
    if (!autoSelected && races.length > 0) {
      setSelectedRaceId(races[0].id);
      setAutoSelected(true);
    }
  }, [races, autoSelected]);

  useEffect(() => {
    if (!selectedRaceId) { setResults([]); return; }
    return subscribeResults(selectedRaceId, setResults);
  }, [selectedRaceId]);

  const handleNewRace = async () => {
    const number = raceInput.trim();
    if (!number) return;
    const ref = await addRace(number);
    setSelectedRaceId(ref.id);
    setAutoSelected(true);
    setRaceInput('');
  };

  const handleAddResult = async (time) => {
    if (!dialogParticipant || !selectedRaceId) return;
    await addResult(selectedRaceId, {
      participantId:    dialogParticipant.id,
      participantLabel: dialogParticipant.label,
      time,
    });
    setDialogParticipant(null);
  };

  // Count results per participant for the selected race
  const counts = {};
  results.forEach((r) => {
    counts[r.participantId] = (counts[r.participantId] || 0) + 1;
  });

  // Compute rank per result id based on time (1 = fastest)
  const rankById = {};
  [...results]
    .sort((a, b) => parseTime(a.time) - parseTime(b.time))
    .forEach((r, i) => { rankById[r.id] = i + 1; });

  const selectedRace = races.find((r) => r.id === selectedRaceId);

  return (
    <div className="results-page">

      {/* ── Race bar ── */}
      <div className="race-bar">
        <select
          className="race-select"
          value={selectedRaceId || ''}
          onChange={(e) => setSelectedRaceId(e.target.value || null)}
        >
          <option value="">— Choisir une course —</option>
          {races.map((r) => (
            <option key={r.id} value={r.id}>Course {r.number}</option>
          ))}
        </select>

        <div className="new-race-row">
          <input
            className="form-input new-race-input"
            placeholder="Numéro"
            value={raceInput}
            onChange={(e) => setRaceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNewRace(); }}
          />
          <button className="btn btn-primary" onClick={handleNewRace}>
            + Nouvelle course
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      {selectedRaceId ? (
        <div className="results-layout">

          {/* Left: participant list */}
          <div className="results-panel">
            <div className="panel-title panel-title--row">
              <span>Participants — Course&nbsp;<strong>{selectedRace?.number}</strong></span>
              {selectedRace?.finished ? (
                <button className="btn btn-secondary btn-sm" onClick={() => reopenRace(selectedRaceId)}>
                  Réouvrir
                </button>
              ) : (
                <button className="btn btn-finish btn-sm" onClick={() => finishRace(selectedRaceId)}>
                  ✓ Terminer
                </button>
              )}
            </div>
            {participants.length === 0 && (
              <div className="stream-empty">Aucun participant configuré.</div>
            )}
            {participants.map((p) => {
              const count = counts[p.id] || 0;
              return (
                <div
                  key={p.id}
                  className={`rp-row${count > 0 ? ' rp-row--done' : ''}`}
                >
                  <span className="rp-label">{p.label}</span>
                  {count > 0 && <span className="rp-badge">{count}</span>}
                  <button
                    className="btn-plus"
                    onClick={() => setDialogParticipant(p)}
                    aria-label={`Ajouter un temps pour ${p.label}`}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>

          {/* Right: results table */}
          <div className="results-panel">
            <div className="panel-title">Classement</div>
            {results.length === 0 ? (
              <div className="stream-empty">
                Appuyez sur + pour enregistrer un temps.
              </div>
            ) : (
              <table className="results-table">
                <thead>
                  <tr>
                    <th className="rt-rank">#</th>
                    <th>Participant</th>
                    <th className="rt-time">Temps</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id}>
                      <td className="rt-rank">{rankById[r.id]}</td>
                      <td>{r.participantLabel}</td>
                      <td className="rt-time">{r.time}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteResult(selectedRaceId, r.id)}
                          aria-label="Supprimer"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="results-empty">
          Créez ou sélectionnez une course pour commencer.
        </div>
      )}

      {/* Time entry dialog */}
      {dialogParticipant && (
        <TimeEntryDialog
          participant={dialogParticipant}
          onConfirm={handleAddResult}
          onClose={() => setDialogParticipant(null)}
        />
      )}
    </div>
  );
}

// ── Time entry dialog ─────────────────────────────────────────────────────────

const NUMPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

function TimeEntryDialog({ participant, onConfirm, onClose }) {
  const [input, setInput] = useState('');

  const press = (key) => {
    if (key === '⌫') {
      setInput((v) => v.slice(0, -1));
    } else {
      // Prevent multiple dots
      if (key === '.' && input.includes('.')) return;
      setInput((v) => v + key);
    }
  };

  const confirm = () => {
    if (input.trim()) onConfirm(input.trim());
  };

  // Allow physical keyboard too
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === '.') press('.');
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="time-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="time-dialog-name">{participant.label}</div>
        <div className="time-display">{input || <span className="time-placeholder">0</span>}</div>

        <div className="numpad">
          {NUMPAD_ROWS.map((row, i) => (
            <div key={i} className="numpad-row">
              {row.map((k) => (
                <button key={k} className="numpad-key" onClick={() => press(k)}>
                  {k}
                </button>
              ))}
            </div>
          ))}
          <button
            className="numpad-key numpad-confirm"
            onClick={confirm}
            disabled={!input.trim()}
          >
            Valider ✓
          </button>
        </div>
      </div>
    </div>
  );
}
