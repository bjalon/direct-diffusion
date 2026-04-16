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
              gridTemplateColumns: `repeat(${layout.previewCols}, 1fr)`,
              gridTemplateRows: `repeat(${layout.previewRows}, 1fr)`,
            }}
          >
            {layout.placements.map((placement, i) => (
              <div
                key={i}
                className="layout-preview-cell"
                style={{
                  gridColumn: `${placement.col} / span ${placement.colSpan ?? 1}`,
                  gridRow: `${placement.row} / span ${placement.rowSpan ?? 1}`,
                }}
              />
            ))}
          </div>
          <span className="layout-label">{layout.label}</span>
        </button>
      ))}
    </div>
  );
}
