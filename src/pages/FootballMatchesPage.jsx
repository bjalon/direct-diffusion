import { useEffect, useMemo, useState } from 'react';
import { useEventContext } from '../context/EventContext';
import { subscribeParticipants } from '../firebase/participants';
import { subscribeStreams } from '../firebase/streams';
import { createMatch, deleteMatch, subscribeFootballEvents, subscribeMatches, subscribeScoreStations, updateMatch } from '../firebase/football';
import { enrichMatches } from '../utils/football';

const EMPTY_DRAFT = {
  homeParticipantId: '',
  awayParticipantId: '',
  status: 'scheduled',
  streamId: '',
  showScoreOverlay: true,
};

export default function FootballMatchesPage({ canEdit = false }) {
  const { event } = useEventContext();
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [streams, setStreams] = useState([]);
  const [footballEvents, setFootballEvents] = useState([]);
  const [scoreStations, setScoreStations] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeParticipants(event.id, setTeams), [event.id]);
  useEffect(() => subscribeMatches(event.id, setMatches), [event.id]);
  useEffect(() => subscribeStreams(event.id, setStreams), [event.id]);
  useEffect(() => subscribeFootballEvents(event.id, setFootballEvents), [event.id]);
  useEffect(() => subscribeScoreStations(event.id, setScoreStations), [event.id]);

  const visibleStreams = useMemo(() => streams.filter((stream) => !stream.type), [streams]);
  const matchesWithScores = useMemo(
    () => enrichMatches(matches, teams, footballEvents),
    [footballEvents, matches, teams],
  );
  const liveMatches = useMemo(
    () => matchesWithScores.filter((match) => match.status === 'live'),
    [matchesWithScores],
  );
  const otherMatches = useMemo(
    () => matchesWithScores.filter((match) => match.status !== 'live'),
    [matchesWithScores],
  );

  const clearMessages = () => {
    setFeedback('');
    setError('');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    clearMessages();

    if (!draft.homeParticipantId || !draft.awayParticipantId) {
      setError('Sélectionne les deux équipes.');
      return;
    }
    if (draft.homeParticipantId === draft.awayParticipantId) {
      setError('Une rencontre doit opposer deux équipes différentes.');
      return;
    }

    const maxOrder = matches.reduce((value, match) => Math.max(value, match.order ?? 0), 0);

    setBusy('create-match');
    try {
      await createMatch(event.id, {
        ...draft,
        order: maxOrder + 1,
      });
      setDraft(EMPTY_DRAFT);
      setFeedback('Rencontre créée.');
    } catch (createError) {
      setError(createError?.code ? `Erreur : ${createError.code}` : createError?.message || 'Impossible de créer la rencontre.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Rencontres</h2>
          <span className="admin-counter">{matches.length}</span>
        </div>
        <p className="hint">
          Associe deux équipes à une rencontre, puis affecte éventuellement un flux vidéo et active l’overlay de score.
        </p>
        {feedback && <div className="admin-feedback">{feedback}</div>}
        {error && <div className="form-error">{error}</div>}
      </section>

      {canEdit && (
        <section className="config-section">
          <h2 className="section-title">Nouvelle rencontre</h2>
          <form className="admin-form-grid" onSubmit={handleCreate}>
            <label className="admin-form-field">
              <span>Équipe domicile</span>
              <select
                className="form-input"
                value={draft.homeParticipantId}
                onChange={(e) => setDraft((prev) => ({ ...prev, homeParticipantId: e.target.value }))}
              >
                <option value="">Choisir</option>
                {teams.filter((team) => team.active !== false).map((team) => (
                  <option key={team.id} value={team.id}>{team.label}</option>
                ))}
              </select>
            </label>
            <label className="admin-form-field">
              <span>Équipe extérieure</span>
              <select
                className="form-input"
                value={draft.awayParticipantId}
                onChange={(e) => setDraft((prev) => ({ ...prev, awayParticipantId: e.target.value }))}
              >
                <option value="">Choisir</option>
                {teams.filter((team) => team.active !== false).map((team) => (
                  <option key={team.id} value={team.id}>{team.label}</option>
                ))}
              </select>
            </label>
            <label className="admin-form-field">
              <span>Statut</span>
              <select
                className="form-input"
                value={draft.status}
                onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="scheduled">A venir</option>
                <option value="live">En cours</option>
                <option value="finished">Terminé</option>
              </select>
            </label>
            <label className="admin-form-field">
              <span>Flux affecté</span>
              <select
                className="form-input"
                value={draft.streamId}
                onChange={(e) => setDraft((prev) => ({ ...prev, streamId: e.target.value }))}
              >
                <option value="">Aucun</option>
                {visibleStreams.map((stream) => (
                  <option key={stream.id} value={stream.id}>{stream.label}</option>
                ))}
              </select>
            </label>
            <label className="admin-role-pill">
              <input
                type="checkbox"
                checked={draft.showScoreOverlay}
                onChange={(e) => setDraft((prev) => ({ ...prev, showScoreOverlay: e.target.checked }))}
              />
              <span>Afficher le score sur la vidéo</span>
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={busy === 'create-match'}>
                {busy === 'create-match' ? 'Création…' : 'Créer la rencontre'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="config-section">
        {matchesWithScores.length === 0 ? (
          <div className="stream-empty">Aucune rencontre configurée.</div>
        ) : (
          <>
            {liveMatches.length > 0 && (
              <>
                <div className="admin-section-head">
                  <h2 className="section-title">Rencontres en cours</h2>
                  <span className="admin-counter">{liveMatches.length}</span>
                </div>
                <div className="admin-card-list">
                  {liveMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      eventId={event.id}
                      match={match}
                      teams={teams}
                      streams={visibleStreams}
                      scoreStation={scoreStations.find((station) => station.id === match.id) ?? null}
                      canEdit={canEdit}
                      busy={busy}
                      setBusy={setBusy}
                      setFeedback={setFeedback}
                      setError={setError}
                      clearMessages={clearMessages}
                    />
                  ))}
                </div>
              </>
            )}
            {otherMatches.length > 0 && (
              <>
                <div className="admin-section-head">
                  <h2 className="section-title">{liveMatches.length > 0 ? 'Autres rencontres' : 'Rencontres'}</h2>
                  <span className="admin-counter">{otherMatches.length}</span>
                </div>
                <div className="admin-card-list">
                  {otherMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      eventId={event.id}
                      match={match}
                      teams={teams}
                      streams={visibleStreams}
                      scoreStation={scoreStations.find((station) => station.id === match.id) ?? null}
                      canEdit={canEdit}
                      busy={busy}
                      setBusy={setBusy}
                      setFeedback={setFeedback}
                      setError={setError}
                      clearMessages={clearMessages}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function MatchCard({
  eventId,
  match,
  teams,
  streams,
  scoreStation,
  canEdit,
  busy,
  setBusy,
  setFeedback,
  setError,
  clearMessages,
}) {
  const [draft, setDraft] = useState({
    order: match.order ?? 0,
    homeParticipantId: match.homeParticipantId || '',
    awayParticipantId: match.awayParticipantId || '',
    status: match.status || 'scheduled',
    streamId: match.streamId || '',
    showScoreOverlay: match.showScoreOverlay !== false,
  });

  useEffect(() => {
    setDraft({
      order: match.order ?? 0,
      homeParticipantId: match.homeParticipantId || '',
      awayParticipantId: match.awayParticipantId || '',
      status: match.status || 'scheduled',
      streamId: match.streamId || '',
      showScoreOverlay: match.showScoreOverlay !== false,
    });
  }, [match.awayParticipantId, match.homeParticipantId, match.order, match.showScoreOverlay, match.status, match.streamId]);

  const handleSave = async () => {
    if (!canEdit) return;
    clearMessages();

    if (!draft.homeParticipantId || !draft.awayParticipantId) {
      setError('Les deux équipes sont requises.');
      return;
    }
    if (draft.homeParticipantId === draft.awayParticipantId) {
      setError('Une rencontre doit opposer deux équipes différentes.');
      return;
    }

    setBusy(`save:${match.id}`);
    try {
      await updateMatch(eventId, match.id, {
        ...draft,
        order: Number(draft.order) || 0,
      });
      setFeedback(`Rencontre mise à jour : ${match.homeLabel} - ${match.awayLabel}.`);
    } catch (saveError) {
      setError(saveError?.code ? `Erreur : ${saveError.code}` : saveError?.message || 'Impossible de mettre à jour la rencontre.');
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async () => {
    if (!canEdit) return;
    clearMessages();
    setBusy(`delete:${match.id}`);
    try {
      await deleteMatch(eventId, match.id);
      setFeedback(`Rencontre supprimée : ${match.homeLabel} - ${match.awayLabel}.`);
    } catch (deleteError) {
      setError(deleteError?.code ? `Erreur : ${deleteError.code}` : deleteError?.message || 'Impossible de supprimer la rencontre.');
    } finally {
      setBusy('');
    }
  };

  return (
    <article className="admin-card">
      <div className="admin-card-main football-match-card-main">
        <div className="football-match-scoreline">
          <span>{match.homeTrigram} {match.homeScore}</span>
          <span className="football-match-separator">-</span>
          <span>{match.awayScore} {match.awayTrigram}</span>
        </div>
        <div className="admin-subline">{match.homeLabel} vs {match.awayLabel}</div>
        <div className="admin-subline">
          Statut : {match.status === 'live' ? 'En cours' : match.status === 'finished' ? 'Terminé' : 'A venir'}
        </div>
        <div className="admin-subline">
          Flux : {streams.find((stream) => stream.id === match.streamId)?.label || 'Aucun'}
        </div>
        {scoreStation?.assignedUid && (
          <div className="admin-subline">Score : {scoreStation.email || scoreStation.assignedUid}</div>
        )}
      </div>

      {canEdit && (
        <div className="football-match-editor">
          <label className="admin-form-field">
            <span>Ordre</span>
            <input
              className="form-input"
              type="number"
              value={draft.order}
              onChange={(e) => setDraft((prev) => ({ ...prev, order: e.target.value }))}
            />
          </label>
          <label className="admin-form-field">
            <span>Domicile</span>
            <select
              className="form-input"
              value={draft.homeParticipantId}
              onChange={(e) => setDraft((prev) => ({ ...prev, homeParticipantId: e.target.value }))}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.label}</option>
              ))}
            </select>
          </label>
          <label className="admin-form-field">
            <span>Extérieur</span>
            <select
              className="form-input"
              value={draft.awayParticipantId}
              onChange={(e) => setDraft((prev) => ({ ...prev, awayParticipantId: e.target.value }))}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.label}</option>
              ))}
            </select>
          </label>
          <label className="admin-form-field">
            <span>Statut</span>
            <select
              className="form-input"
              value={draft.status}
              onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="scheduled">A venir</option>
              <option value="live">En cours</option>
              <option value="finished">Terminé</option>
            </select>
          </label>
          <label className="admin-form-field">
            <span>Flux</span>
            <select
              className="form-input"
              value={draft.streamId}
              onChange={(e) => setDraft((prev) => ({ ...prev, streamId: e.target.value }))}
            >
              <option value="">Aucun</option>
              {streams.map((stream) => (
                <option key={stream.id} value={stream.id}>{stream.label}</option>
              ))}
            </select>
          </label>
          <label className="admin-role-pill">
            <input
              type="checkbox"
              checked={draft.showScoreOverlay}
              onChange={(e) => setDraft((prev) => ({ ...prev, showScoreOverlay: e.target.checked }))}
            />
            <span>Overlay score</span>
          </label>
          <div className="admin-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={handleSave} disabled={busy !== '' && busy !== `save:${match.id}`}>
              {busy === `save:${match.id}` ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button className="btn btn-danger btn-sm" type="button" onClick={handleDelete} disabled={busy !== '' && busy !== `delete:${match.id}`}>
              {busy === `delete:${match.id}` ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
