import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ADMIN_ROLE_KEYS,
  approveAccessRequest,
  deleteAllowedUser,
  rejectAccessRequest,
  saveAllowedUser,
  subscribeAccessRequests,
  subscribeAllowedUsers,
} from '../firebase/admin';
import {
  createEvent,
  EVENT_TYPE_OPTIONS,
  eventTypeLabel,
  slugifyEventTitle,
  subscribeEvents,
  updateEvent,
} from '../firebase/events';
import { buildEventRoute } from '../utils/routes';
import {
  EVENT_ICON_ACCEPT,
  EVENT_ICON_MAX_BYTES,
  getDefaultEventIconSrc,
  getEventIconSrc,
  getEventLocationLabel,
} from '../utils/eventPresentation';

const NORMAL_ROLE_LABELS = {
  administration: 'Administration',
  admin_flux: 'Flux',
  participants: 'Participants',
};

const DEFAULT_NORMAL_ROLES = {
  administration: false,
  admin_flux: false,
  participants: false,
};

function formatDateTimeLocalValue(date) {
  if (!date) return '';
  const next = date instanceof Date ? date : date?.toDate?.();
  if (!next) return '';
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  const hours = String(next.getHours()).padStart(2, '0');
  const minutes = String(next.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocalValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createEventDraft() {
  const now = new Date();
  return {
    slug: '',
    title: '',
    type: 'soapbox',
    published: true,
    promotionStartsAt: formatDateTimeLocalValue(now),
    promotionEndsAt: '',
    startsAt: '',
    endsAt: '',
    siteUrl: '',
    locationLabel: '',
    locationAddress: '',
    locationLatitude: '',
    locationLongitude: '',
    iconDataUrl: '',
  };
}

function formatHumanDate(value) {
  const date = value?.toDate?.() ?? value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getPromotionState(event) {
  const nowMs = Date.now();
  const promotionStartsAtMs = event.promotionStartsAt?.toMillis?.() ?? event.promotionStartsAt?.getTime?.() ?? 0;
  const promotionEndsAtMs = event.promotionEndsAt?.toMillis?.() ?? event.promotionEndsAt?.getTime?.() ?? 0;
  if (promotionStartsAtMs > nowMs) return 'scheduled';
  if (promotionEndsAtMs && promotionEndsAtMs < nowMs) return 'ended';
  return 'promoted';
}

function matchesFilters(event, filters) {
  const search = filters.search.trim().toLowerCase();
  if (search) {
    const haystack = `${event.title || ''} ${event.slug || event.id || ''}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (filters.type !== 'all' && event.type !== filters.type) return false;
  if (filters.visibility === 'published' && event.published === false) return false;
  if (filters.visibility === 'hidden' && event.published !== false) return false;

  const promotionState = getPromotionState(event);
  if (filters.promotion === 'promoted' && promotionState !== 'promoted') return false;
  if (filters.promotion === 'scheduled' && promotionState !== 'scheduled') return false;
  if (filters.promotion === 'ended' && promotionState !== 'ended') return false;

  return true;
}

function parseOptionalNumber(value) {
  if (value === '' || value == null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeOptionalUrl(value) {
  return (value || '').trim();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('event-icon-read-failed'));
    reader.readAsDataURL(file);
  });
}

export default function EventAdminPage({ currentUser }) {
  const [allEvents, setAllEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [allowedUsers, setAllowedUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestRoleDrafts, setRequestRoleDrafts] = useState({});
  const [draft, setDraft] = useState(createEventDraft);
  const [editingId, setEditingId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRoles, setNewRoles] = useState(DEFAULT_NORMAL_ROLES);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    visibility: 'all',
    promotion: 'all',
  });

  useEffect(() => subscribeEvents(setAllEvents, { includeUnpublished: true }), []);

  useEffect(() => {
    if (allEvents.length === 0) {
      setSelectedEventId('');
      return;
    }
    const exists = allEvents.some((event) => event.id === selectedEventId);
    if (!exists) {
      setSelectedEventId(allEvents[0].id);
    }
  }, [allEvents, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) {
      setAllowedUsers([]);
      setRequests([]);
      setRequestRoleDrafts({});
      return undefined;
    }

    const unsubAllowedUsers = subscribeAllowedUsers(selectedEventId, setAllowedUsers);
    const unsubRequests = subscribeAccessRequests(selectedEventId, setRequests);
    return () => {
      unsubAllowedUsers();
      unsubRequests();
    };
  }, [selectedEventId]);

  useEffect(() => {
    setRequestRoleDrafts((prev) => {
      const next = {};
      requests.forEach((request) => {
        next[request.email] = prev[request.email] ?? DEFAULT_NORMAL_ROLES;
      });
      return next;
    });
  }, [requests]);

  const filteredEvents = useMemo(
    () => allEvents.filter((event) => matchesFilters(event, filters)),
    [allEvents, filters],
  );
  const selectedEvent = useMemo(
    () => allEvents.find((event) => event.id === selectedEventId) ?? null,
    [allEvents, selectedEventId],
  );
  const editedEvent = useMemo(
    () => allEvents.find((event) => event.id === editingId) ?? null,
    [allEvents, editingId],
  );
  const currentEmail = currentUser?.email?.trim().toLowerCase() ?? '';
  const currentEventUserEntry = useMemo(
    () => allowedUsers.find((entry) => entry.id === currentEmail) ?? null,
    [allowedUsers, currentEmail],
  );

  const clearMessages = () => {
    setFeedback('');
    setError('');
  };

  const resetForm = () => {
    setDraft(createEventDraft());
    setEditingId('');
    setEditorOpen(false);
  };

  const finalizeEventSave = () => {
    setEditorOpen(false);
    setEditingId('');
    setDraft(createEventDraft());
  };

  const handleTitleChange = (value) => {
    setDraft((prev) => {
      const shouldUpdateSlug = !prev.slug || prev.slug === slugifyEventTitle(prev.title);
      return {
        ...prev,
        title: value,
        slug: shouldUpdateSlug ? slugifyEventTitle(value) : prev.slug,
      };
    });
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    clearMessages();

    const title = draft.title.trim();
    const slug = editingId || slugifyEventTitle(draft.slug || draft.title);
    const startsAt = parseDateTimeLocalValue(draft.startsAt);
    const promotionStartsAt = parseDateTimeLocalValue(draft.promotionStartsAt) ?? new Date();
    const promotionEndsAt = parseDateTimeLocalValue(draft.promotionEndsAt);
    const endsAt = parseDateTimeLocalValue(draft.endsAt);
    const locationLatitude = parseOptionalNumber(draft.locationLatitude);
    const locationLongitude = parseOptionalNumber(draft.locationLongitude);

    if (!title) {
      setError("Le titre de l'événement est requis.");
      return;
    }
    if (!startsAt) {
      setError("La date de début de l'événement est requise.");
      return;
    }
    if (endsAt && endsAt < startsAt) {
      setError("La date de fin doit être postérieure à la date de début.");
      return;
    }
    if (promotionEndsAt && promotionEndsAt < promotionStartsAt) {
      setError('La fin de publication doit être postérieure au début de publication.');
      return;
    }
    if ((draft.locationLatitude && locationLatitude == null) || (draft.locationLongitude && locationLongitude == null)) {
      setError('Les coordonnées GPS doivent être numériques.');
      return;
    }

    setBusy('save-event');
    try {
      const payload = {
        title,
        type: editingId ? (editedEvent?.type || draft.type) : draft.type,
        published: draft.published,
        promotionStartsAt,
        promotionEndsAt: promotionEndsAt || null,
        startsAt,
        endsAt: endsAt || null,
        siteUrl: normalizeOptionalUrl(draft.siteUrl),
        location: {
          label: draft.locationLabel.trim(),
          address: draft.locationAddress.trim(),
          latitude: locationLatitude,
          longitude: locationLongitude,
        },
        iconDataUrl: draft.iconDataUrl || '',
      };

      if (editingId) {
        await updateEvent(editingId, payload);
        finalizeEventSave();
        setFeedback(`Événement mis à jour : ${title}.`);
      } else {
        await createEvent({
          slug,
          ...payload,
        });
        finalizeEventSave();
        setFeedback(`Événement créé : ${title}.`);
      }
    } catch (saveError) {
      setError(saveError?.code ? `Erreur : ${saveError.code}` : saveError?.message || 'Impossible de sauvegarder l’événement.');
    } finally {
      setBusy('');
    }
  };

  const startEditEvent = (event) => {
    clearMessages();
    setEditingId(event.id);
    setDraft({
      slug: event.slug || event.id,
      title: event.title || '',
      type: event.type || 'soapbox',
      published: event.published !== false,
      promotionStartsAt: formatDateTimeLocalValue(event.promotionStartsAt),
      promotionEndsAt: formatDateTimeLocalValue(event.promotionEndsAt),
      startsAt: formatDateTimeLocalValue(event.startsAt),
      endsAt: formatDateTimeLocalValue(event.endsAt),
      siteUrl: event.siteUrl || '',
      locationLabel: event.location?.label || '',
      locationAddress: event.location?.address || '',
      locationLatitude: event.location?.latitude == null ? '' : String(event.location.latitude),
      locationLongitude: event.location?.longitude == null ? '' : String(event.location.longitude),
      iconDataUrl: event.iconDataUrl || '',
    });
    setEditorOpen(true);
  };

  const openCreateModal = () => {
    clearMessages();
    setDraft(createEventDraft());
    setEditingId('');
    setEditorOpen(true);
  };

  const closeEditor = () => {
    clearMessages();
    setEditorOpen(false);
    setEditingId('');
    setDraft(createEventDraft());
  };

  const handleIconChange = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Le fichier sélectionné n’est pas une image.');
      return;
    }
    if (file.size > EVENT_ICON_MAX_BYTES) {
      setError(`L’icône dépasse la taille maximale autorisée (${Math.round(EVENT_ICON_MAX_BYTES / 1024)} Ko).`);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDraft((prev) => ({ ...prev, iconDataUrl: dataUrl }));
      setError('');
    } catch (iconError) {
      setError(iconError?.message || "Impossible de charger l'icône.");
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    clearMessages();
    setBusy(`add-user:${email}`);
    try {
      await saveAllowedUser(selectedEventId, email, newRoles);
      setNewEmail('');
      setNewRoles(DEFAULT_NORMAL_ROLES);
      setFeedback(`Accès Google ajouté pour ${email} sur ${selectedEvent?.title || selectedEventId}.`);
    } catch (saveError) {
      setError(saveError?.code ? `Erreur : ${saveError.code}` : saveError?.message || 'Impossible d’ajouter ce compte.');
    } finally {
      setBusy('');
    }
  };

  const handleApproveRequest = async (email) => {
    if (!selectedEventId) return;
    clearMessages();
    setBusy(`approve:${email}`);
    try {
      await approveAccessRequest(selectedEventId, email, requestRoleDrafts[email] ?? DEFAULT_NORMAL_ROLES);
      setFeedback(`Demande Google approuvée pour ${email} sur ${selectedEvent?.title || selectedEventId}.`);
    } catch (approveError) {
      setError(approveError?.code ? `Erreur : ${approveError.code}` : approveError?.message || 'Impossible d’approuver cette demande.');
    } finally {
      setBusy('');
    }
  };

  const handleRejectRequest = async (email) => {
    if (!selectedEventId) return;
    clearMessages();
    setBusy(`reject:${email}`);
    try {
      await rejectAccessRequest(selectedEventId, email);
      setFeedback(`Demande Google refusée pour ${email} sur ${selectedEvent?.title || selectedEventId}.`);
    } catch (rejectError) {
      setError(rejectError?.code ? `Erreur : ${rejectError.code}` : rejectError?.message || 'Impossible de refuser cette demande.');
    } finally {
      setBusy('');
    }
  };

  const handleRoleToggle = async (email, role, checked) => {
    if (!selectedEventId) return;
    clearMessages();

    if (email === currentEmail && role === 'administration' && !checked) {
      setError("Vous ne pouvez pas retirer votre propre rôle d'administration sur cet événement.");
      return;
    }

    const entry = allowedUsers.find((user) => user.id === email);
    if (!entry) return;

    setBusy(`role:${email}:${role}`);
    try {
      await saveAllowedUser(selectedEventId, email, { ...entry, [role]: checked });
      setFeedback(`Droits mis à jour pour ${email} sur ${selectedEvent?.title || selectedEventId}.`);
    } catch (toggleError) {
      setError(toggleError?.code ? `Erreur : ${toggleError.code}` : toggleError?.message || 'Impossible de modifier les droits.');
    } finally {
      setBusy('');
    }
  };

  const handleDeleteUser = async (email) => {
    if (!selectedEventId) return;
    clearMessages();

    if (email === currentEmail) {
      setError("Vous ne pouvez pas supprimer votre propre accès à cet événement.");
      return;
    }

    setBusy(`delete:${email}`);
    try {
      await deleteAllowedUser(selectedEventId, email);
      setFeedback(`Accès retiré pour ${email} sur ${selectedEvent?.title || selectedEventId}.`);
    } catch (deleteError) {
      setError(deleteError?.code ? `Erreur : ${deleteError.code}` : deleteError?.message || 'Impossible de retirer cet accès.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <div className="admin-section-head">
          <h1 className="section-title">Administration des événements</h1>
          <span className="admin-counter">{filteredEvents.length}</span>
        </div>
        <p className="hint">
          Connecté en tant que <strong>{currentUser?.email || '—'}</strong>. Cette vue gère les métadonnées
          globales des événements et leur visibilité sur la home.
        </p>
        {feedback && <div className="admin-feedback">{feedback}</div>}
        {error && <div className="form-error">{error}</div>}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Filtres</h2>
        </div>
        <div className="event-admin-filters">
          <label className="form-label">
            <span>Recherche</span>
            <input
              className="form-input"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Titre ou slug"
            />
          </label>
          <label className="form-label">
            <span>Type</span>
            <select
              className="form-input"
              value={filters.type}
              onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
            >
              <option value="all">Tous</option>
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="form-label">
            <span>Visibilité</span>
            <select
              className="form-input"
              value={filters.visibility}
              onChange={(e) => setFilters((prev) => ({ ...prev, visibility: e.target.value }))}
            >
              <option value="all">Toutes</option>
              <option value="published">Publiés</option>
              <option value="hidden">Masqués</option>
            </select>
          </label>
          <label className="form-label">
            <span>Promotion</span>
            <select
              className="form-input"
              value={filters.promotion}
              onChange={(e) => setFilters((prev) => ({ ...prev, promotion: e.target.value }))}
            >
              <option value="all">Toutes</option>
              <option value="promoted">En promotion</option>
              <option value="scheduled">Promotion future</option>
              <option value="ended">Publication terminée</option>
            </select>
          </label>
        </div>
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Édition</h2>
          <div className="admin-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={openCreateModal}>
              Nouvel événement
            </button>
          </div>
        </div>
        <p className="hint">
          La création et la modification d&apos;un événement se font maintenant dans une popin dédiée.
        </p>
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Événements</h2>
          <span className="admin-counter">{filteredEvents.length}</span>
        </div>
        {filteredEvents.length === 0 ? (
          <div className="stream-empty">Aucun événement ne correspond aux filtres.</div>
        ) : (
          <div className="admin-card-list">
            {filteredEvents.map((event) => (
              <article key={event.id} className="admin-card">
                <div className="admin-card-main event-admin-card-main">
                  <img
                    className="event-admin-card-icon"
                    src={getEventIconSrc(event)}
                    alt=""
                  />
                  <div className="event-admin-card-copy">
                  <div className="admin-email">{event.title}</div>
                  <div className="admin-subline">{event.slug || event.id}</div>
                  <div className="admin-subline">{eventTypeLabel(event.type)}</div>
                  <div className="admin-subline">Promotion {formatHumanDate(event.promotionStartsAt)}</div>
                  {event.promotionEndsAt && (
                    <div className="admin-subline">Fin publication {formatHumanDate(event.promotionEndsAt)}</div>
                  )}
                  <div className="admin-subline">Début {formatHumanDate(event.startsAt)}</div>
                  {event.endsAt && <div className="admin-subline">Fin {formatHumanDate(event.endsAt)}</div>}
                  {getEventLocationLabel(event) && (
                    <div className="admin-subline">{getEventLocationLabel(event)}</div>
                  )}
                  {event.siteUrl && (
                    <div className="admin-subline event-admin-link-line">{event.siteUrl}</div>
                  )}
                  <div className="admin-subline">
                    {event.published === false ? 'Masqué' : 'Publié'}
                    {' · '}
                    {getPromotionState(event) === 'promoted'
                      ? 'En publication'
                      : getPromotionState(event) === 'ended'
                        ? 'Publication terminée'
                        : 'Publication future'}
                  </div>
                  </div>
                </div>
                <div className="admin-actions">
                  <Link className="btn btn-secondary btn-sm" to={buildEventRoute(event.slug || event.id, 'display', event.type)}>
                    Ouvrir
                  </Link>
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                  >
                    Accès OAuth
                  </button>
                  <button className="btn btn-primary btn-sm" type="button" onClick={() => startEditEvent(event)}>
                    Éditer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Accès OAuth par événement</h2>
          <span className="admin-counter">{selectedEvent ? selectedEvent.title : '—'}</span>
        </div>
        <div className="event-admin-filters">
          <label className="form-label">
            <span>Événement</span>
            <select
              className="form-input"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {allEvents.length === 0 ? (
                <option value="">Aucun événement</option>
              ) : (
                allEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} ({event.slug || event.id})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        {!selectedEvent ? (
          <div className="stream-empty">Sélectionne un événement pour gérer ses accès OAuth.</div>
        ) : (
          <>
            <p className="hint">
              Cette section gère <code>events/{selectedEvent.id}/accessRequests</code> et
              <code> events/{selectedEvent.id}/allowedUsers</code>.
            </p>
            {currentEventUserEntry && (
              <div className="admin-banner">
                Tu disposes déjà d&apos;un accès direct sur cet événement en tant que{' '}
                <strong>{currentEventUserEntry.email ?? currentEventUserEntry.id}</strong>.
              </div>
            )}
          </>
        )}
      </section>

      {selectedEvent && (
        <>
          <section className="config-section">
            <div className="admin-section-head">
              <h2 className="section-title">Demandes Google</h2>
              <span className="admin-counter">{requests.length}</span>
            </div>
            {requests.length === 0 ? (
              <div className="stream-empty">Aucune demande Google en attente sur cet événement.</div>
            ) : (
              <div className="admin-card-list">
                {requests.map((request) => (
                  <article key={request.id} className="admin-card">
                    <div className="admin-card-main">
                      <div className="admin-email">{request.email}</div>
                      {request.displayName && <div className="admin-subline">{request.displayName}</div>}
                      <div className="admin-subline">Demandé {formatTimestamp(request.requestedAt)}</div>
                      <RoleEditor
                        roles={requestRoleDrafts[request.email] ?? DEFAULT_NORMAL_ROLES}
                        roleKeys={ADMIN_ROLE_KEYS}
                        labels={NORMAL_ROLE_LABELS}
                        disabled={busy !== '' && busy !== `approve:${request.email}`}
                        onToggle={(role, checked) => setRequestRoleDrafts((prev) => ({
                          ...prev,
                          [request.email]: {
                            ...(prev[request.email] ?? DEFAULT_NORMAL_ROLES),
                            [role]: checked,
                          },
                        }))}
                      />
                    </div>
                    <div className="admin-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleApproveRequest(request.email)}
                        disabled={busy !== '' && busy !== `approve:${request.email}`}
                      >
                        {busy === `approve:${request.email}` ? 'Validation…' : 'Approuver'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRejectRequest(request.email)}
                        disabled={busy !== '' && busy !== `reject:${request.email}`}
                      >
                        {busy === `reject:${request.email}` ? 'Refus…' : 'Refuser'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="config-section">
            <h2 className="section-title">Ajouter un compte Google</h2>
            <form className="add-stream-form" onSubmit={handleAddUser}>
              <label className="form-label" htmlFor="event-admin-new-user-email">Adresse email</label>
              <input
                id="event-admin-new-user-email"
                type="email"
                className="form-input"
                placeholder="utilisateur@exemple.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
              <RoleEditor
                roles={newRoles}
                roleKeys={ADMIN_ROLE_KEYS}
                labels={NORMAL_ROLE_LABELS}
                disabled={busy.startsWith('add-user:')}
                onToggle={(role, checked) => setNewRoles((prev) => ({ ...prev, [role]: checked }))}
              />
              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={busy.startsWith('add-user:')}>
                  {busy.startsWith('add-user:') ? 'Ajout…' : 'Ajouter'}
                </button>
              </div>
            </form>
          </section>

          <section className="config-section">
            <div className="admin-section-head">
              <h2 className="section-title">Comptes Google autorisés</h2>
              <span className="admin-counter">{allowedUsers.length}</span>
            </div>
            {allowedUsers.length === 0 ? (
              <div className="stream-empty">Aucun compte Google autorisé sur cet événement.</div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      {ADMIN_ROLE_KEYS.map((role) => <th key={role}>{NORMAL_ROLE_LABELS[role]}</th>)}
                      <th>Mise à jour</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allowedUsers.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div className="admin-email">{entry.email ?? entry.id}</div>
                          {entry.id === currentEmail && <div className="admin-subline">Compte courant</div>}
                        </td>
                        {ADMIN_ROLE_KEYS.map((role) => {
                          const key = `role:${entry.id}:${role}`;
                          const lockSelfAdmin = entry.id === currentEmail && role === 'administration';
                          return (
                            <td key={role} className="admin-cell-center">
                              <label className="admin-check">
                                <input
                                  type="checkbox"
                                  checked={!!entry[role]}
                                  disabled={(busy !== '' && busy !== key) || lockSelfAdmin}
                                  onChange={(e) => handleRoleToggle(entry.id, role, e.target.checked)}
                                />
                              </label>
                            </td>
                          );
                        })}
                        <td className="admin-updated-at">{formatTimestamp(entry.updatedAt)}</td>
                        <td className="admin-cell-actions">
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteUser(entry.id)}
                            disabled={entry.id === currentEmail || (busy !== '' && busy !== `delete:${entry.id}`)}
                          >
                            {busy === `delete:${entry.id}` ? 'Suppression…' : 'Retirer'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {editorOpen && (
        <div className="dialog-overlay" onClick={closeEditor}>
          <div className="dialog admin-run-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{editingId ? 'Modifier un événement' : 'Créer un événement'}</div>
            <div className="dialog-desc">
              Métadonnées publiques, publication sur le site, localisation et icône de l&apos;événement.
            </div>
            {error && <div className="form-error">{error}</div>}
            {feedback && <div className="admin-feedback">{feedback}</div>}
            <form className="admin-run-dialog-form" onSubmit={handleSaveEvent}>
              <div className="admin-form-grid">
                <label className="admin-form-field">
                  <span>Titre</span>
                  <input
                    className="form-input"
                    value={draft.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Ex : Caisse à savon 2026"
                  />
                </label>
                <label className="admin-form-field">
                  <span>Slug</span>
                  <input
                    className="form-input"
                    value={draft.slug}
                    onChange={(e) => setDraft((prev) => ({ ...prev, slug: slugifyEventTitle(e.target.value) }))}
                    placeholder="caisse-a-savon-2026"
                    disabled={!!editingId}
                  />
                </label>
                <label className="admin-form-field">
                  <span>Type</span>
                  <select
                    className="form-input"
                    value={draft.type}
                    onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value }))}
                    disabled={!!editingId}
                  >
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {editingId && (
                    <span className="hint">Le type d&apos;événement est figé après création.</span>
                  )}
                </label>
                <label className="admin-form-field">
                  <span>URL du site</span>
                  <input
                    className="form-input"
                    value={draft.siteUrl}
                    onChange={(e) => setDraft((prev) => ({ ...prev, siteUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                <label className="admin-form-field">
                  <span>Début de publication</span>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={draft.promotionStartsAt}
                    onChange={(e) => setDraft((prev) => ({ ...prev, promotionStartsAt: e.target.value }))}
                  />
                </label>
                <label className="admin-form-field">
                  <span>Fin de publication</span>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={draft.promotionEndsAt}
                    onChange={(e) => setDraft((prev) => ({ ...prev, promotionEndsAt: e.target.value }))}
                  />
                </label>
                <label className="admin-form-field">
                  <span>Début de l&apos;événement</span>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(e) => setDraft((prev) => ({ ...prev, startsAt: e.target.value }))}
                  />
                </label>
                <label className="admin-form-field">
                  <span>Fin de l&apos;événement</span>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={draft.endsAt}
                    onChange={(e) => setDraft((prev) => ({ ...prev, endsAt: e.target.value }))}
                  />
                </label>
                <label className="admin-form-field">
                  <span>Nom du lieu</span>
                  <input
                    className="form-input"
                    value={draft.locationLabel}
                    onChange={(e) => setDraft((prev) => ({ ...prev, locationLabel: e.target.value }))}
                    placeholder="Stade Blah"
                  />
                </label>
                <label className="admin-form-field">
                  <span>Adresse</span>
                  <input
                    className="form-input"
                    value={draft.locationAddress}
                    onChange={(e) => setDraft((prev) => ({ ...prev, locationAddress: e.target.value }))}
                    placeholder="Rue Machin, Ville"
                  />
                </label>
                <label className="admin-form-field">
                  <span>Latitude GPS</span>
                  <input
                    className="form-input"
                    value={draft.locationLatitude}
                    onChange={(e) => setDraft((prev) => ({ ...prev, locationLatitude: e.target.value }))}
                    placeholder="43.12345"
                  />
                </label>
                <label className="admin-form-field">
                  <span>Longitude GPS</span>
                  <input
                    className="form-input"
                    value={draft.locationLongitude}
                    onChange={(e) => setDraft((prev) => ({ ...prev, locationLongitude: e.target.value }))}
                    placeholder="1.23456"
                  />
                </label>
              </div>

              <div className="event-admin-icon-editor">
                <div className="event-admin-icon-preview-wrap">
                  <img
                    className="event-admin-icon-preview"
                    src={draft.iconDataUrl || getDefaultEventIconSrc(draft.type)}
                    alt=""
                  />
                </div>
                <div className="event-admin-icon-copy">
                  <div className="dialog-note">
                    Icône facultative. Si aucune image n&apos;est fournie, une icône par défaut représente le sport.
                    Taille maximale : {Math.round(EVENT_ICON_MAX_BYTES / 1024)} Ko.
                  </div>
                  <div className="dialog-actions">
                    <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                      Choisir une icône
                      <input
                        type="file"
                        accept={EVENT_ICON_ACCEPT}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          handleIconChange(file);
                        }}
                      />
                    </label>
                    {draft.iconDataUrl && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, iconDataUrl: '' }))}
                      >
                        Retirer l&apos;icône
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <label className="admin-role-pill">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) => setDraft((prev) => ({ ...prev, published: e.target.checked }))}
                />
                <span>Visible sur la home</span>
              </label>

              <div className="dialog-actions">
                <button className="btn btn-primary" type="submit" disabled={busy === 'save-event'}>
                  {busy === 'save-event' ? 'Enregistrement…' : editingId ? 'Mettre à jour' : 'Créer l’événement'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={closeEditor}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleEditor({ roles, roleKeys, labels, disabled, onToggle }) {
  return (
    <div className="admin-role-grid">
      {roleKeys.map((role) => (
        <label key={role} className="admin-role-pill">
          <input
            type="checkbox"
            checked={!!roles[role]}
            disabled={disabled}
            onChange={(e) => onToggle(role, e.target.checked)}
          />
          <span>{labels[role]}</span>
        </label>
      ))}
    </div>
  );
}

function formatTimestamp(value) {
  const date = value?.toDate?.();
  if (!date) return 'en attente';

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
