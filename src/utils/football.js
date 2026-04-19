export const FOOTBALL_LIGHT_ROLE_KEYS = ['tv', 'score', 'commentator'];

export const FOOTBALL_LIGHT_ROLE_LABELS = {
  tv: 'TV',
  score: 'Score',
  commentator: 'Commentateur',
};

export const FOOTBALL_HIGHLIGHT_CODE_SUGGESTIONS = ['BUT', 'DEF', 'DRIB', 'PASS', 'PARA'];

export const FOOTBALL_MATCH_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'A venir' },
  { value: 'live', label: 'En cours' },
  { value: 'finished', label: 'Terminé' },
];

export function normalizeFootballRoles(data = {}) {
  const tv = !!data.tv;
  const score = tv ? false : !!data.score;
  const commentator = tv ? false : !!data.commentator;
  return {
    tv,
    score,
    commentator,
  };
}

export function normalizeTeamTrigram(value) {
  return (value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}

export function teamDisplayName(team) {
  return team?.label || 'Equipe';
}

export function teamTrigram(team) {
  return normalizeTeamTrigram(team?.trigram) || teamDisplayName(team).slice(0, 3).toUpperCase();
}

export function buildTeamsById(teams) {
  return Object.fromEntries((teams ?? []).map((team) => [team.id, team]));
}

export function deriveMatchScore(match, footballEvents = []) {
  const relevantEvents = (footballEvents ?? [])
    .filter((entry) => entry.active !== false && entry.matchId === match.id)
    .sort((a, b) => (a.clickedAtClientMs ?? 0) - (b.clickedAtClientMs ?? 0));

  let homeScore = 0;
  let awayScore = 0;

  relevantEvents.forEach((entry) => {
    if (entry.type !== 'goal') return;
    if (entry.teamId === match.homeParticipantId) {
      if (entry.ownGoal && match.awayParticipantId) {
        awayScore += 1;
      } else {
        homeScore += 1;
      }
      return;
    }

    if (entry.teamId === match.awayParticipantId) {
      if (entry.ownGoal && match.homeParticipantId) {
        homeScore += 1;
      } else {
        awayScore += 1;
      }
    }
  });

  return {
    homeScore,
    awayScore,
    relevantEvents,
  };
}

export function enrichMatches(matches = [], teams = [], footballEvents = []) {
  const teamsById = buildTeamsById(teams);

  return matches.map((match) => {
    const homeTeam = teamsById[match.homeParticipantId] ?? null;
    const awayTeam = teamsById[match.awayParticipantId] ?? null;
    const score = deriveMatchScore(match, footballEvents);

    return {
      ...match,
      homeTeam,
      awayTeam,
      homeTrigram: teamTrigram(homeTeam),
      awayTrigram: teamTrigram(awayTeam),
      homeLabel: teamDisplayName(homeTeam),
      awayLabel: teamDisplayName(awayTeam),
      homeScore: score.homeScore,
      awayScore: score.awayScore,
      matchEvents: score.relevantEvents,
    };
  });
}

export function footballOverlayByStream(matches = [], teams = [], footballEvents = []) {
  return Object.fromEntries(
    enrichMatches(matches, teams, footballEvents)
      .filter((match) => match.streamId && match.showScoreOverlay)
      .map((match) => [
        match.streamId,
        {
          matchId: match.id,
          homeTrigram: match.homeTrigram,
          awayTrigram: match.awayTrigram,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        },
      ]),
  );
}

export function footballAccessLabel(access) {
  if (!access) return '';
  if (access.tv) return 'TV';
  if (access.score && access.commentator) return 'Score + commentaire';
  if (access.score) return 'Score';
  if (access.commentator) return 'Commentaire';
  return 'Accès léger';
}

export function formatClientTimestamp(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}
