import { useState, type ReactNode } from "react";
import SchemePicker from "./SchemePicker";
import type { SchemeId } from "../lib/palette";
import type { FormatAction } from "../graph/useFormatDialogs";
import { Button } from "./ui";
import Popover from "./ui/Popover";
import { belowStickyHeader } from "./ui/Popover.anchor";

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
  /** Format Graph / Format Axes / annotation dialogs to offer. */
  actions?: FormatAction[];
  /** Something beyond scheme and titles has been formatted. */
  formatted?: boolean;
  /** The graph kind's own options (GraphKindDef.OptionsPanel). */
  options?: ReactNode;
  /** Figure style and checks (theme, colour-vision check). */
  figure?: ReactNode;
}

// Colors and titles are set once and then left alone, so they do not earn
// two permanent rows under every graph. They live behind one button whose
// panel opens upward over the plot (or down when there is more room). It
// sits in the top layer, so the card's overflow no longer clips its first
// rows, and it stays below the sticky header.
export default function GraphSettings({
  scheme, onSchemeChange, titles, onTitlesChange, autoX, autoY, showX = true,
  actions, formatted, options, figure,
}: Props) {
  const [open, setOpen] = useState(false);

  // Say what has been changed from the automatic titles, so the button
  // still carries the information the open panel would.
  const edited = [titles.x.trim() && "X", titles.y.trim() && "Y",
    formatted && "Formatted"].filter(Boolean).join(" + ");

  return (
    <div className="graph-settings">
      <Popover open={open} onOpenChange={setOpen}>
        {/* A toolbar command: the ghost Button look (settings-btn is the
            tour's anchor, not a style). */}
        <Popover.Trigger variant="ghost" className="settings-btn">
          Settings
          {edited && <span className="settings-badge">{edited}</span>}
        </Popover.Trigger>
        <Popover.Content className={`settings-pop${options ? " has-options" : ""}`}
          aria-label="Graph settings" side="top" align="start" collisionPadding={belowStickyHeader}>
          {options && (
            <div className="graph-opts-section" role="group" aria-labelledby="graph-opts-h">
              <span className="axis-titles-label" id="graph-opts-h">Graph options</span>
              {options}
            </div>
          )}
          <SchemePicker value={scheme} onChange={onSchemeChange} />
          {figure}
          <div className="axis-titles">
            <span className="axis-titles-label">Axis titles</span>
            {showX && (
              <label>
                X
                <input
                  type="text"
                  value={titles.x}
                  placeholder={autoX || "Automatic"}
                  aria-label="X axis title"
                  onChange={(e) =>
                    onTitlesChange({ ...titles, x: e.target.value })}
                />
              </label>
            )}
            <label>
              Y
              <input
                type="text"
                value={titles.y}
                placeholder={autoY || "Automatic"}
                aria-label="Y axis title"
                onChange={(e) =>
                  onTitlesChange({ ...titles, y: e.target.value })}
              />
            </label>
            <span className="axis-titles-hint">
              Leave empty to keep the automatic title.
            </span>
          </div>
          {actions && actions.length > 0 && (
            <div className="format-actions" role="group" aria-label="Format the graph">
              <span className="axis-titles-label">Format</span>
              {actions.map((a) => (
                <Button key={a.id} size="sm"
                  onClick={() => { setOpen(false); a.onClick(); }}>{a.label}</Button>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover>
    </div>
  );
}