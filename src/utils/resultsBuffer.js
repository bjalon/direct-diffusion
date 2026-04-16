const PREFIX = 'direct-diffusion-result-buffer';

function keyFor(runId) {
  return `${PREFIX}:${runId}`;
}

export function loadStartBuffer(runId) {
  if (!runId) return [];

  try {
    const raw = localStorage.getItem(keyFor(runId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStartBuffer(runId, clicks) {
  if (!runId) return;
  localStorage.setItem(keyFor(runId), JSON.stringify(clicks));
}

export function clearStartBuffer(runId) {
  if (!runId) return;
  localStorage.removeItem(keyFor(runId));
}

export function createClickEntry() {
  const clickedAtClientMs = Date.now();
  return {
    clickId: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${clickedAtClientMs}-${Math.random().toString(36).slice(2, 8)}`,
    clickedAtClientMs,
    clickedAtClientIso: new Date(clickedAtClientMs).toISOString(),
  };
}

export function formatDurationMs(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '0.000';
  return (durationMs / 1000).toFixed(3);
}
