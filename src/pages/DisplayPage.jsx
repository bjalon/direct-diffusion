import { LAYOUTS } from '../utils/storage';
import VideoCell from '../components/VideoCell';

export default function DisplayPage({ config }) {
  const layout = LAYOUTS[config.layout] ?? LAYOUTS['1'];
  const { cols, rows, slots: slotCount } = layout;

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
      {Array.from({ length: slotCount }, (_, i) => (
        // Key includes layout so VideoCell remounts (and remeasures) on layout change
        <VideoCell key={`${config.layout}-${i}`} stream={getStream(i)} slotIndex={i} />
      ))}
    </div>
  );
}
