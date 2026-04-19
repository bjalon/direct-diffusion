import { useRef, useState, useEffect } from 'react';
import ResultsRotationDisplay from './displays/ResultsRotationDisplay';
import FacebookVideoEmbed from './FacebookVideoEmbed';

const VIRTUAL_COMPONENTS = {
  'results-rotation': (s) => (
    <ResultsRotationDisplay
      delay={s.delay ?? 10}
      startPause={s.startPause ?? 4}
      scrollSpeed={s.scrollSpeed ?? 28}
      endPause={s.endPause ?? 4}
    />
  ),
};

/**
 * Resolve rotation degrees from a stream object.
 * Handles both the new `rotation` number field and the legacy `orientation` string.
 */
function getRotation(stream) {
  if (typeof stream.rotation === 'number') return stream.rotation;
  // Legacy orientation values
  const legacy = { 'landscape-ccw': -90, 'landscape-cw': 90, 'landscape': -90, 'portrait': 0 };
  return legacy[stream.orientation] ?? 0;
}

/**
 * Compute position + CSS transform so the iframe is rotated and scaled to fill the cell.
 *
 * The iframe is placed with its center at the cell center.
 * transform-origin: center center ensures rotation/scale happen around that point.
 *
 * For ±90° rotations the iframe's axes swap (origH becomes the visual width),
 * so we adjust the scale formula accordingly.
 */
function computeTransform(cellW, cellH, origW, origH, rotation) {
  const isAxisSwapped = Math.abs(rotation) === 90;

  // Visual dimensions after rotation.
  const visualW = isAxisSwapped ? origH : origW;
  const visualH = isAxisSwapped ? origW : origH;

  // Contain: fit the rotated content fully inside the cell.
  const scale = Math.min(cellW / visualW, cellH / visualH);

  // Center the (unrotated) iframe so its center == cell center.
  const left = (cellW - origW) / 2;
  const top  = (cellH - origH) / 2;

  const transform = rotation === 0
    ? `scale(${scale})`
    : `rotate(${rotation}deg) scale(${scale})`;

  return { left, top, transform };
}

function isFacebookHost(value) {
  try {
    return /(^|\.)facebook\.com$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function resolveFacebookVideoUrl(stream) {
  if (stream.videoUrl && isFacebookHost(stream.videoUrl)) {
    return stream.videoUrl;
  }

  if (!stream.src || !isFacebookHost(stream.src)) {
    return null;
  }

  try {
    const url = new URL(stream.src);
    return url.searchParams.get('href') || null;
  } catch {
    return null;
  }
}

function getBroadcastBadge(stream) {
  if (stream?.broadcastState === 'live') {
    return { label: 'Live', className: 'video-broadcast-badge-live', withPulse: true };
  }
  if (stream?.broadcastState === 'replay') {
    return { label: 'Rediffusion', className: 'video-broadcast-badge-replay', withPulse: false };
  }
  return null;
}

export default function VideoCell({ stream, slotIndex, scoreOverlay = null }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState(null);
  const broadcastBadge = getBroadcastBadge(stream);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width: Math.round(width), height: Math.round(height) });
        observer.disconnect();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const renderContent = () => {
    if (!stream) {
      return (
        <div className="video-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{`Emplacement ${slotIndex + 1}`}</span>
        </div>
      );
    }

    // Virtual display (not an iframe)
    const VirtualComponent = stream.type ? VIRTUAL_COMPONENTS[stream.type] : null;
    if (VirtualComponent) {
      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          {VirtualComponent(stream)}
        </div>
      );
    }

    if (!size) {
      return <div className="video-empty"><span>Chargement…</span></div>;
    }

    const rotation = getRotation(stream);
    const origW = stream.originalWidth  ?? 267;
    const origH = stream.originalHeight ?? 476;

    const { left, top, transform } = computeTransform(
      size.width, size.height, origW, origH, rotation
    );
    const facebookVideoUrl = resolveFacebookVideoUrl(stream);

    if (facebookVideoUrl) {
      return (
        <div
          key={`${stream.id}-${slotIndex}-${rotation}-${origW}x${origH}`}
          style={{
            position: 'absolute',
            left: `${left}px`,
            top: `${top}px`,
            width: `${origW}px`,
            height: `${origH}px`,
            display: 'block',
            transformOrigin: 'center center',
            transform,
            overflow: 'hidden',
          }}
        >
          <FacebookVideoEmbed
            embedKey={`${stream.id}-${slotIndex}`}
            videoUrl={facebookVideoUrl}
            width={origW}
            height={origH}
            fallbackSrc={stream.src}
            autoplay
            loop
          />
        </div>
      );
    }

    return (
      <iframe
        key={`${stream.id}-${rotation}-${origW}x${origH}`}
        src={stream.src}
        width={origW}
        height={origH}
        style={{
          position: 'absolute',
          left: `${left}px`,
          top: `${top}px`,
          border: 'none',
          display: 'block',
          transformOrigin: 'center center',
          transform,
        }}
        scrolling="no"
        frameBorder="0"
        allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      />
    );
  };

  return (
    <div ref={containerRef} className="video-cell">
      {renderContent()}
      {scoreOverlay && (
        <div className="video-score-overlay">
          <span className="video-score-team">{scoreOverlay.homeTrigram}</span>
          <span className="video-score-value">{scoreOverlay.homeScore}</span>
          <span className="video-score-separator">-</span>
          <span className="video-score-value">{scoreOverlay.awayScore}</span>
          <span className="video-score-team">{scoreOverlay.awayTrigram}</span>
        </div>
      )}
      {broadcastBadge && (
        <div className={`video-broadcast-badge ${broadcastBadge.className}`}>
          {broadcastBadge.withPulse && <span className="video-broadcast-dot" />}
          <span>{broadcastBadge.label}</span>
        </div>
      )}
    </div>
  );
}
