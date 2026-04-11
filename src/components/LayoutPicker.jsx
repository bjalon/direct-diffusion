import { LAYOUTS } from '../utils/storage';

export default function LayoutPicker({ selected, onChange }) {
  return (
    <div className="layout-picker">
      {Object.entries(LAYOUTS).map(([key, layout]) => (
        <button
          key={key}
          className={`layout-option${selected === key ? ' selected' : ''}`}
          onClick={() => onChange(key)}
          title={layout.label}
        >
          <div
            className="layout-preview"
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
              gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
            }}
          >
            {Array.from({ length: layout.slots }, (_, i) => (
              <div key={i} className="layout-preview-cell" />
            ))}
          </div>
          <span className="layout-label">{layout.label}</span>
        </button>
      ))}
    </div>
  );
}
