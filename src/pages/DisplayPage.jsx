import { getLayouts } from '../utils/storage';
import VideoCell from '../components/VideoCell';

export default function DisplayPage({ config, scoreOverlayByStream = {} }) {
  const layouts = getLayouts();
  const layout = layouts[config.layout] ?? layouts['1'];
  const { cols, rows, placements } = layout;

  const getStream = (slotIndex) => {
    const streamId = config.slots[slotIndex];
    if (!streamId) return null;
    return config.streams.find((s) => s.id === streamId) ?? null;
  };

  return (
    <div
      className="display-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {placements.map((placement, i) => (
        <div
          key={`${config.layout}-${i}`}
          style={{
            gridColumn: `${placement.col} / span ${placement.colSpan ?? 1}`,
            gridRow: `${placement.row} / span ${placement.rowSpan ?? 1}`,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <VideoCell
            stream={getStream(i)}
            slotIndex={i}
            scoreOverlay={scoreOverlayByStream[getStream(i)?.id] ?? null}
          />
        </div>
      ))}
    </div>
  );
}
