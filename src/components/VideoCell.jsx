import { useRef, useState, useEffect } from 'react';

/**
 * Compute iframe position and CSS transform.
 *
 * portrait        → no rotation, video contained in the cell (black bars on sides)
 * landscape-ccw   → rotate -90° (phone held left side down), scale to fill cell
 * landscape-cw    → rotate +90° (phone held right side down), scale to fill cell
 *
 * The rotation only applies when the iframe is taller than wide (portrait-encoded).
 * If the iframe is already landscape-shaped, just scale it to fit.
 */
function computeTransform(cellW, cellH, origW, origH, orientation) {
  // Normalise legacy 'landscape' value
  const norm = orientation === 'landscape' ? 'landscape-ccw' : (orientation ?? 'portrait');

  const needsRotation =
    (norm === 'landscape-ccw' || norm === 'landscape-cw') && origH > origW;

  if (needsRotation) {
    // After 90° rotation the visual box is origH wide × origW tall.
    const scale = Math.min(cellW / origH, cellH / origW);
    const deg   = norm === 'landscape-cw' ? 90 : -90;
    // Center the unrotated iframe so that its center coincides with the cell center.
    const left = (cellW - origW) / 2;
    const top  = (cellH - origH) / 2;
    return { left, top, transform: `rotate(${deg}deg) scale(${scale})` };
  }

  // No rotation: contain the video in the cell.
  const scale = Math.min(cellH / origH, cellW / origW);
  const left  = (cellW - origW) / 2;
  const top   = (cellH - origH) / 2;
  return { left, top, transform: `scale(${scale})` };
}

export default function VideoCell({ stream, slotIndex }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState(null);

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
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{`Emplacement ${slotIndex + 1}`}</span>
        </div>
      );
    }
    if (!size) {
      return <div className="video-empty"><span>Chargement…</span></div>;
    }

    const orientation = stream.orientation ?? 'portrait';
    const origW = stream.originalWidth  ?? 267;
    const origH = stream.originalHeight ?? 476;

    const { left, top, transform } = computeTransform(
      size.width, size.height, origW, origH, orientation
    );

    return (
      <iframe
        key={`${stream.id}-${orientation}-${origW}x${origH}`}
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
    </div>
  );
}
