// Format Graph: how each data set is drawn (symbols, lines, error bars,
// bars and boxes, position) and graph-wide choices (plotting order,
// spacing, reference lines, title, legend, fonts, number at risk).
import { useState } from "react";
import Modal from "../components/Modal";
import { IconButton } from "../components/ui";
import {
  CHROME_DARK, CHROME_LIGHT, isDarkMode, seriesStyle, type SchemeId,
} from "../lib/palette";
import {
  BAR_PATTERNS, datasetFmt, LINE_DASHES, SYMBOL_SHAPES, withDatasetFormat, withField,
  type DatasetFormat, type FormatFeatures, type GraphFormat, type LegendFormat,
  type FontFormat, type AtRiskFormat,
} from "./format";
import {
  CheckField, ColorField, DialogActions, NumField, Section, SelectField, SizeField, SizeUnitChoice,
  Tabs, TextField,
} from "./controls";
import { useDiscardGuard } from "./useDiscardGuard";
import { useSizeUnit } from "./useSizeUnit";
import { GRADIENT_END, GRADIENT_START, gradientColors } from "./gradient";

type Target = "this" | "all" | "selected";

const CONNECT = [["none", "None"], ["linear", "Straight lines"], ["spline", "Smooth (spline)"],
  ["hv", "Staircase"]] as const;
const DASH_LABELS: Record<string, string> = {
  solid: "Solid", dash: "Dashed", dot: "Dotted", dashdot: "Dash-dot", longdash: "Long dash",
};
const PATTERN_LABELS: Record<string, string> = {
  "": "Solid fill", "/": "Diagonal /", "\\": "Diagonal \\", x: "Crosshatch", "-": "Horizontal",
  "|": "Vertical", "+": "Grid", ".": "Dots",
};

export default function FormatGraphDialog({
  format, datasets, features, scheme, hasRowTitles, onApply, onClose,
}: {
  format: GraphFormat;
  datasets: string[];
  features: FormatFeatures;
  scheme: SchemeId;
  hasRowTitles: boolean;
  onApply: (f: GraphFormat) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(format);
  const [applied, setApplied] = useState(format);
  const [tabState, setTab] = useState<"datasets" | "graph">("datasets");
  // Heat maps, forest and volcano plots have nothing to set per data set.
  const tab = features.noDatasets ? "graph" : tabState;
  const [sel, setSel] = useState(0);
  const [target, setTarget] = useState<Target>("this");
  const [selected, setSelected] = useState<Set<number>>(() => new Set([0]));
  const [unit, setUnit] = useSizeUnit();
  const dark = isDarkMode();
  const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
  const names = datasets.map((n, i) => n || `Data set ${i + 1}`);
  const cur = datasetFmt(draft, sel);
  const auto = seriesStyle(sel, dark, scheme);

  const targets = () => (target === "all" ? datasets.map((_, i) => i)
    : target === "selected" ? [...selected] : [sel]);
  const set = (patch: DatasetFormat) => setDraft((d) => withDatasetFormat(d, targets(), patch));
  const setG = <K extends keyof GraphFormat>(k: K, v: GraphFormat[K] | undefined) =>
    setDraft((d) => withField(d, k, v));
  const legendF = draft.legend ?? {};
  const setLegend = (p: Partial<LegendFormat>) => setG("legend", clean({ ...legendF, ...p }));
  const fontF = draft.font ?? {};
  const setFont = (p: Partial<FontFormat>) => setG("font", clean({ ...fontF, ...p }));
  const risk = draft.atRisk;
  const setRisk = (p: Partial<AtRiskFormat>) =>
    setG("atRisk", { show: risk?.show ?? false, ...risk, ...p });

  const order = plotOrder(draft.order, datasets.length);
  const move = (k: number, d: number) => {
    const next = [...order];
    const j = k + d;
    if (j < 0 || j >= next.length) return;
    [next[k], next[j]] = [next[j], next[k]];
    setG("order", next.every((v, i) => v === i) ? undefined : next);
  };

  // Colour gradient across the data sets, in plotting order
  const [grad, setGrad] = useState({ start: GRADIENT_START, end: GRADIENT_END });
  const applyGradient = () => {
    const cols = gradientColors(grad.start, grad.end, order.length);
    setDraft((d) => order.reduce((acc, ds, k) => withDatasetFormat(acc, [ds], { color: cols[k] }), d));
  };

  const apply = () => { onApply(draft); setApplied(draft); };
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const requestClose = useDiscardGuard(dirty, onClose);

  return (
    <Modal title="Format graph" className="modal-wide fmt-dialog" onClose={requestClose}
      onSubmit={() => { if (dirty) onApply(draft); onClose(); }}
      actions={<DialogActions onCancel={onClose} onApply={apply} dirty={dirty} />}>
      <SizeUnitChoice unit={unit} onChange={setUnit} />
      {!features.noDatasets && (
        <Tabs label="Format graph sections" value={tab} onChange={setTab}
          tabs={[["datasets", "Data sets"], ["graph", "Whole graph"]]} />
      )}
      {tab === "datasets" ? (
        <div role="tabpanel" className="fmt-panel">
          <div className="fmt-target">
            <label className="field">
              <span>Data set</span>
              <select value={sel} aria-label="Data set to format" onChange={(e) => {
                const i = Number(e.target.value);
                setSel(i);
                if (target === "this") setSelected(new Set([i]));
              }}>
                {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
            </label>
            <fieldset className="field-radios fmt-apply-to">
              <legend>Apply changes to</legend>
              <label><input type="radio" name="fmt-target" checked={target === "this"}
                onChange={() => setTarget("this")} /> This data set</label>
              <label><input type="radio" name="fmt-target" checked={target === "all"}
                onChange={() => setTarget("all")} /> All data sets</label>
              <label><input type="radio" name="fmt-target" checked={target === "selected"}
                onChange={() => { setTarget("selected"); setSelected(new Set([sel])); }} />
                Selected data sets</label>
            </fieldset>
            {target === "selected" && (
              <fieldset className="fmt-picks">
                <legend className="sr-only">Data sets to change</legend>
                {names.map((n, i) => (
                  <CheckField key={i} label={n} checked={selected.has(i)} onChange={(v) => {
                    const s = new Set(selected);
                    if (v) s.add(i); else s.delete(i);
                    setSelected(s);
                  }} />
                ))}
              </fieldset>
            )}
          </div>

          {datasets.length > 1 && (features.points || features.bars || features.boxes || features.color) && (
            <Section title="Colour gradient">
              <ColorField label="Start colour" value={grad.start} auto={GRADIENT_START} mark={false}
                surface={chrome.surface} onChange={(v) => setGrad((g) => ({ ...g, start: v ?? GRADIENT_START }))} />
              <ColorField label="End colour" value={grad.end} auto={GRADIENT_END} mark={false}
                surface={chrome.surface} onChange={(v) => setGrad((g) => ({ ...g, end: v ?? GRADIENT_END }))} />
              <button type="button" onClick={applyGradient}>
                Colour all {datasets.length} data sets from start to end</button>
              <p className="hint-block">In plotting order, evenly mixed between the two colours.
                Each data set&apos;s colour can still be changed after.</p>
            </Section>
          )}

          <Section title="Show">
            <CheckField label="Show on graph" checked={cur.show !== false}
              onChange={(v) => set({ show: v ? undefined : false })} />
            <TextField label="Legend text" value={cur.legend} placeholder={names[sel]}
              onChange={(v) => set({ legend: v })} />
          </Section>

          {(features.points || features.bars || features.boxes) && (
            <Section title={features.bars ? "Symbols and bars" : "Symbols"}>
              {features.points && (
                <SelectField label="Shape" value={cur.symbol ?? ""}
                  options={[["", `Automatic (${shapeLabel(auto.symbol)})`] as const,
                    ...SYMBOL_SHAPES.map((s) => [s.id, s.label] as const)]}
                  onChange={(v) => set({ symbol: v || undefined })} />
              )}
              {features.points && (
                <SizeField label="Size" unit={unit} value={cur.size} onChange={(v) => set({ size: v })} />
              )}
              <ColorField label="Colour" value={cur.color} auto={auto.color}
                surface={chrome.surface} onChange={(v) => set({ color: v })} />
              <NumField label="Fill opacity (%)"
                value={cur.fillAlpha != null ? Math.round(cur.fillAlpha * 100) : undefined}
                note="0 = hollow, 100 = solid"
                onChange={(v) => set({ fillAlpha: v == null ? undefined
                  : Math.min(1, Math.max(0, v / 100)) })} />
              <ColorField label="Border colour" value={cur.borderColor} auto={features.points
                && !features.bars ? chrome.surface : auto.color}
                surface={chrome.surface} onChange={(v) => set({ borderColor: v })} />
              <SizeField label="Border width" unit={unit} value={cur.borderWidth}
                onChange={(v) => set({ borderWidth: v })} />
              {features.bars && (
                <SelectField label="Bar pattern" value={cur.pattern ?? ""}
                  options={BAR_PATTERNS.map((p) => [p, PATTERN_LABELS[p]] as const)}
                  onChange={(v) => set({ pattern: v || undefined })} />
              )}
            </Section>
          )}

          {features.color && !(features.points || features.bars || features.boxes) && (
            <Section title="Colour">
              <ColorField label="Colour" value={cur.color} auto={auto.color}
                surface={chrome.surface} onChange={(v) => set({ color: v })} />
              {!features.lines && (
                <NumField label="Fill opacity (%)"
                  value={cur.fillAlpha != null ? Math.round(cur.fillAlpha * 100) : undefined}
                  note="100 = solid"
                  onChange={(v) => set({ fillAlpha: v == null ? undefined
                    : Math.min(1, Math.max(0, v / 100)) })} />
              )}
            </Section>
          )}

          {(features.lines || features.connect) && (
            <Section title="Lines">
              {features.connect && (
                <SelectField label="Connect the points" value={cur.connect ?? "none"}
                  options={CONNECT} onChange={(v) => set({ connect: v === "none" ? undefined : v })} />
              )}
              <SelectField label="Line style" value={cur.lineDash ?? ""}
                options={[["", "Automatic"] as const,
                  ...LINE_DASHES.map((d) => [d, DASH_LABELS[d]] as const)]}
                onChange={(v) => set({ lineDash: (v || undefined) as DatasetFormat["lineDash"] })} />
              <SizeField label="Line width" unit={unit} value={cur.lineWidth}
                onChange={(v) => set({ lineWidth: v })} />
            </Section>
          )}

          {features.errorBars && (
            <Section title="Error bars">
              <SelectField label="Direction" value={cur.errorDir ?? "both"}
                options={[["both", "Above and below"], ["up", "Above only"],
                  ["down", "Below only"], ["none", "None"]]}
                onChange={(v) => set({ errorDir: v === "both" ? undefined : v })} />
              <SelectField label="Draw as" value={cur.errorStyle ?? "bars"}
                options={[["bars", "Bars"], ["envelope", "Shaded envelope"]]}
                onChange={(v) => set({ errorStyle: v === "bars" ? undefined : v })} />
              <SizeField label="Cap width" unit={unit} value={cur.errorCap} note="0 = no caps"
                onChange={(v) => set({ errorCap: v })} />
              <SizeField label="Thickness" unit={unit} value={cur.errorWidth}
                onChange={(v) => set({ errorWidth: v })} />
              {features.xError && datasets.length > 1 && (
                <SelectField label="Horizontal (X) error"
                  value={cur.xErrorFrom != null ? String(cur.xErrorFrom) : ""}
                  options={[["", "None"] as const, ...names.map((n, i) =>
                    [String(i), `SD from “${n}”`] as const).filter(([v]) => v !== String(sel))]}
                  onChange={(v) => set({ xErrorFrom: v === "" ? undefined : Number(v) })} />
              )}
            </Section>
          )}

          {!features.noAxes && (!features.categoryX || features.points) && (
          <Section title="Position and labels">
            {!features.categoryX && (
              <NumField label={features.categorical ? "Nudge along X (columns)" : "Nudge along X"}
                value={cur.nudge} placeholder="0" onChange={(v) => set({ nudge: v })} />
            )}
            {!features.categorical && !features.categoryX && (
              <CheckField label="Plot on the right Y axis" checked={!!cur.rightAxis}
                onChange={(v) => set({ rightAxis: v || undefined })} />
            )}
            {features.points && (
              <CheckField label="Label points with row titles" checked={!!cur.labelPoints}
                note={hasRowTitles ? undefined : "The table has no row titles yet."}
                onChange={(v) => set({ labelPoints: v || undefined })} />
            )}
          </Section>
          )}
          <p className="field-note">
            Changes go to {target === "this" ? names[sel] : target === "all"
              ? "every data set" : `${selected.size} selected data set${selected.size === 1 ? "" : "s"}`}.
            Leave a field empty to keep the automatic value.
          </p>
        </div>
      ) : (
        <div role="tabpanel" className="fmt-panel">
          {datasets.length > 1 && !features.noDatasets && (
            <Section title={features.categorical ? "Plotting order (left to right)"
              : features.noAxes ? "Order of the parts" : "Plotting order (back to front)"} wide>
              <ol className="fmt-order">
                {order.map((ds, k) => (
                  <li key={ds}>
                    <span>{names[ds]}</span>
                    <IconButton size="sm" variant="secondary" disabled={k === 0}
                      aria-label={`Move ${names[ds]} earlier`} onClick={() => move(k, -1)}>
                      <ArrowIcon up /></IconButton>
                    <IconButton size="sm" variant="secondary" disabled={k === order.length - 1}
                      aria-label={`Move ${names[ds]} later`} onClick={() => move(k, 1)}>
                      <ArrowIcon /></IconButton>
                  </li>
                ))}
              </ol>
            </Section>
          )}
          {!features.noAxes && (
          <Section title="Lines across the graph">
            {features.categorical && (
              <SelectField label="Join columns" value={draft.connect ?? "none"}
                options={[["none", "No"], ["mean", "Join the means"], ["median", "Join the medians"],
                  ["spaghetti", "Join each row (before-after)"]]}
                onChange={(v) => setG("connect", v === "none" ? undefined : v)} />
            )}
            <SelectField label="Horizontal line" value={draft.centralLine ?? "none"}
              options={[["none", "None"], ["mean", "Grand mean"], ["median", "Grand median"]]}
              onChange={(v) => setG("centralLine", v === "none" ? undefined : v)} />
            {!features.categorical && (
              <CheckField label="Line of identity (Y = X)" checked={!!draft.identityLine}
                onChange={(v) => setG("identityLine", v || undefined)} />
            )}
            {features.categorical && (features.bars || features.boxes) && (
              <NumField label="Gap between columns (%)"
                value={draft.spacing != null ? Math.round(draft.spacing * 100) : undefined}
                onChange={(v) => setG("spacing", v == null ? undefined
                  : Math.min(0.9, Math.max(0, v / 100)))} />
            )}
          </Section>
          )}
          <Section title="Title and legend">
            <TextField label="Graph title" value={draft.title} placeholder="None"
              onChange={(v) => setG("title", v)} />
            <SelectField label="Legend" value={legendF.show ?? "auto"}
              options={[["auto", "Automatic"], ["show", "Show"], ["hide", "Hide"]]}
              onChange={(v) => setLegend({ show: v === "auto" ? undefined : v })} />
            <SelectField label="Legend position" value={legendF.position ?? "auto"}
              options={[["auto", "Automatic"], ["top", "Above the plot"], ["top-left", "Top left"],
                ["top-right", "Top right"], ["bottom-left", "Bottom left"],
                ["bottom-right", "Bottom right"], ["right", "Outside right"],
                ["bottom", "Below the plot"]]}
              onChange={(v) => setLegend({ position: v === "auto" ? undefined : v })} />
            <SelectField label="Legend layout" value={legendF.orientation ?? "auto"}
              options={[["auto", "Automatic"], ["v", "One per line"], ["h", "In a row"]]}
              onChange={(v) => setLegend({ orientation: v === "auto" ? undefined : v })} />
          </Section>
          <Section title="Fonts">
            <SelectField label="Font" value={fontF.family ?? "inter"}
              options={[["inter", "Inter (default)"], ["system", "System sans-serif"],
                ["arial", "Arial / Helvetica"], ["serif", "Times (serif)"], ["mono", "Monospace"]]}
              onChange={(v) => setFont({ family: v === "inter" ? undefined : v })} />
            <SizeField label="Base text size" unit={unit} value={fontF.size} onChange={(v) => setFont({ size: v })} />
            <SizeField label="Graph title size" unit={unit} value={fontF.titleSize}
              onChange={(v) => setFont({ titleSize: v })} />
            <SizeField label="Axis title size" unit={unit} value={fontF.axisTitleSize}
              onChange={(v) => setFont({ axisTitleSize: v })} />
            <SizeField label="Axis number size" unit={unit} value={fontF.tickSize}
              onChange={(v) => setFont({ tickSize: v })} />
            <SizeField label="Legend text size" unit={unit} value={fontF.legendSize}
              onChange={(v) => setFont({ legendSize: v })} />
          </Section>
          {features.survival && (
            <Section title="Number at risk">
              <CheckField label="Show a number-at-risk table" checked={!!risk?.show}
                onChange={(v) => setG("atRisk", v ? { ...risk, show: true } : undefined)} />
              {risk?.show && (
                <>
                  <CheckField label="Table title" checked={risk.title !== false}
                    onChange={(v) => setRisk({ title: v ? undefined : false })} />
                  <CheckField label="Cumulative censored in brackets" checked={!!risk.censored}
                    onChange={(v) => setRisk({ censored: v || undefined })} />
                  <CheckField label="Colour rows like their curves" checked={risk.byGroup !== false}
                    onChange={(v) => setRisk({ byGroup: v ? undefined : false })} />
                  <SizeField label="Text size" unit={unit} value={risk.size} onChange={(v) => setRisk({ size: v })} />
                </>
              )}
            </Section>
          )}
        </div>
      )}
    </Modal>
  );
}

function shapeLabel(id: string): string {
  return SYMBOL_SHAPES.find((s) => s.id === id)?.label.toLowerCase() ?? id;
}

function plotOrder(order: number[] | null | undefined, n: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const i of order ?? []) if (i < n && !seen.has(i)) { out.push(i); seen.add(i); }
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(i);
  return out;
}

function clean<T extends object>(o: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length ? out as T : undefined;
}

/** Up or down arrow for the plotting-order buttons. */
function ArrowIcon({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={up ? "M7 11.5v-9M3.5 6 7 2.5 10.5 6" : "M7 2.5v9M3.5 8 7 11.5 10.5 8"} />
    </svg>
  );
}
