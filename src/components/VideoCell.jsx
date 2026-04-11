import { useRef, useState, useEffect } from 'react';
import { buildFbSrc } from '../utils/iframeParser';

const ASPECT = {
  landscape: 16 / 9,
  portrait:  9 / 16,
};

function fitInCell(cellW, cellH, orientation) {
  const ratio = ASPECT[orientation] ?? 16 / 9;
  let w = cellW;
  let h = w / ratio;
  if (h > cellH) {
    h = cellH;
    w = h * ratio;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

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

  const orientation = stream?.orientation ?? 'landscape';
  const dims = size ? fitInCell(size.width, size.height, orientation) : null;
  const iframeSrc = stream && dims ? buildFbSrc(stream.src, dims.width, dims.height) : null;

  return (
    <div ref={containerRef} className="video-cell">
      {iframeSrc ? (
        <iframe
          key={`${stream.id}-${orientation}-${dims.width}x${dims.height}`}
          src={iframeSrc}
          width={dims.width}
          height={dims.height}
          className="video-iframe"
          scrolling="no"
          frameBorder="0"
          allowFullScreen
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        />
      ) : (
        <div className="video-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{stream ? 'Chargement...' : `Emplacement ${slotIndex + 1}`}</span>
        </div>
      )}
    </div>
  );
}
