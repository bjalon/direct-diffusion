import { useRef, useState, useEffect } from 'react';

/**
 * Compute CSS transform to scale the iframe (at its original dimensions) within the cell.
 *
 * landscape → "cover" horizontally: fill cell width, clip height if needed (like object-fit: cover)
 * portrait  → "contain": show the full video, centered, with black bars if needed (like object-fit: contain)
 */
function computeTransform(cellW, cellH, origW, origH, orientation) {
  let scale;

  if (orientation === 'landscape') {
    // Fill the cell width. If the scaled height overflows, it gets clipped by overflow:hidden.
    scale = cellW / origW;
  } else {
    // Fit the entire video in the cell (no cropping).
    scale = Math.min(cellH / origH, cellW / origW);
  }

  const scaledW = origW * scale;
  const scaledH = origH * scale;

  // Center the scaled iframe in the cell.
  const offsetX = (cellW - scaledW) / 2;
  const offsetY = (cellH - scaledH) / 2;

  return { scale, offsetX, offsetY };
}

// Fallback dimensions if not stored on the stream object.
const FALLBACK = { landscape: [560, 315], portrait: [267, 476] };

export default function VideoCell({ stream, slotIndex }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState(null);

  // Measure the cell once after mount (layout is stable by then).
  // The parent keys this component on layout+slot, so it remounts on layout change.
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
      return (
        <div className="video-empty">
          <span>Chargement...</span>
        </div>
      );
    }

    const orientation = stream.orientation ?? 'landscape';
    const [fbW, fbH] = FALLBACK[orientation];
    const origW = stream.originalWidth  ?? fbW;
    const origH = stream.originalHeight ?? fbH;

    const { scale, offsetX, offsetY } = computeTransform(
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
          top: 0,
          left: 0,
          border: 'none',
          display: 'block',
          transformOrigin: '0 0',
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
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
