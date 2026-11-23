import { useId, useState, type ReactNode } from "react";
import { Button, NumberField } from "../components/ui";
import { findSheet } from "../project/ops";
import { DEFAULT_PAGE, MIN_ITEM_MM, PAGE_SIZES, pageDims, type ResolvedLayout } from "../project/layout";
import type {
  GraphSheet, LayoutItem, LayoutPage, PanelLetters, Project,
} from "../project/types";

export interface InspectorProps {
  layout: ResolvedLayout;
  project: Project;
  readOnly: boolean;
  selected: LayoutItem | null;
  edit: (fn: (l: ResolvedLayout) => ResolvedLayout, key?: string | null) => void;
  editItem: (id: string, patch: Partial<LayoutItem>, key?: string | null) => void;
  onRemove: (id: string) => void;
  onUnlink: (id: string) => void;
  onFill: (startId: string | null) => void;
  pickerRef: React.RefObject<HTMLSelectElement | null>;
}

/** A number field that only commits valid values (NumberField shows the
 *  range problem late, as forms.md asks). */
function NumField({ label, value, onCommit, min, max, step = 1, unit, disabled }: {
  label: string; value: number; onCommit: (v: number) => void;
  min: number; max: number; step?: number; unit?: string; disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(Math.round(value * 10) / 10);
  return (
    <NumberField fieldClassName="field-num"
      label={<>{label}{unit && <span className="field-unit"> ({unit})</span>}</>}
      value={shown} min={min} max={max} step={step} disabled={disabled}
      onValueChange={(t) => {
        setText(t);
        const v = Number(t.trim().replace(",", "."));
        if (t.trim() !== "" && Number.isFinite(v) && v >= min && v <= max) onCommit(v);
      }}
      onBlur={() => setText(null)} />
  );
}

/** One choice of a few, as a segmented control built on real radios, so
 *  arrow keys move the choice and it is one Tab stop. */
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T | null;
  options: readonly (readonly [T, ReactNode])[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="layout-seg-field">
      <legend>{label}</legend>
      <div className="layout-seg" data-still>
        {options.map(([v, l]) => (
          <label key={v}>
            <input type="radio" name={name} value={v} checked={value === v}
              onChange={() => onChange(v)} />
            <span>{l}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Panel letter styles: the label shown, then the case and the format. */
const LETTER_STYLES = [["A", "upper", "plain"], ["(A)", "upper", "paren"], ["A.", "upper", "period"],
  ["a", "lower", "plain"], ["(a)", "lower", "paren"]] as const;

/**
 * Side panel of the layout composer: the selected item's settings, the
 * page, and panel letters.
 */
export default function LayoutInspector(p: InspectorProps) {
  const { layout, project, readOnly, selected: it } = p;
  const graphs = project.sheets.filter((s): s is GraphSheet => s.kind === "graph");
  const [fillFrom, setFillFrom] = useState<string>("");
  const page = layout.page;
  const setPage = (patch: Partial<LayoutPage>, key: string | null = null) =>
    p.edit((l) => ({ ...l, page: { ...l.page, ...patch } }), key);
  const setLetters = (patch: Partial<PanelLetters>, key: string | null = null) =>
    p.edit((l) => ({ ...l, letters: { ...l.letters, ...patch } }), key);
  const dims = pageDims(page);
  const graphLabel = (g: GraphSheet) => {
    const parent = findSheet(project, g.parentId);
    return parent ? `${g.name} · ${parent.name}` : g.name;
  };

  return (
    <aside className="layout-inspector" aria-label="Layout settings">
      <fieldset disabled={readOnly} className="layout-fieldset">
        {it ? (
          <section className="layout-section" aria-labelledby="li-item">
            <h3 id="li-item">
              {it.kind === "graph" ? "Graph placeholder" : it.kind === "picture" ? "Picture"
                : it.kind === "text" ? "Text block" : "Master legend"}
            </h3>
            {it.kind === "graph" && (
              <>
                <label className="field">
                  <span>Graph</span>
                  <select ref={p.pickerRef} value={it.graphId ?? ""} aria-label="Graph shown here"
                    onChange={(e) => p.editItem(it.id, { graphId: e.target.value || null })}>
                    <option value="">Empty placeholder</option>
                    {graphs.map((g) => <option key={g.id} value={g.id}>{graphLabel(g)}</option>)}
                  </select>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={!!it.hideLegend}
                    onChange={(e) => p.editItem(it.id, { hideLegend: e.target.checked })} />
                  Hide this graph&apos;s own legend (use the master legend)
                </label>
                {it.graphId && (
                  <Button className="layout-action" onClick={() => p.onUnlink(it.id)}
                    title="Replace the live graph by a static copy that no longer follows the data">
                    Make unlinked picture
                  </Button>
                )}
              </>
            )}
            {it.kind === "picture" && (
              <p className="hint-block">
                A static copy of “{it.name}”. It no longer follows its data;
                place the live graph again to update it.
              </p>
            )}
            {it.kind === "text" && (
              <>
                <label className="field">
                  <span>Text</span>
                  <textarea value={it.text} rows={3} aria-label="Text"
                    onChange={(e) => p.editItem(it.id, { text: e.target.value }, `text:${it.id}`)} />
                </label>
                <div className="layout-row">
                  <NumField label="Size" unit="pt" value={it.fontSize} min={4} max={96}
                    onCommit={(v) => p.editItem(it.id, { fontSize: v }, `fs:${it.id}`)} />
                  <label className="check-row">
                    <input type="checkbox" checked={it.bold}
                      onChange={(e) => p.editItem(it.id, { bold: e.target.checked })} />
                    Bold
                  </label>
                </div>
                <Segmented label="Alignment" value={it.align}
                  options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]}
                  onChange={(align) => p.editItem(it.id, { align })} />
              </>
            )}
            {it.kind === "legend" && (
              <>
                <p className="hint-block">
                  Lists every dataset of the graphs on this page once. Hide
                  the graphs&apos; own legends to avoid repeating them.
                </p>
                <div className="layout-row">
                  <NumField label="Size" unit="pt" value={it.fontSize} min={4} max={48}
                    onCommit={(v) => p.editItem(it.id, { fontSize: v }, `fs:${it.id}`)} />
                  <NumField label="Columns" value={it.columns} min={1} max={8}
                    onCommit={(v) => p.editItem(it.id, { columns: Math.round(v) }, `cols:${it.id}`)} />
                </div>
              </>
            )}
            <div className="layout-row layout-geom">
              {(["x", "y", "w", "h"] as const).map((k) => (
                <NumField key={`${it.id}-${k}`} label={{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]}
                  unit="mm" value={it[k]} step={0.5}
                  min={k === "w" || k === "h" ? MIN_ITEM_MM : 0}
                  max={k === "x" || k === "w" ? dims.w : dims.h}
                  onCommit={(v) => p.editItem(it.id, { [k]: v }, `geom:${it.id}:${k}`)} />
              ))}
            </div>
            {/* Undoable, so a keycap rather than a danger fill (buttons.md). */}
            <Button className="layout-action" onClick={() => p.onRemove(it.id)}>
              Remove from page
            </Button>
          </section>
        ) : (
          <section className="layout-section">
            <h3>Nothing selected</h3>
            <p className="hint-block">
              Select an item on the page to bind a graph, edit text or set
              its exact size. Drag to move (edges snap; hold Alt to place
              freely), drag the corner to resize, or use the arrow keys.
            </p>
          </section>
        )}

        <section className="layout-section" aria-labelledby="li-fill">
          <h3 id="li-fill">Place graphs</h3>
          <p className="hint-block">
            Fill the empty placeholders with graphs in the order of the
            Graphs section, starting from:
          </p>
          <div className="layout-row">
            <select value={fillFrom} aria-label="First graph to place"
              onChange={(e) => setFillFrom(e.target.value)}>
              <option value="">First graph</option>
              {graphs.map((g) => <option key={g.id} value={g.id}>{graphLabel(g)}</option>)}
            </select>
            <Button onClick={() => p.onFill(fillFrom || null)}
              disabled={!graphs.length}>Fill</Button>
          </div>
        </section>

        <section className="layout-section" aria-labelledby="li-page">
          <h3 id="li-page">Page</h3>
          <label className="field">
            <span>Size</span>
            <select value={page.size} aria-label="Page size"
              onChange={(e) => {
                const size = e.target.value as LayoutPage["size"];
                setPage(size === "custom"
                  ? { size, width: Math.round(dims.w), height: Math.round(dims.h) } : { size });
              }}>
              <option value="a4">{PAGE_SIZES.a4.label}</option>
              <option value="letter">{PAGE_SIZES.letter.label}</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {page.size === "custom" && (
            <div className="layout-row">
              <NumField label="Width" unit="mm" value={page.width} min={20} max={2000}
                onCommit={(v) => setPage({ width: v }, "page:w")} />
              <NumField label="Height" unit="mm" value={page.height} min={20} max={2000}
                onCommit={(v) => setPage({ height: v }, "page:h")} />
            </div>
          )}
          <Segmented label="Orientation" value={page.orientation}
            options={[["portrait", "Portrait"], ["landscape", "Landscape"]]}
            onChange={(orientation) => setPage({ orientation })} />
          <div className="layout-row">
            <NumField label="Margins" unit="mm" value={page.margin} min={0} max={100}
              onCommit={(v) => setPage({ margin: v }, "page:m")} />
            <label className="field field-color">
              <span>Background</span>
              <input type="color" aria-label="Page background colour"
                value={page.background === "transparent" ? DEFAULT_PAGE.background : page.background}
                disabled={page.background === "transparent"}
                onChange={(e) => setPage({ background: e.target.value }, "page:bg")} />
            </label>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={page.background === "transparent"}
              onChange={(e) => setPage({ background: e.target.checked ? "transparent" : "#ffffff" })} />
            Transparent page (PNG, WebP, SVG, PDF)
          </label>
        </section>

        <section className="layout-section" aria-labelledby="li-letters">
          <h3 id="li-letters">Panel letters</h3>
          <label className="check-row">
            <input type="checkbox" checked={layout.letters.show}
              onChange={(e) => setLetters({ show: e.target.checked })} />
            Label graphs A, B, C… in reading order
          </label>
          {layout.letters.show && (
            <>
              <Segmented label="Letter style"
                value={LETTER_STYLES.find(([, st, f]) => layout.letters.style === st
                  && layout.letters.format === f)?.[0] ?? null}
                options={LETTER_STYLES.map(([l]) => [l, l] as const)}
                onChange={(l) => {
                  const [, style, format] = LETTER_STYLES.find(([k]) => k === l)!;
                  setLetters({ style, format });
                }} />
              <div className="layout-row">
                <NumField label="Size" unit="pt" value={layout.letters.fontSize} min={4} max={72}
                  onCommit={(v) => setLetters({ fontSize: v }, "letters:size")} />
                <label className="check-row">
                  <input type="checkbox" checked={layout.letters.bold}
                    onChange={(e) => setLetters({ bold: e.target.checked })} />
                  Bold
                </label>
              </div>
              <Segmented label="Letter font" value={layout.letters.font}
                options={[["sans", "Sans serif"], ["serif", "Serif"]]}
                onChange={(font) => setLetters({ font })} />
              <Segmented label="Letter position" value={layout.letters.position}
                options={[["inside", "Inside, top left"], ["outside", "Above, top left"]]}
                onChange={(position) => setLetters({ position })} />
            </>
          )}
        </section>
      </fieldset>
    </aside>
  );
}
