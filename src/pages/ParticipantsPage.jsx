import { useState, useEffect, useRef } from 'react';
import { useEventContext } from '../context/EventContext';
import {
  subscribeParticipants, addParticipant, updateParticipant, deleteParticipant, reorderParticipants,
} from '../firebase/participants';
import { normalizeTeamTrigram } from '../utils/football';

export default function ParticipantsPage({ canEdit = false }) {
  const { event } = useEventContext();
  const [participants, setParticipants] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newTrigram, setNewTrigram] = useState('');
  const [adding, setAdding] = useState(false);
  const [draggedParticipantId, setDraggedParticipantId] = useState('');
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const participantsRef = useRef([]);
  const dragOriginRef = useRef([]);
  const dragDidDropRef = useRef(false);
  const isFootball = event.type === 'football';
  const itemLabel = isFootball ? 'équipe' : 'participant';
  const sectionTitle = isFootball ? 'Équipes' : 'Participants';

  useEffect(() => subscribeParticipants(event.id, setParticipants), [event.id]);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const handleAdd = async () => {
    if (!canEdit) return;
    const label = newLabel.trim();
    if (!label) return;
    const maxOrder = participants.reduce((m, p) => Math.max(m, p.order ?? 0), 0);
    await addParticipant(event.id, {
      label,
      order: maxOrder + 1,
      active: true,
      trigram: isFootball ? normalizeTeamTrigram(newTrigram || label) : '',
    });
    setNewLabel('');
    setNewTrigram('');
    setAdding(false);
  };

  const commitParticipantOrder = async (orderedParticipants) => {
    const previousParticipants = dragOriginRef.current;
    const didChange = orderedParticipants.some((participant, index) => participant.id !== previousParticipants[index]?.id);

    if (!didChange) {
      return;
    }

    setIsSavingOrder(true);
    try {
      await reorderParticipants(event.id, orderedParticipants.map((participant) => participant.id));
    } catch {
      if (dragOriginRef.current.length > 0) {
        setParticipants(dragOriginRef.current);
      }
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDragStart = (participantId, event) => {
    if (!canEdit) return;
    dragOriginRef.current = participantsRef.current;
    dragDidDropRef.current = false;
    setDraggedParticipantId(participantId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', participantId);
  };

  const handleDragEnter = (targetParticipantId) => {
    if (!canEdit || !draggedParticipantId || draggedParticipantId === targetParticipantId) {
      return;
    }

    setParticipants((currentParticipants) => moveParticipant(currentParticipants, draggedParticipantId, targetParticipantId));
  };

  const handleDrop = async (event) => {
    if (!canEdit || !draggedParticipantId) {
      return;
    }

    event.preventDefault();
    dragDidDropRef.current = true;
    await commitParticipantOrder(participantsRef.current);
    setDraggedParticipantId('');
    dragOriginRef.current = [];
  };

  const handleDragEnd = () => {
    if (!dragDidDropRef.current && dragOriginRef.current.length > 0) {
      setParticipants(dragOriginRef.current);
    }

    dragDidDropRef.current = false;
    dragOriginRef.current = [];
    setDraggedParticipantId('');
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <h2 className="section-title">{sectionTitle}</h2>
        {canEdit && (
          <p className="hint" style={{ paddingTop: 0 }}>
            Glissez le bouton à gauche d’un {itemLabel} pour réorganiser l’ordre d’affichage.
          </p>
        )}

        <div className="participant-list" onDragOver={(event) => canEdit && event.preventDefault()}>
          {participants.length === 0 && !adding && (
            <div className="stream-empty">Aucun {itemLabel}{canEdit ? '. Ajoutez-en un ci-dessous.' : '.'}</div>
          )}
          {participants.map((p) => (
            <ParticipantRow
              key={p.id}
              eventType={event.type}
              eventId={event.id}
              participant={p}
              canEdit={canEdit}
              isDragging={draggedParticipantId === p.id}
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              disableActions={isSavingOrder}
            />
          ))}
        </div>

        {canEdit && (adding ? (
          <div className="add-stream-form">
            <label className="form-label">Nom de {isFootball ? "l'équipe" : 'du participant'}</label>
            <input
              className="form-input"
              placeholder={isFootball ? 'Ex : FC Qastia' : 'Ex : Jean Dupont'}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setAdding(false); setNewLabel(''); setNewTrigram(''); }
              }}
              autoFocus
            />
            {isFootball && (
              <>
                <label className="form-label">Trigramme</label>
                <input
                  className="form-input"
                  placeholder="QAS"
                  value={newTrigram}
                  maxLength={4}
                  onChange={(e) => setNewTrigram(normalizeTeamTrigram(e.target.value))}
                />
              </>
            )}
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleAdd}>Ajouter</button>
              <button
                className="btn btn-secondary"
                onClick={() => { setAdding(false); setNewLabel(''); setNewTrigram(''); }}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Ajouter {isFootball ? 'une équipe' : 'un participant'}
          </button>
        ))}
      </section>
    </div>
  );
}

function moveParticipant(participants, draggedParticipantId, targetParticipantId) {
  const fromIndex = participants.findIndex((participant) => participant.id === draggedParticipantId);
  const toIndex = participants.findIndex((participant) => participant.id === targetParticipantId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return participants;
  }

  const nextParticipants = [...participants];
  const [movedParticipant] = nextParticipants.splice(fromIndex, 1);
  nextParticipants.splice(toIndex, 0, movedParticipant);

  return nextParticipants.map((participant, index) => ({
    ...participant,
    order: index + 1,
  }));
}

function ParticipantRow({
  eventType,
  eventId,
  participant,
  canEdit,
  isDragging,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
  disableActions = false,
}) {
  const [label, setLabel] = useState(participant.label);
  const [order, setOrder] = useState(participant.order ?? 0);
  const [active, setActive] = useState(participant.active !== false);
  const [trigram, setTrigram] = useState(participant.trigram ?? '');
  const isFootball = eventType === 'football';

  useEffect(() => setLabel(participant.label), [participant.label]);
  useEffect(() => setOrder(participant.order ?? 0), [participant.order]);
  useEffect(() => setActive(participant.active !== false), [participant.active]);
  useEffect(() => setTrigram(participant.trigram ?? ''), [participant.trigram]);

  const saveLabel = () => {
    if (!canEdit) return;
    const trimmed = label.trim();
    const normalizedTrigram = normalizeTeamTrigram(trigram || trimmed);
    const labelChanged = trimmed && trimmed !== participant.label;
    const trigramChanged = isFootball && normalizedTrigram !== (participant.trigram ?? '');

    if (labelChanged || trigramChanged) {
      updateParticipant(eventId, participant.id, {
        ...(labelChanged ? { label: trimmed } : {}),
        ...(isFootball ? { trigram: normalizedTrigram } : {}),
      });
    } else {
      setLabel(participant.label);
      setTrigram(participant.trigram ?? '');
    }
  };

  const saveOrder = () => {
    if (!canEdit) return;
    const n = Number(order);
    if (!isNaN(n) && n !== participant.order) {
      updateParticipant(eventId, participant.id, { order: n });
    }
  };

  const toggleActive = async () => {
    if (!canEdit || disableActions) return;
    const nextActive = !active;
    setActive(nextActive);
    try {
      await updateParticipant(eventId, participant.id, { active: nextActive });
    } catch {
      setActive(participant.active !== false);
    }
  };

  return (
    <div
      className={`participant-row${isDragging ? ' participant-row-dragging' : ''}${active ? '' : ' participant-row-inactive'}`}
      onDragEnter={() => onDragEnter(participant.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {canEdit && (
        <button
          className="participant-drag-handle"
          type="button"
          draggable
          onDragStart={(event) => onDragStart(participant.id, event)}
          onDragEnd={onDragEnd}
          title="Glisser pour réordonner"
          disabled={disableActions}
        >
          <span />
          <span />
          <span />
        </button>
      )}
      <input
        className="participant-order-input"
        type="number"
        value={order}
        onChange={(e) => canEdit && !disableActions && setOrder(e.target.value)}
        onBlur={saveOrder}
        min="1"
        title="Ordre de passage"
        readOnly={!canEdit || disableActions}
      />
      <input
        className="stream-label-input participant-label-input"
        value={label}
        onChange={(e) => canEdit && !disableActions && setLabel(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        readOnly={!canEdit || disableActions}
      />
      {isFootball && (
        <input
          className="participant-order-input participant-trigram-input"
          value={trigram}
          onChange={(e) => canEdit && !disableActions && setTrigram(normalizeTeamTrigram(e.target.value))}
          onBlur={saveLabel}
          maxLength={4}
          title="Trigramme"
          readOnly={!canEdit || disableActions}
        />
      )}
      {canEdit && (
        <button
          className={`btn btn-sm ${active ? 'btn-secondary' : 'btn-primary'}`}
          type="button"
          onClick={toggleActive}
          disabled={disableActions}
        >
          {active ? 'Désactiver' : 'Réactiver'}
        </button>
      )}
      {canEdit && (
        <button
          className="btn btn-danger btn-sm"
          onClick={() => deleteParticipant(eventId, participant.id)}
          disabled={disableActions}
        >
          Supprimer
        </button>
      )}
    </div>
  );
}
