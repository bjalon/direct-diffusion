import { useState, useCallback, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { loadConfig, saveConfig, hasSavedConfig } from './utils/storage';
import { buildSrcFromUrl } from './utils/iframeParser';
import NavBar from './components/NavBar';
import DisplayPage from './pages/DisplayPage';
import ConfigPage from './pages/ConfigPage';
import StartupDialog from './components/StartupDialog';

/** Map legacy orientation string → rotation degrees. */
function orientationToRotation(orientation) {
  const map = { 'landscape-ccw': -90, 'landscape-cw': 90, 'landscape': -90, 'portrait': 0 };
  return map[orientation] ?? 0;
}

/**
 * Normalise a raw entry from streams.json into a full stream object.
 *
 * Accepted JSON fields:
 *   id                          – stable identifier (required)
 *   url                         – Facebook video page URL (required unless src provided)
 *   label                       – display name (optional, defaults to url)
 *   rotation                    – degrees: 0 | 90 | -90 | 180  (preferred)
 *   orientation                 – legacy string, converted to rotation if rotation absent
 *   originalWidth/originalHeight – iframe dimensions (optional, default 267×476)
 *   src                         – pre-built plugin URL (overrides url)
 *
 * Returns null if the entry cannot be normalised.
 */
function normaliseStream(raw) {
  if (!raw || !raw.id) return null;

  const origW = raw.originalWidth  ?? 267;
  const origH = raw.originalHeight ?? 476;

  // Resolve rotation: prefer numeric `rotation`, fall back to legacy `orientation`.
  const rotation = typeof raw.rotation === 'number'
    ? raw.rotation
    : orientationToRotation(raw.orientation);

  const base = { id: raw.id, rotation, originalWidth: origW, originalHeight: origH };

  if (raw.src) {
    return {
      ...base,
      label:    raw.label ?? raw.videoUrl ?? raw.src,
      src:      raw.src,
      videoUrl: raw.videoUrl ?? raw.src,
    };
  }

  if (raw.url) {
    return {
      ...base,
      label:    raw.label ?? raw.url,
      src:      buildSrcFromUrl(raw.url, origW, origH),
      videoUrl: raw.url,
    };
  }

  return null;
}

export default function App() {
  const [config, setConfig] = useState(loadConfig);

  // null  → still loading streams.json
  // []    → no default streams found (404 or empty file)
  // [...] → default streams available
  const [defaultStreams, setDefaultStreams] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  // Fetch streams.json once at startup.
  useEffect(() => {
    const hadSavedConfig = hasSavedConfig();

    fetch('./streams.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        if (!Array.isArray(raw) || raw.length === 0) return;

        const streams = raw.map(normaliseStream).filter(Boolean);
        if (streams.length === 0) return;

        setDefaultStreams(streams);

        if (hadSavedConfig) {
          // A previous config exists → ask the user.
          setShowDialog(true);
        } else {
          // First visit: silently use JSON streams, keep layout from env default.
          setConfig((prev) => {
            const next = { ...prev, streams };
            saveConfig(next);
            return next;
          });
        }
      })
      .catch(() => {
        // streams.json missing or invalid → silently ignore.
        setDefaultStreams([]);
      });
  }, []);

  const updateConfig = useCallback((updater) => {
    setConfig((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveConfig(next);
      return next;
    });
  }, []);

  /** User chose to keep the previous (localStorage) config. */
  const handleKeep = () => setShowDialog(false);

  /**
   * User chose the default (JSON) streams.
   * Replace streams but preserve layout and slot assignments.
   */
  const handleUseDefault = () => {
    setConfig((prev) => {
      const next = { ...prev, streams: defaultStreams };
      saveConfig(next);
      return next;
    });
    setShowDialog(false);
  };

  return (
    <HashRouter>
      {showDialog && defaultStreams && (
        <StartupDialog
          defaultStreams={defaultStreams}
          onKeep={handleKeep}
          onUseDefault={handleUseDefault}
        />
      )}
      <div className="app-root">
        <NavBar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<DisplayPage config={config} />} />
            <Route
              path="/config"
              element={<ConfigPage config={config} onUpdate={updateConfig} />}
            />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
