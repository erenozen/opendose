import SchemePicker from "./SchemePicker";
import type { SchemeId } from "../lib/palette";

export interface AxisTitles {
  x: string;
  y: string;
}

interface Props {
  scheme: SchemeId;
  onSchemeChange: (id: SchemeId) => void;
  titles: AxisTitles;
  onTitlesChange: (t: AxisTitles) => void;
  /** What the axes say when the fields are left empty. */
  autoX: string;
  autoY: string;
  /** Column graphs label their x axis with the dataset names instead. */
  showX?: boolean;
}

// The automatic titles track the model, units and normalize settings, which
// is right until someone needs their own wording for a figure. An empty
// field keeps the automatic one, so clearing a box is how you undo an edit;
// the placeholder shows what that would put back.
export default function GraphSettings({
  scheme, onSchemeChange, titles, onTitlesChange, autoX, autoY, showX = true,
}: Props) {
  return (
    <div className="graph-settings">
      <SchemePicker value={scheme} onChange={onSchemeChange} />
      <div className="axis-titles">
        <span className="axis-titles-label">Titles</span>
        {showX && (
          <label>
            X
            <input
              type="text"
              value={titles.x}
              placeholder={autoX}
              aria-label="X axis title"
              onChange={(e) => onTitlesChange({ ...titles, x: e.target.value })}
            />
          </label>
        )}
        <label>
          Y
          <input
            type="text"
            value={titles.y}
            placeholder={autoY}
            aria-label="Y axis title"
            onChange={(e) => onTitlesChange({ ...titles, y: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
