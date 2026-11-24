// Format Axes: range, scale, numbering, ticks, grid lines, extra ticks and
// gaps for each axis, plus the frame and origin. Axis titles here are the
// same titles as in the Settings panel.
import { useState } from "react";
import Modal from "../components/Modal";
import { Button } from "../components/ui";
import {
  withField, type AxisFormat, type GraphFormat, type NumberFormat, type ScaleKind,
} from "./format";
import {
  CheckField, DialogActions, NumField, Section, SelectField, SizeField, SizeUnitChoice, Tabs,
  TextField,
} from "./controls";
import type { SizeUnit } from "./sizeUnit";
import { useDiscardGuard } from "./useDiscardGuard";
import { useSizeUnit } from "./useSizeUnit";

type AxisKey = "x" | "y" | "y2";
type Titles = { x: string; y: string };

const SCALES = [["linear", "Linear"], ["log10", "Log 10"], ["log2", "Log 2"], ["ln", "Natural log (ln)"],
  ["probability", "Probability (percent)"]] as const;
const NUMBERS = [["auto", "Automatic"], ["decimal", "Decimal (1,000)"],
  ["scientific", "Scientific (1.0e3)"], ["power10", "Power of 10 (10³)"],
  ["antilog", "Antilog of log values"], ["elapsed", "Elapsed time (h:mm)"],
  ["date", "Date"]] as const;

export default function FormatAxesDialog({
  format, titles, autoTitles, categoricalX, hasY2, zeroBreak = false, onApply, onClose,
}: {
  format: GraphFormat;
  titles: Titles;
  autoTitles: Titles;
  /** X is a category axis (column graphs): no numeric settings for X. */
  categoricalX: boolean;
  hasY2: boolean;
  /** A log(X) curve-fit graph: offer the zero dose left of an X break. */
  zeroBreak?: boolean;
  onApply: (f: GraphFormat, titles: Titles) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(format);
  const [tTitles, setTTitles] = useState(titles);
  const [applied, setApplied] = useState({ f: format, t: titles });
  const [tab, setTab] = useState<AxisKey | "frame">("y");
  const [unit, setUnit] = useSizeUnit();
  const setAxis = (k: AxisKey, a: AxisFormat) => setDraft((d) => withField(d, k, clean(a)));

  const dirty = JSON.stringify([draft, tTitles]) !== JSON.stringify([applied.f, applied.t]);
  const requestClose = useDiscardGuard(dirty, onClose);
  const apply = () => { onApply(draft, tTitles); setApplied({ f: draft, t: tTitles }); };
  const tabs: [AxisKey | "frame", string][] = [["x", "X axis"], ["y", "Left Y axis"]];
  if (hasY2) tabs.push(["y2", "Right Y axis"]);
  tabs.push(["frame", "Frame and origin"]);

  return (
    <Modal title="Format axes" className="modal-wide fmt-dialog" onClose={requestClose}
      onSubmit={() => { if (dirty) onApply(draft, tTitles); onClose(); }}
      actions={<DialogActions onCancel={onClose} onApply={apply} dirty={dirty} />}>
      <SizeUnitChoice unit={unit} onChange={setUnit} />
      <Tabs label="Axes" value={tab} onChange={setTab} tabs={tabs} />
      <div role="tabpanel" className="fmt-panel">
        {tab === "frame" ? (
          <Section title="Frame and origin">
            <SelectField label="Frame" value={draft.frame ?? "auto"}
              options={[["auto", "As drawn (grid only)"], ["axes", "Plain X and Y axes"],
                ["box", "Box around the plot"], ["offset", "Offset X and Y axes"],
                ["none", "No axis lines"]]}
              onChange={(v) => setDraft((d) => withField(d, "frame", v === "auto" ? undefined : v))} />
            <SelectField label="Origin" value={draft.origin ?? "auto"}
              options={[["auto", "Automatic (lower left)"], ["zero", "Draw lines through zero"]]}
              onChange={(v) => setDraft((d) => withField(d, "origin", v === "auto" ? undefined : v))} />
          </Section>
        ) : (
          <AxisEditor key={tab} which={tab} value={draft[tab] ?? {}} unit={unit}
            categorical={tab === "x" && categoricalX}
            zeroBreak={tab === "x" && zeroBreak}
            title={tab === "y2" ? draft.y2?.title ?? "" : tTitles[tab]}
            titlePlaceholder={tab === "y2" ? "None" : autoTitles[tab] || "None"}
            onTitle={(t) => {
              if (tab === "y2") setAxis("y2", { ...(draft.y2 ?? {}), title: t || undefined });
              else setTTitles({ ...tTitles, [tab]: t });
            }}
            onChange={(a) => setAxis(tab, a)} />
        )}
      </div>
    </Modal>
  );
}

function AxisEditor({ which, value: a, unit, onChange, categorical, zeroBreak, title, titlePlaceholder,
  onTitle }: {
  which: AxisKey;
  zeroBreak: boolean;
  value: AxisFormat;
  unit: SizeUnit;
  onChange: (a: AxisFormat) => void;
  categorical: boolean;
  title: string;
  titlePlaceholder: string;
  onTitle: (t: string) => void;
}) {
  const set = (p: Partial<AxisFormat>) => onChange({ ...a, ...p });
  const numbers = a.numbers ?? "auto";
  const extra = a.extraTicks ?? [];
  const isY = which !== "x";
  return (
    <>
      <Section title="Title and visibility">
        <TextField label="Axis title" value={title} placeholder={titlePlaceholder}
          onChange={(v) => onTitle(v ?? "")} />
        <SizeField label="Title size" unit={unit} value={a.titleSize}
          onChange={(v) => set({ titleSize: v })} />
        <SizeField label="Axis line width" unit={unit} value={a.lineWidth}
          note="The axis line and its ticks; setting it draws the line"
          onChange={(v) => set({ lineWidth: v })} />
        <CheckField label="Hide this axis" checked={!!a.hide}
          onChange={(v) => set({ hide: v || undefined })} />
      </Section>
      {!categorical && (
        <Section title="Range and scale">
          <NumField label="Minimum" value={a.min} onChange={(v) => set({ min: v })} />
          <NumField label="Maximum" value={a.max} onChange={(v) => set({ max: v })} />
          <SelectField<ScaleKind> label="Scale" value={a.scale ?? "linear"} options={SCALES}
            onChange={(v) => set({ scale: v === "linear" ? undefined : v })} />
        </Section>
      )}
      {!categorical && (
        <Section title="Numbering">
          <SelectField<NumberFormat> label="Format" value={numbers} options={NUMBERS}
            onChange={(v) => set({ numbers: v === "auto" ? undefined : v })} />
          {(numbers === "decimal" || numbers === "scientific") && (
            <NumField label="Decimal places" value={a.decimals}
              onChange={(v) => set({ decimals: v == null ? undefined : Math.round(v) })} />
          )}
          {numbers === "elapsed" && (
            <SelectField label="Values are in" value={a.elapsedUnit ?? "h"}
              options={[["s", "Seconds"], ["min", "Minutes"], ["h", "Hours"]]}
              onChange={(v) => set({ elapsedUnit: v === "h" ? undefined : v })} />
          )}
          {numbers === "date" && (
            <TextField label="Date format" value={a.dateFormat} placeholder="%Y-%m-%d"
              onChange={(v) => set({ dateFormat: v })} />
          )}
          {(a.scale ?? "linear") === "linear" && numbers !== "antilog" && numbers !== "date" && (
            <SelectField label="Scale factor" value={String(a.scaleFactor ?? 0)}
              options={[["0", "None"], ...[3, 6, 9, -3, -6, -9].map((k) =>
                [String(k), `Labels ÷ 10^${k}, title (×10^${k})`] as [string, string])]}
              onChange={(v) => set({ scaleFactor: Number(v) || undefined })} />
          )}
          {numbers === "antilog" && (
            <p className="field-note fmt-span">
              For an axis that holds log10 values (log concentrations): ticks
              sit at whole powers of ten and show 10 raised to them.
            </p>
          )}
          {numbers === "date" && (
            <p className="field-note fmt-span">
              Applies when the X values arrive as dates; tables store dates as
              text for now.
            </p>
          )}
        </Section>
      )}
      <Section title="Ticks and grid">
        {!categorical && (
          <NumField label={a.scale === "log10" ? "Major ticks every (decades)" : "Major ticks every"}
            value={a.majorStep} onChange={(v) => set({ majorStep: v && v > 0 ? v : undefined })} />
        )}
        {!categorical && (
          <NumField label="Minor ticks per interval" value={a.minorCount} placeholder="0"
            onChange={(v) => set({ minorCount: v == null ? undefined : Math.round(v) })} />
        )}
        <SelectField label="Tick direction" value={a.ticks ?? "auto"}
          options={[["auto", "As drawn"], ["out", "Outward"], ["in", "Inward"], ["none", "No ticks"]]}
          onChange={(v) => set({ ticks: v === "auto" ? undefined : v })} />
        <SizeField label="Tick length" unit={unit} value={a.tickLen} onChange={(v) => set({ tickLen: v })} />
        <SelectField label="Major grid lines" value={a.grid === undefined ? "auto" : a.grid ? "on" : "off"}
          options={[["auto", "As drawn"], ["on", "Show"], ["off", "Hide"]]}
          onChange={(v) => set({ grid: v === "auto" ? undefined : v === "on" })} />
        {!categorical && (
          <CheckField label="Minor grid lines" checked={!!a.minorGrid}
            onChange={(v) => set({ minorGrid: v || undefined })} />
        )}
      </Section>
      {isY && which === "y" && (
        <Section title="Discontinuous axis">
          <CheckField label="Leave out a range (gap)" checked={!!a.gap}
            onChange={(v) => set({ gap: v ? { from: a.gap?.from ?? 0, to: a.gap?.to ?? 1 } : undefined })} />
          {a.gap && (
            <>
              <NumField label="Gap starts at" value={a.gap.from}
                onChange={(v) => set({ gap: { from: v ?? 0, to: a.gap!.to } })} />
              <NumField label="Gap ends at" value={a.gap.to}
                onChange={(v) => set({ gap: { from: a.gap!.from, to: v ?? 0 } })} />
              <SegmentField label="Lower segment (% of the axis)" value={a.segment}
                onChange={(segment) => set({ segment })} />
            </>
          )}
        </Section>
      )}
      {which === "x" && zeroBreak && (
        <Section title="Zero dose">
          <CheckField label="Draw the zero dose left of a break" checked={!!a.zeroBreak}
            note="X = 0 has no logarithm, so a log(X) fit leaves those wells out. They get their own segment at the X entered; the curve stays right of the break."
            onChange={(v) => set({ zeroBreak: v || undefined })} />
          {a.zeroBreak && (
            <>
              <SegmentField label="Zero-dose segment (% of the axis)" value={a.segment}
                placeholder="12" onChange={(segment) => set({ segment })} />
              <TextField label="Segment label" value={a.zeroLabel} placeholder="The X entered"
                onChange={(v) => set({ zeroLabel: v?.trim() ? v : undefined })} />
            </>
          )}
        </Section>
      )}
      {!categorical && which !== "y2" && (
        <fieldset className="fmt-section wide">
          <legend>Additional ticks and grid lines</legend>
          {extra.map((t, i) => (
            <div className="fmt-row" key={i}>
              <NumField label="Tick at" value={t.value} placeholder="value"
                onChange={(v) => set({ extraTicks: extra.map((e, j) =>
                  (j === i ? { ...e, value: v ?? 0 } : e)) })} />
              <TextField label="Tick label" value={t.label} placeholder="The value"
                onChange={(v) => set({ extraTicks: extra.map((e, j) =>
                  (j === i ? { ...e, label: v ?? "" } : e)) })} />
              <CheckField label="Grid line" checked={!!t.grid}
                onChange={(v) => set({ extraTicks: extra.map((e, j) =>
                  (j === i ? { ...e, grid: v || undefined } : e)) })} />
              <Button size="sm" aria-label={`Remove tick at ${t.value}`}
                onClick={() => set({ extraTicks: extra.filter((_, j) => j !== i) })}>Remove</Button>
            </div>
          ))}
          <Button size="sm" className="fmt-add" onClick={() =>
            set({ extraTicks: [...extra, { value: 0, label: "" }] })}>Add a tick</Button>
        </fieldset>
      )}
    </>
  );
}

/** A segment's share of a broken axis, typed in percent (10 to 90). */
function SegmentField({ label, value, onChange, placeholder = "Auto" }: {
  label: string; value: number | undefined; placeholder?: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <NumField label={label} placeholder={placeholder}
      value={value === undefined ? undefined : Math.round(value * 1000) / 10}
      note="10 to 90"
      onChange={(v) => onChange(v == null ? undefined : Math.min(0.9, Math.max(0.1, v / 100)))} />
  );
}

function clean(a: AxisFormat): AxisFormat | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out as AxisFormat : undefined;
}
