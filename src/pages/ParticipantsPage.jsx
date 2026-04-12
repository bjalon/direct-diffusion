import { useState, useEffect } from 'react';
import {
  subscribeParticipants, addParticipant, updateParticipant, deleteParticipant,
} from '../firebase/participants';

export default function ParticipantsPage({ canEdit = false }) {
  const [participants, setParticipants] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => subscribeParticipants(setParticipants), []);

  const handleAdd = async () => {
    if (!canEdit) return;
    const label = newLabel.trim();
    if (!label) return;
    const maxOrder = participants.reduce((m, p) => Math.max(m, p.order ?? 0), 0);
    await addParticipant(label, maxOrder + 1);
    setNewLabel('');
    setAdding(false);
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <h2 className="section-title">Participants</h2>

        <div className="participant-list">
          {participants.length === 0 && !adding && (
            <div className="stream-empty">Aucun participant{canEdit ? '. Ajoutez-en un ci-dessous.' : '.'}</div>
          )}
          {participants.map((p) => (
            <ParticipantRow key={p.id} participant={p} canEdit={canEdit} />
          ))}
        </div>

        {canEdit && (adding ? (
          <div className="add-stream-form">
            <label className="form-label">Nom du participant</label>
            <input
              className="form-input"
              placeholder="Ex : Jean Dupont"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
              }}
              autoFocus
            />
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleAdd}>Ajouter</button>
              <button
                className="btn btn-secondary"
                onClick={() => { setAdding(false); setNewLabel(''); }}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Ajouter un participant
          </button>
        ))}
      </section>
    </div>
  );
}

function ParticipantRow({ participant, canEdit }) {
  const [label, setLabel] = useState(participant.label);
  const [order, setOrder] = useState(participant.order ?? 0);

  useEffect(() => setLabel(participant.label), [participant.label]);
  useEffect(() => setOrder(participant.order ?? 0), [participant.order]);

  const saveLabel = () => {
    if (!canEdit) return;
    const trimmed = label.trim();
    if (trimmed && trimmed !== participant.label) {
      updateParticipant(participant.id, { label: trimmed });
    } else {
      setLabel(participant.label);
    }
  };

  const saveOrder = () => {
    if (!canEdit) return;
    const n = Number(order);
    if (!isNaN(n) && n !== participant.order) {
      updateParticipant(participant.id, { order: n });
    }
  };

  return (
    <div className="participant-row">
      <input
        className="participant-order-input"
        type="number"
        value={order}
        onChange={(e) => canEdit && setOrder(e.target.value)}
        onBlur={saveOrder}
        min="1"
        title="Ordre de passage"
        readOnly={!canEdit}
      />
      <input
        className="stream-label-input participant-label-input"
        value={label}
        onChange={(e) => canEdit && setLabel(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        readOnly={!canEdit}
      />
      {canEdit && (
        <button
          className="btn btn-danger btn-sm"
          onClick={() => deleteParticipant(participant.id)}
        >
          Supprimer
        </button>
      )}
    </div>
  );
}
