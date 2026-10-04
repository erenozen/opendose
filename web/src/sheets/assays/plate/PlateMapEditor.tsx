// Visual plate-map editor: drag across wells (or click a row / column
// header) to select, then give the selection a role or a compound
// concentration series. Templates fill the common layouts; a layout can
// be saved as a template in this browser.
import { useEffect, useMemo, useState } from "react";
import { useDarkMode } from "../../../graph/useDarkMode";
import { seriesColor } from "../../../lib/palette";
import {
  assignRole, assignSeries, compoundsOf, shortConc, dims, DIRECTION_LABELS, normRect, rectWells,
  ROW_LETTERS, roleCounts, wellName, type Direction, type PlateFormat, type PlateMap,
  type PlateTemplate, type Rect, type SeriesSpec, type WellRole,
} from "./model";
import { allTemplates, deleteTemplate, saveTemplate } from "./templates";
import "./plate.css";

const ROLE_TEXT: Record<WellRole, string> = {
  blank: "Blank", negative: "Vehicle", positive: "Kill / positive", sample: "Compound", empty: "Empty",
};

export default function PlateMapEditor({ format, wells, unit, values, onChange }: {
  format: PlateFormat;
  wells: PlateMap;
  unit: string;
  /** First plate's readings, shown in each well's tooltip. */
  values?: (number | null)[][];
  onChange: (wells: PlateMap) => void;
}) {
  const [nr, nc] = dims(format);
  const dark = useDarkMode();
  const [sel, setSel] = useState<Rect | null>(null);
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [spec, setSpec] = useState<SeriesSpec>({
    compound: "Compound 1", mode: "dilution", top: 10, factor: 3, list: [], direction: "right",
  });
  const [listText, setListText] = useState("");
  const [scope, setScope] = useState("");
  const [tplId, setTplId] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplMsg, setTplMsg] = useState("");
  const [templates, setTemplates] = useState<PlateTemplate[]>(() => allTemplates());

  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const compounds = useMemo(() => compoundsOf(wells), [wells]);
  const counts = useMemo(() => roleCounts(wells), [wells]);
  const concRange = useMemo(() => {
    const out = new Map<string, [number, number]>();
    for (const w of Object.values(wells)) {
      if (w.role !== "sample" || w.conc === undefined || !(w.conc > 0)) continue;
      const c = w.compound ?? "Sample";
      const r = out.get(c);
      const l = Math.log10(w.conc);
      out.set(c, r ? [Math.min(r[0], l), Math.max(r[1], l)] : [l, l]);
    }
    return out;
  }, [wells]);

  const selected = sel ? new Set(rectWells(sel)) : new Set<string>();
  const selText = sel
    ? (() => {
      const r = normRect(sel);
      const a = wellName(r.r0, r.c0); const b = wellName(r.r1, r.c1);
      const n = (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1);
      return `${a === b ? a : `${a}:${b}`} (${n} well${n === 1 ? "" : "s"})`;
    })()
    : "Drag across wells, or click a row letter or column number";

  const start = (r: number, c: number, shift: boolean, drag: boolean) => {
    if (shift && anchor) {
      setSel({ r0: anchor[0], c0: anchor[1], r1: r, c1: c });
    } else {
      setAnchor([r, c]);
      setSel({ r0: r, c0: c, r1: r, c1: c });
    }
    setDragging(drag);
  };
  const extend = (r: number, c: number) => {
    if (dragging && anchor) setSel({ r0: anchor[0], c0: anchor[1], r1: r, c1: c });
  };

  const applyRole = (role: WellRole) => {
    if (!sel) return;
    onChange(assignRole(wells, sel, role, role === "negative" || role === "positive" ? scope || undefined : undefined));
  };
  const applySeries = () => {
    if (!sel || !spec.compound.trim()) return;
    const list = listText.split(/[,;\s]+/).filter(Boolean).map(Number).filter((v) => v > 0);
    onChange(assignSeries(wells, sel, { ...spec, compound: spec.compound.trim(), list }));
    const m = /^(.*?)(\d+)$/.exec(spec.compound.trim());
    if (m) setSpec({ ...spec, compound: `${m[1]}${Number(m[2]) + 1}` });
  };
  const applyTemplate = () => {
    const t = templates.find((x) => x.id === tplId);
    if (t) onChange({ ...t.wells });
  };

  const fill = (r: number, c: number): { bg: string; fg: string; label: string; text: string } => {
    const w = wells[wellName(r, c)];
    const reading = values?.[r]?.[c];
    const readText = reading === null || reading === undefined ? "no reading" : `reading ${reading}`;
    if (!w) return { bg: "", fg: "", label: "", text: `empty, ${readText}` };
    if (w.role === "sample") {
      const ci = Math.max(0, compounds.indexOf(w.compound ?? "Sample"));
      const color = seriesColor(ci, dark);
      const range = concRange.get(w.compound ?? "Sample");
      const t = range && w.conc && range[1] > range[0]
        ? (Math.log10(w.conc) - range[0]) / (range[1] - range[0]) : 1;
      const alpha = Math.round((0.18 + 0.62 * t) * 255).toString(16).padStart(2, "0");
      return {
        bg: `${color}${alpha}`, fg: "",
        label: w.conc !== undefined ? shortConc(w.conc) : "?",
        text: `${w.compound ?? "Sample"}, ${w.conc ?? "no concentration"} ${unit}`
          + `${w.rep ? `, replicate ${w.rep}` : ""}, ${readText}`,
      };
    }
    const label = w.role === "blank" ? "B" : w.role === "negative" ? "V" : "K";
    return {
      bg: "", fg: "", label,
      text: `${ROLE_TEXT[w.role]}${w.compound ? ` for ${w.compound}` : ""}, ${readText}`,
    };
  };

  const small = format === 384;

  return (
    <div className="plate-editor">
      <div className="plate-templates wizard-row">
        <label className="field">
          <span>Template</span>
          <select value={tplId} onChange={(e) => setTplId(e.target.value)} aria-label="Plate layout template">
            <option value="">Choose a layout…</option>
            {templates.filter((t) => t.format === format).map((t) => (
              <option key={t.id} value={t.id}>{t.saved ? `${t.name} (saved)` : t.name}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!tplId} onClick={applyTemplate}>Apply template</button>
        {templates.find((t) => t.id === tplId)?.saved && (
          <button type="button" onClick={() => {
            const t = templates.find((x) => x.id === tplId);
            if (t) { deleteTemplate(t.name); setTemplates(allTemplates()); setTplId(""); }
          }}>Delete template</button>
        )}
        <button type="button" onClick={() => onChange({})}>Clear map</button>
      </div>
      {tplId && (
        <p className="hint-block">{templates.find((t) => t.id === tplId)?.description}</p>
      )}

      <div className="plate-editor-main">
        <div className={`plate-grid${small ? " plate-grid-384" : ""}`} role="group"
          aria-label={`Plate map, ${format} wells`}
          style={{ gridTemplateColumns: `auto repeat(${nc}, minmax(0, 1fr))` }}>
          <button type="button" className="plate-corner" aria-label="Select all wells"
            onClick={() => { setAnchor([0, 0]); setSel({ r0: 0, c0: 0, r1: nr - 1, c1: nc - 1 }); }} />
          {Array.from({ length: nc }, (_, c) => (
            <button key={`c${c}`} type="button" className="plate-head"
              aria-label={`Select column ${c + 1}`}
              onClick={(e) => {
                if (e.shiftKey && anchor) setSel({ r0: 0, c0: anchor[1], r1: nr - 1, c1: c });
                else { setAnchor([0, c]); setSel({ r0: 0, c0: c, r1: nr - 1, c1: c }); }
              }}>{c + 1}</button>
          ))}
          {Array.from({ length: nr }, (_, r) => (
            <RowCells key={r} r={r} nc={nc} small={small} fill={fill} selected={selected}
              wells={wells}
              onHead={(shift) => {
                if (shift && anchor) setSel({ r0: anchor[0], c0: 0, r1: r, c1: nc - 1 });
                else { setAnchor([r, 0]); setSel({ r0: r, c0: 0, r1: r, c1: nc - 1 }); }
              }}
              onStart={start} onEnter={extend} />
          ))}
        </div>

        <div className="plate-actions">
          <p className="plate-sel" aria-live="polite">{selText}</p>
          <h4>Controls</h4>
          <div className="plate-role-btns">
            <button type="button" disabled={!sel} onClick={() => applyRole("blank")}>
              <span className="well-swatch well-blank" aria-hidden="true">B</span> Blank (medium)
            </button>
            <button type="button" disabled={!sel} onClick={() => applyRole("negative")}>
              <span className="well-swatch well-negative" aria-hidden="true">V</span> Vehicle (negative control)
            </button>
            <button type="button" disabled={!sel} onClick={() => applyRole("positive")}>
              <span className="well-swatch well-positive" aria-hidden="true">K</span> Kill / positive control
            </button>
            <button type="button" disabled={!sel} onClick={() => applyRole("empty")}>
              <span className="well-swatch" aria-hidden="true" /> Empty
            </button>
          </div>
          {compounds.length > 0 && (
            <label className="field">
              <span>Controls serve</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">The whole plate</option>
                {compounds.map((c) => <option key={c} value={c}>Only {c} (e.g. one vehicle column per cell line)</option>)}
              </select>
            </label>
          )}
          <h4>Compound series</h4>
          <label className="field">
            <span>Compound</span>
            <input value={spec.compound} list="plate-compounds" aria-label="Compound name"
              onChange={(e) => setSpec({ ...spec, compound: e.target.value })} />
            <datalist id="plate-compounds">
              {compounds.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <fieldset className="field-radios plate-conc-mode">
            <legend className="sr-only">Concentrations</legend>
            <label><input type="radio" name="plate-conc-mode" checked={spec.mode === "dilution"}
              onChange={() => setSpec({ ...spec, mode: "dilution" })} /> Serial dilution</label>
            <label><input type="radio" name="plate-conc-mode" checked={spec.mode === "list"}
              onChange={() => setSpec({ ...spec, mode: "list" })} /> A list</label>
          </fieldset>
          {spec.mode === "dilution" ? (
            <div className="wizard-row">
              <label className="field field-num">
                <span>Top ({unit})</span>
                <input inputMode="decimal" aria-label="Top concentration" defaultValue={spec.top}
                  onChange={(e) => { const v = Number(e.target.value); if (v > 0) setSpec({ ...spec, top: v }); }} />
              </label>
              <label className="field field-num">
                <span>Dilution factor</span>
                <input inputMode="decimal" aria-label="Dilution factor" defaultValue={spec.factor}
                  onChange={(e) => { const v = Number(e.target.value); if (v > 1) setSpec({ ...spec, factor: v }); }} />
              </label>
            </div>
          ) : (
            <label className="field">
              <span>Concentrations, highest first ({unit})</span>
              <input value={listText} placeholder="5, 3, 2, 1, 0.7, 0.5"
                onChange={(e) => setListText(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Concentrations run</span>
            <select value={spec.direction} aria-label="Series direction"
              onChange={(e) => setSpec({ ...spec, direction: e.target.value as Direction })}>
              {(Object.keys(DIRECTION_LABELS) as Direction[]).map((d) => (
                <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
              ))}
            </select>
            <span className="field-note">
              {spec.direction === "right" || spec.direction === "left"
                ? "Each selected row is one replicate."
                : "Each selected column is one replicate."}
            </span>
          </label>
          <button type="button" className="btn-primary" disabled={!sel || !spec.compound.trim()}
            onClick={applySeries}>Assign series to selection</button>
        </div>
      </div>

      <div className="plate-legend" aria-label="Plate map summary">
        <span>{counts.blank} blank</span>
        <span>{counts.negative} vehicle</span>
        <span>{counts.positive} kill / positive</span>
        {compounds.map((c, i) => (
          <span key={c} className="plate-legend-compound">
            <span className="well-swatch" style={{ background: seriesColor(i, dark) }} aria-hidden="true" />
            {c}: {Object.values(wells).filter((w) => w.role === "sample" && (w.compound ?? "Sample") === c).length} wells
          </span>
        ))}
      </div>

      <div className="wizard-row plate-save">
        <label className="field">
          <span>Save this layout as a template</span>
          <input value={tplName} placeholder="Template name" aria-label="Template name"
            onChange={(e) => { setTplName(e.target.value); setTplMsg(""); }} />
        </label>
        <button type="button" disabled={!tplName.trim() || !Object.keys(wells).length}
          onClick={() => {
            const ok = saveTemplate(tplName.trim(), format, wells);
            setTemplates(allTemplates());
            setTplMsg(ok ? `Saved “${tplName.trim()}” in this browser.` : "This browser would not store the template.");
          }}>Save template</button>
        {tplMsg && <span className="hint-block" role="status">{tplMsg}</span>}
      </div>
    </div>
  );
}

function RowCells({ r, nc, small, fill, selected, wells, onHead, onStart, onEnter }: {
  r: number;
  nc: number;
  small: boolean;
  fill: (r: number, c: number) => { bg: string; fg: string; label: string; text: string };
  selected: Set<string>;
  wells: PlateMap;
  onHead: (shift: boolean) => void;
  onStart: (r: number, c: number, shift: boolean, drag: boolean) => void;
  onEnter: (r: number, c: number) => void;
}) {
  return (
    <>
      <button type="button" className="plate-head" aria-label={`Select row ${ROW_LETTERS[r]}`}
        onClick={(e) => onHead(e.shiftKey)}>{ROW_LETTERS[r]}</button>
      {Array.from({ length: nc }, (_, c) => {
        const name = wellName(r, c);
        const f = fill(r, c);
        const role = wells[name]?.role ?? "empty";
        return (
          <button key={name} type="button" data-well={name}
            className={`plate-well well-${role}${selected.has(name) ? " selected" : ""}`}
            aria-pressed={selected.has(name)}
            aria-label={`${name}: ${f.text}`} title={`${name}: ${f.text}`}
            style={f.bg ? { background: f.bg } : undefined}
            onPointerDown={(e) => {
              e.preventDefault();
              // touch captures the pointer on the first well: release it
              // so the drag reaches the others
              e.currentTarget.releasePointerCapture?.(e.pointerId);
              onStart(r, c, e.shiftKey, true);
            }}
            onPointerEnter={() => onEnter(r, c)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onStart(r, c, e.shiftKey, false); }
            }}>
            {!small && f.label}
          </button>
        );
      })}
    </>
  );
}
