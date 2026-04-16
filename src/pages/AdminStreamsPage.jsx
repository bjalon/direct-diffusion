import { useEffect, useState } from 'react';
import { subscribeStreams, saveStreams } from '../firebase/streams';
import { parseInput } from '../utils/iframeParser';
import { createLogger } from '../utils/logger';
import { generateId } from '../utils/storage';

const log = createLogger('AdminStreamsPage');

const ROTATION_OPTIONS = [
  { value: 0, label: '0°', title: 'Pas de rotation' },
  { value: 90, label: '+90°', title: 'Rotation +90° (sens horaire)' },
  { value: -90, label: '−90°', title: 'Rotation −90° (sens antihoraire)' },
  { value: 180, label: '180°', title: 'Retournement' },
];

function streamRotation(stream) {
  if (typeof stream.rotation === 'number') return stream.rotation;
  const legacy = { 'landscape-ccw': -90, 'landscape-cw': 90, landscape: -90, portrait: 0 };
  return legacy[stream.orientation] ?? 0;
}

function RotationPicker({ value, onChange }) {
  return (
    <div className="orientation-toggle">
      {ROTATION_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`orient-btn${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
          title={opt.title}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminStreamsPage() {
  const [streams, setStreams] = useState([]);
  const [busyKey, setBusyKey] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [dialogState, setDialogState] = useState({
    open: false,
    mode: 'create',
    streamId: '',
    label: '',
    input: '',
    rotation: 0,
  });

  useEffect(() => subscribeStreams(setStreams), []);

  const closeDialog = () => {
    setDialogState({
      open: false,
      mode: 'create',
      streamId: '',
      label: '',
      input: '',
      rotation: 0,
    });
    setError('');
  };

  const openCreateDialog = () => {
    setDialogState({
      open: true,
      mode: 'create',
      streamId: '',
      label: '',
      input: '',
      rotation: 0,
    });
    setError('');
    setFeedback('');
  };

  const openEditDialog = (stream) => {
    setDialogState({
      open: true,
      mode: 'edit',
      streamId: stream.id,
      label: stream.label || '',
      input: stream.videoUrl || '',
      rotation: streamRotation(stream),
    });
    setError('');
    setFeedback('');
  };

  const handleDialogInputChange = (value) => {
    setDialogState((prev) => ({ ...prev, input: value }));
    setError('');
    if (value.trim()) {
      const parsed = parseInput(value);
      if (parsed) {
        setDialogState((prev) => ({
          ...prev,
          rotation: parsed.originalHeight > parsed.originalWidth ? -90 : 0,
        }));
      }
    }
  };

  const persistStreams = async (nextStreams, successMessage, busyId) => {
    setBusyKey(busyId);
    setFeedback('');
    setError('');
    try {
      await saveStreams(nextStreams);
      setFeedback(successMessage);
    } catch (err) {
      setError(getErrorLabel(err));
    } finally {
      setBusyKey('');
    }
  };

  const handleSaveDialog = async () => {
    const parsed = parseInput(dialogState.input);
    if (!parsed) {
      setError('Format invalide. Collez un lien Facebook ou un code iframe complet.');
      return;
    }

    const label = dialogState.label.trim() || `Flux ${streams.filter((stream) => !stream.type).length + (dialogState.mode === 'create' ? 1 : 0)}`;

    if (dialogState.mode === 'edit') {
      const nextStreams = streams.map((stream) => (stream.id === dialogState.streamId ? {
        ...stream,
        label,
        src: parsed.src,
        videoUrl: parsed.videoUrl,
        rotation: dialogState.rotation,
        originalWidth: parsed.originalWidth,
        originalHeight: parsed.originalHeight,
      } : stream));
      log.info('updating admin stream', { streamId: dialogState.streamId });
      await persistStreams(nextStreams, `Flux mis à jour : ${label}.`, `save:${dialogState.streamId}`);
      closeDialog();
      return;
    }

    const nextStream = {
      id: generateId(),
      label,
      src: parsed.src,
      videoUrl: parsed.videoUrl,
      rotation: dialogState.rotation,
      originalWidth: parsed.originalWidth,
      originalHeight: parsed.originalHeight,
    };
    log.info('creating admin stream', { label });
    await persistStreams([...streams, nextStream], `Flux ajouté : ${label}.`, 'create-stream');
    closeDialog();
  };

  const handleDelete = async (streamId, label) => {
    const nextStreams = streams.filter((stream) => stream.id !== streamId);
    log.info('deleting admin stream', { streamId });
    await persistStreams(nextStreams, `Flux supprimé : ${label}.`, `delete:${streamId}`);
  };

  const videoStreams = streams.filter((stream) => !stream.type);

  return (
    <div className="config-page">
      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Flux admin</h2>
          <span className="admin-counter">{videoStreams.length}</span>
        </div>
        <p className="hint">
          Cette vue gère les flux vidéo stockés dans Firebase. Toute modification est partagée avec tous les utilisateurs disposant de l’accès aux flux.
        </p>
        {feedback && <div className="admin-feedback">{feedback}</div>}
        {error && !dialogState.open && <div className="form-error">{error}</div>}
      </section>

      <section className="config-section">
        <div className="admin-section-head">
          <h2 className="section-title">Flux vidéo</h2>
        </div>
        {videoStreams.length === 0 ? (
          <div className="stream-empty">Aucun flux vidéo configuré.</div>
        ) : (
          <div className="stream-list">
            {videoStreams.map((stream) => (
              <div key={stream.id} className="stream-item">
                <div className="stream-thumb" title="Flux Facebook">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.582 6.186a2.506 2.506 0 0 0-1.765-1.77C18.254 4 12 4 12 4s-6.254 0-7.817.416a2.506 2.506 0 0 0-1.765 1.77C2 7.757 2 12 2 12s0 4.243.418 5.814a2.506 2.506 0 0 0 1.765 1.77C5.746 20 12 20 12 20s6.254 0 7.817-.416a2.506 2.506 0 0 0 1.765-1.77C22 16.243 22 12 22 12s0-4.243-.418-5.814zM10 15.464V8.536L16 12l-6 3.464z" />
                  </svg>
                </div>
                <div className="stream-info">
                  <div className="stream-label-input" style={{ cursor: 'default' }}>{stream.label}</div>
                  <div className="stream-url" title={stream.videoUrl}>{stream.videoUrl}</div>
                  <div className="admin-subline">Rotation : {streamRotation(stream)}°</div>
                </div>
                <div className="admin-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => openEditDialog(stream)}
                    disabled={busyKey !== '' && busyKey !== `save:${stream.id}`}
                  >
                    Modifier
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    onClick={() => handleDelete(stream.id, stream.label)}
                    disabled={busyKey !== '' && busyKey !== `delete:${stream.id}`}
                  >
                    {busyKey === `delete:${stream.id}` ? 'Suppression…' : 'Supprimer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary" type="button" onClick={openCreateDialog}>
          + Ajouter un flux
        </button>
      </section>

      {dialogState.open && (
        <div className="dialog-overlay">
          <div className="dialog stream-dialog">
            <div className="dialog-title">
              {dialogState.mode === 'edit' ? 'Modifier le flux' : 'Ajouter un flux'}
            </div>
            <div className="dialog-desc">
              Définissez le nom, l’URL Facebook ou l’iframe, puis l’orientation du flux.
            </div>

            <label className="form-label">Nom du flux</label>
            <input
              className="form-input"
              placeholder="Ex : Caméra principale"
              value={dialogState.label}
              onChange={(e) => setDialogState((prev) => ({ ...prev, label: e.target.value }))}
            />

            <label className="form-label">Lien ou code iframe Facebook</label>
            <textarea
              className="form-textarea"
              placeholder={'Lien Facebook :\nhttps://www.facebook.com/xxx/videos/yyy/\n\nou code iframe complet :\n<iframe src="https://www.facebook.com/plugins/video.php?..." ...>'}
              value={dialogState.input}
              onChange={(e) => handleDialogInputChange(e.target.value)}
              rows={6}
              spellCheck={false}
            />

            <label className="form-label">Orientation</label>
            <RotationPicker
              value={dialogState.rotation}
              onChange={(value) => setDialogState((prev) => ({ ...prev, rotation: value }))}
            />

            {error && <div className="form-error">{error}</div>}

            <div className="dialog-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleSaveDialog}
                disabled={busyKey === 'create-stream' || busyKey === `save:${dialogState.streamId}`}
              >
                {busyKey === 'create-stream' || busyKey === `save:${dialogState.streamId}`
                  ? 'Enregistrement…'
                  : dialogState.mode === 'edit' ? 'Enregistrer' : 'Ajouter'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={closeDialog}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getErrorLabel(error) {
  return error?.code ? `Erreur : ${error.code}` : error?.message || 'Une erreur est survenue.';
}
