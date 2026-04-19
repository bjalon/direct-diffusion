import { useEffect, useMemo, useState } from 'react';
import { useEventContext } from '../context/EventContext';
import {
  addGoalEvent,
  addHighlightEvent,
  claimScoreStation,
  releaseScoreStation,
  subscribeScoreStation,
  subscribeFootballEvents,
  subscribeMatches,
} from '../firebase/football';
import { subscribeParticipants } from '../firebase/participants';
import {
  enrichMatches,
  FOOTBALL_HIGHLIGHT_CODE_SUGGESTIONS,
  formatClientTimestamp,
} from '../utils/football';

function createGoalDialog(match, teamId, clickedAtClientMs) {
  return {
    open: true,
    kind: 'goal',
    matchId: match?.id || '',
    teamId: teamId || '',
    clickedAtClientMs,
    playerNumber: '',
    ownGoal: false,
    comment: '',
    code: '',
  };
}

function createHighlightDialog(match, clickedAtClientMs) {
  return {
    open: true,
    kind: 'highlight',
    matchId: match?.id || '',
    teamId: '',
    clickedAtClientMs,
    playerNumber: '',
    ownGoal: false,
    comment: '',
    code: FOOTBALL_HIGHLIGHT_CODE_SUGGESTIONS[0],
  };
}

export default function FootballScorePage({
  currentUser,
  access,
  canAdminister = false,
}) {
  const { event } = useEventContext();
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [footballEvents, setFootballEvents] = useState([]);
  const [currentScoreStation, setCurrentScoreStation] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState({ open: false });

  useEffect(() => subscribeParticipants(event.id, setTeams), [event.id]);
  useEffect(() => subscribeMatches(event.id, setMatches), [event.id]);
  useEffect(() => subscribeFootballEvents(event.id, setFootballEvents), [event.id]);
  useEffect(() => subscribeScoreStation(event.id, selectedMatchId, setCurrentScoreStation), [event.id, selectedMatchId]);

  const matchesWithScores = useMemo(
    () => enrichMatches(matches, teams, footballEvents),
    [footballEvents, matches, teams],
  );
  const selectedMatch = useMemo(
    () => matchesWithScores.find((match) => match.id === selectedMatchId) ?? null,
    [matchesWithScores, selectedMatchId],
  );

  useEffect(() => {
    if (matchesWithScores.length === 0) {
      setSelectedMatchId('');
      return;
    }

    const nextSelectedMatch = matchesWithScores.find((match) => match.id === selectedMatchId);
    if (nextSelectedMatch) return;

    const preferred = matchesWithScores.find((match) => match.status === 'live') ?? matchesWithScores[0];
    setSelectedMatchId(preferred.id);
  }, [matchesWithScores, selectedMatchId]);

  const ownsScoreStation = currentScoreStation?.assignedUid === currentUser?.uid;
  const canClaimScore = !canAdminister && !!access?.score;
  const canScore = canAdminister || ownsScoreStation;
  const canComment = canAdminister || !!access?.commentator || ownsScoreStation;
  const recentMatchEvents = useMemo(
    () => [...(selectedMatch?.matchEvents ?? [])].reverse(),
    [selectedMatch?.matchEvents],
  );

  const clearMessages = () => {
    setFeedback('');
    setError('');
  };

  const handleClaimScoreStation = async () => {
    if (!canClaimScore || !selectedMatchId) return;
    clearMessages();
    setBusy('claim-score');
    try {
      await claimScoreStation(event.id, selectedMatchId, {
        uid: currentUser.uid,
        email: access?.email || currentUser?.email || '',
      });
      setFeedback('Poste score réservé.');
    } catch (claimError) {
      setError(claimError?.code ? `Erreur : ${claimError.code}` : claimError?.message || 'Impossible de réserver le poste score.');
    } finally {
      setBusy('');
    }
  };

  const handleReleaseScoreStation = async () => {
    if (!selectedMatchId) return;
    clearMessages();
    setBusy('release-score');
    try {
      await releaseScoreStation(event.id, selectedMatchId);
      setFeedback('Poste score libéré.');
    } catch (releaseError) {
      setError(releaseError?.code ? `Erreur : ${releaseError.code}` : releaseError?.message || 'Impossible de libérer le poste score.');
    } finally {
      setBusy('');
    }
  };

  const openGoalDialog = (teamId) => {
    if (!selectedMatch) return;
    clearMessages();
    setDialog(createGoalDialog(selectedMatch, teamId, Date.now()));
  };

  const openHighlightDialog = () => {
    if (!selectedMatch) return;
    clearMessages();
    setDialog(createHighlightDialog(selectedMatch, Date.now()));
  };

  const handleSaveDialog = async () => {
    if (!selectedMatch) return;
    clearMessages();
    setBusy('save-football-event');

    try {
      if (dialog.kind === 'goal') {
        await addGoalEvent(event.id, {
          matchId: selectedMatch.id,
          teamId: dialog.teamId,
          playerNumber: dialog.playerNumber.trim(),
          ownGoal: dialog.ownGoal,
          comment: dialog.comment.trim(),
          clickedAtClientMs: dialog.clickedAtClientMs,
          createdByUid: currentUser.uid,
          createdByLabel: access?.email || currentUser?.email || currentUser?.uid || '',
        });
        setFeedback('But enregistré.');
      } else {
        if (!dialog.code.trim()) {
          throw new Error('Le code de la belle action est requis.');
        }
        await addHighlightEvent(event.id, {
          matchId: selectedMatch.id,
          teamId: dialog.teamId,
          code: dialog.code.trim(),
          comment: dialog.comment.trim(),
          clickedAtClientMs: dialog.clickedAtClientMs,
          createdByUid: currentUser.uid,
          createdByLabel: access?.email || currentUser?.email || currentUser?.uid || '',
        });
        setFeedback('Belle action enregistrée.');
      }
      setDialog({ open: false });
    } catch (saveError) {
      setError(saveError?.code ? `Erreur : ${saveError.code}` : saveError?.message || "Impossible d'enregistrer cet événement.");
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="config-page">
      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Score</h2>
          <span className="admin-counter">{matchesWithScores.length}</span>
        </div>
        <p className="hint">
          Le poste score garde l’exclusivité des buts. Les commentateurs peuvent ajouter des belles actions et des commentaires.
        </p>
        {feedback && <div className="admin-feedback">{feedback}</div>}
        {error && <div className="form-error">{error}</div>}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Poste score</h2>
          <div className="admin-actions">
            {canClaimScore && !ownsScoreStation && !currentScoreStation?.assignedUid && (
              <button className="btn btn-primary btn-sm" type="button" onClick={handleClaimScoreStation} disabled={busy === 'claim-score'}>
                {busy === 'claim-score' ? 'Réservation…' : 'Prendre le poste score pour cette rencontre'}
              </button>
            )}
            {(ownsScoreStation || canAdminister) && currentScoreStation?.assignedUid && (
              <button className="btn btn-secondary btn-sm" type="button" onClick={handleReleaseScoreStation} disabled={busy === 'release-score'}>
                {busy === 'release-score' ? 'Libération…' : 'Libérer le poste score de cette rencontre'}
              </button>
            )}
          </div>
        </div>
        <div className="results-status-card">
          <div className="results-status-line"><strong>Score:</strong> {currentScoreStation?.email || 'non attribué pour cette rencontre'}</div>
          <div className="results-status-line"><strong>Commentaire:</strong> {canComment ? 'autorisé' : 'non autorisé'}</div>
        </div>
      </section>

      <section className="config-section">
        <label className="admin-form-field">
          <span>Rencontre</span>
          <select
            className="form-input"
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
          >
            {matchesWithScores.length === 0 ? (
              <option value="">Aucune rencontre</option>
            ) : (
              matchesWithScores.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.homeLabel} vs {match.awayLabel}
                </option>
              ))
            )}
          </select>
        </label>

        {selectedMatch ? (
          <div className="football-scoreboard">
            <div className="football-scoreboard-team">
              <span className="football-scoreboard-trigram">{selectedMatch.homeTrigram}</span>
              <span className="football-scoreboard-name">{selectedMatch.homeLabel}</span>
            </div>
            <div className="football-scoreboard-score">{selectedMatch.homeScore} - {selectedMatch.awayScore}</div>
            <div className="football-scoreboard-team football-scoreboard-team-right">
              <span className="football-scoreboard-trigram">{selectedMatch.awayTrigram}</span>
              <span className="football-scoreboard-name">{selectedMatch.awayLabel}</span>
            </div>
          </div>
        ) : (
          <div className="stream-empty">Aucune rencontre disponible.</div>
        )}
      </section>

      {selectedMatch && (
        <section className="config-section">
          <div className="admin-section-head">
            <h2 className="section-title">Actions</h2>
          </div>
          <div className="dialog-actions">
            <button className="btn btn-primary" type="button" onClick={() => openGoalDialog(selectedMatch.homeParticipantId)} disabled={!canScore}>
              But {selectedMatch.homeTrigram}
            </button>
            <button className="btn btn-primary" type="button" onClick={() => openGoalDialog(selectedMatch.awayParticipantId)} disabled={!canScore}>
              But {selectedMatch.awayTrigram}
            </button>
            <button className="btn btn-secondary" type="button" onClick={openHighlightDialog} disabled={!canComment}>
              Belle action
            </button>
          </div>
          {!canScore && canClaimScore && currentScoreStation?.assignedUid && currentScoreStation.assignedUid !== currentUser?.uid && (
            <div className="hint">Le poste score est actuellement occupé par {currentScoreStation.email || currentScoreStation.assignedUid}.</div>
          )}
        </section>
      )}

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Derniers événements</h2>
          <span className="admin-counter">{recentMatchEvents.length}</span>
        </div>
        {recentMatchEvents.length === 0 ? (
          <div className="stream-empty">Aucun événement pour cette rencontre.</div>
        ) : (
          <div className="admin-card-list">
            {recentMatchEvents.slice(0, 12).map((entry) => (
              <article key={entry.id} className="admin-card">
                <div className="admin-card-main">
                  <div className="admin-email">
                    {entry.type === 'goal' ? 'BUT' : entry.code || 'ACTION'}
                  </div>
                  <div className="admin-subline">{formatEntryLabel(entry, selectedMatch)}</div>
                  {entry.comment && <div className="admin-subline">{entry.comment}</div>}
                  {entry.createdByLabel && <div className="admin-subline">par {entry.createdByLabel}</div>}
                  <div className="admin-subline">{formatClientTimestamp(entry.clickedAtClientMs)}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dialog.open && selectedMatch && (
        <div className="dialog-overlay" onClick={() => setDialog({ open: false })}>
          <div className="dialog admin-run-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{dialog.kind === 'goal' ? 'Enregistrer un but' : 'Enregistrer une belle action'}</div>
            <div className="dialog-desc">
              Timestamp capturé à {formatClientTimestamp(dialog.clickedAtClientMs)}.
            </div>

            {dialog.kind === 'goal' ? (
              <>
                <label className="admin-form-field">
                  <span>Joueur</span>
                  <input
                    className="form-input"
                    value={dialog.playerNumber}
                    onChange={(e) => setDialog((prev) => ({ ...prev, playerNumber: e.target.value }))}
                    placeholder="Numéro ou nom"
                  />
                </label>
                <label className="admin-role-pill">
                  <input
                    type="checkbox"
                    checked={dialog.ownGoal}
                    onChange={(e) => setDialog((prev) => ({ ...prev, ownGoal: e.target.checked }))}
                  />
                  <span>CSC</span>
                </label>
              </>
            ) : (
              <>
                <label className="admin-form-field">
                  <span>Code</span>
                  <input
                    className="form-input"
                    value={dialog.code}
                    maxLength={5}
                    onChange={(e) => setDialog((prev) => ({ ...prev, code: e.target.value.toUpperCase().slice(0, 5) }))}
                    placeholder="BUT / DEF / DRIB"
                  />
                </label>
                <div className="dialog-actions">
                  {FOOTBALL_HIGHLIGHT_CODE_SUGGESTIONS.map((code) => (
                    <button
                      key={code}
                      className={`btn btn-secondary btn-sm${dialog.code === code ? ' active' : ''}`}
                      type="button"
                      onClick={() => setDialog((prev) => ({ ...prev, code }))}
                    >
                      {code}
                    </button>
                  ))}
                </div>
                <label className="admin-form-field">
                  <span>Équipe</span>
                  <select
                    className="form-input"
                    value={dialog.teamId}
                    onChange={(e) => setDialog((prev) => ({ ...prev, teamId: e.target.value }))}
                  >
                    <option value="">Aucune</option>
                    <option value={selectedMatch.homeParticipantId}>{selectedMatch.homeLabel}</option>
                    <option value={selectedMatch.awayParticipantId}>{selectedMatch.awayLabel}</option>
                  </select>
                </label>
              </>
            )}

            <label className="admin-form-field">
              <span>Commentaire</span>
              <textarea
                className="form-textarea"
                rows={4}
                value={dialog.comment}
                onChange={(e) => setDialog((prev) => ({ ...prev, comment: e.target.value }))}
                placeholder="Commentaire libre"
              />
            </label>

            <div className="dialog-actions">
              <button className="btn btn-primary" type="button" onClick={handleSaveDialog} disabled={busy === 'save-football-event'}>
                {busy === 'save-football-event' ? 'Enregistrement…' : 'Valider'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setDialog({ open: false })}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatEntryLabel(entry, match) {
  const team = entry.teamId === match.homeParticipantId
    ? match.homeTrigram
    : entry.teamId === match.awayParticipantId
      ? match.awayTrigram
      : '—';

  if (entry.type === 'goal') {
    const player = entry.playerNumber ? ` • ${entry.playerNumber}` : '';
    const ownGoal = entry.ownGoal ? ' • CSC' : '';
    return `${team}${player}${ownGoal}`;
  }

  return team !== '—' ? team : 'Toutes équipes';
}
