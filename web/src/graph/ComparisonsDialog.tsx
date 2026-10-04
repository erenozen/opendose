// Pairwise comparisons on the graph: brackets with asterisks or exact P
// values taken from the bound results, or a compact letter display.
import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import { analyzeAsync } from "../lib/engine";
import { CHROME_DARK, CHROME_LIGHT, isDarkMode } from "../lib/palette";
import { withField, type ComparisonsFormat, type GraphFormat, type LettersFormat } from "./format";
import type { ComparisonSet } from "./results";
import {
  formatPStyle, graphHideNs, graphPStyle, lettersInputKey, lettersPayload, pairKey,
  parseEngineLetters, pStyleOptions, starScale, starsFor, type PStyle,
} from "./significance";
import { lettersFor } from "./apply";
import {
  CheckField, ColorField, DialogActions, NumField, SelectField, Tabs,
} from "./controls";

type EngineState = "idle" | "asking" | "engine" | "client";

export default function ComparisonsDialog({
  format, set, groups, engineReady, onApply, onClose,
}: {
  format: GraphFormat;
  set: ComparisonSet;
  /** Group names in plotting order (for the letters). */
  groups: string[];
  engineReady: boolean;
  onApply: (f: GraphFormat) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(format);
  const [applied, setApplied] = useState(format);
  const [tab, setTab] = useState<"brackets" | "letters">(
    format.letters?.show && !format.comparisons?.show ? "letters" : "brackets");
  const chrome = isDarkMode() ? CHROME_DARK : CHROME_LIGHT;
  const c: ComparisonsFormat = draft.comparisons ?? { show: false };
  const l: LettersFormat = draft.letters ?? { show: false };
  const setC = (p: Partial<ComparisonsFormat>) =>
    setDraft((d) => withField(d, "comparisons", { ...c, ...p }));
  const setL = (p: Partial<LettersFormat>) =>
    setDraft((d) => withField(d, "letters", { ...l, ...p }));
  const hidden = new Set(c.hidden ?? []);
  // Absent: the project's P style and "hide ns" (Preferences → Reporting).
  const pStyle: PStyle = graphPStyle(draft);
  const projectHideNs = graphHideNs(undefined);
  const hideNs = graphHideNs(c);
  const plain = set.comparisons.filter((x) => !x.family);
  const alpha = l.alpha ?? 0.05;

  // Ask the engine for the letters; fall back to the in-browser algorithm
  // when this build's engine has no compact_letters handler.
  const [engine, setEngine] = useState<EngineState>("idle");
  const key = lettersInputKey(groups, plain, alpha);
  const wantLetters = l.show;
  const cached = draft.letters?.engine?.input;
  useEffect(() => {
    if (!wantLetters) return;
    if (cached === key) { setEngine("engine"); return; }
    if (!engineReady) { setEngine("client"); return; }
    let live = true;
    setEngine("asking");
    // The key is the exact engine payload, so the request is rebuilt from it.
    const payload = JSON.parse(key) as ReturnType<typeof lettersPayload>;
    analyzeAsync({ analysis: "compact_letters", data: payload,
      options: { alpha: payload.alpha } }, { priority: "user" }).then((res) => {
      const letters = parseEngineLetters(res, payload.groups);
      if (!live) return;
      setEngine(letters ? "engine" : "client");
      if (letters) {
        setDraft((d) => withField(d, "letters", { ...(d.letters ?? { show: true }),
          engine: { input: key, letters } }));
      }
    }).catch(() => { if (live) setEngine("client"); });
    return () => { live = false; };
  }, [wantLetters, key, cached, engineReady]);

  const preview = lettersFor(groups, plain, alpha, l.style ?? "lower", draft.letters?.engine);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  return (
    <Modal title="Pairwise comparisons" className="modal-wide fmt-dialog" onClose={onClose}
      onSubmit={() => { if (dirty) onApply(draft); onClose(); }}
      actions={<DialogActions onCancel={onClose}
        onApply={() => { onApply(draft); setApplied(draft); }} dirty={dirty} />}>
      <p className="modal-text">From: {set.label}{set.unmatched
        ? ` (${set.unmatched} comparison${set.unmatched === 1 ? "" : "s"} not between plotted groups left out)`
        : ""}.</p>
      <Tabs label="Comparison display" value={tab} onChange={setTab}
        tabs={[["brackets", "Brackets"], ["letters", "Compact letters"]]} />
      {tab === "brackets" ? (
        <div role="tabpanel" className="fmt-panel">
          <CheckField label="Show comparison brackets on the graph" checked={c.show}
            onChange={(v) => setC({ show: v })} />
          <fieldset className="fmt-section wide">
            <legend>Comparisons on the graph</legend>
            <div className="fmt-pairs">
              {set.comparisons.map((x) => {
                const k = pairKey(x);
                return (
                  <label key={k} className="check-row fmt-pair">
                    <input type="checkbox" checked={!hidden.has(k)} onChange={(e) => {
                      const h = new Set(hidden);
                      if (e.target.checked) h.delete(k); else h.add(k);
                      setC({ hidden: h.size ? [...h] : undefined });
                    }} />
                    <span>{x.family ? `${x.family}: ` : ""}{x.a} vs. {x.b}</span>
                    <span className="fmt-pval">{formatPStyle(x.p, pStyle, pStyle === "apa" ? "p = " : "P = ")}
                      {" "}<b>{starsFor(x.p, pStyle)}</b></span>
                  </label>
                );
              })}
            </div>
            <span className="fmt-pair-tools">
              <button type="button" className="fmt-mini" onClick={() => setC({ hidden: undefined })}>
                Tick all</button>
              <button type="button" className="fmt-mini" onClick={() =>
                setC({ hidden: set.comparisons.filter((x) => x.p > 0.05).map(pairKey) })}>
                Only significant</button>
            </span>
            {set.comparisons.some((x) => x.family) && (
              <p className="field-note">Comparisons within one row of a two-way design are
                drawn on grouped graphs only.</p>
            )}
          </fieldset>
          <div className="fmt-grid">
            <SelectField label="P value style" value={draft.pStyle ?? ""}
              options={pStyleOptions()}
              onChange={(v) => setDraft((d) => withField(d, "pStyle", v === "" ? undefined : v))} />
            <SelectField label="Label" value={c.display ?? "stars"}
              options={[["stars", pStyle === "graphpad" ? "Asterisks (ns, *, **, ***, ****)"
                : "Asterisks (ns, *, **, ***)"], ["p", "Exact P value"]]}
              onChange={(v) => setC({ display: v === "stars" ? undefined : v })} />
            {c.display === "p" && (
              <SelectField label="P value prefix" value={c.prefix ?? "P = "}
                options={[["P = ", "P = "], ["p = ", "p = "], ["", "None"]]}
                onChange={(v) => setC({ prefix: v === "P = " ? undefined : v })} />
            )}
            <SelectField label="Show" value={c.threshold == null ? "all" : String(c.threshold)}
              options={[["all", "All ticked comparisons"], ["0.05", "Only P < 0.05"],
                ["0.01", "Only P < 0.01"], ["0.001", "Only P < 0.001"]]}
              onChange={(v) => setC({ threshold: v === "all" ? undefined : Number(v) })} />
            <CheckField label={`Hide non-significant (ns) pairs${c.hideNs === undefined
              ? " (as in Preferences)" : ""}`} checked={hideNs}
              onChange={(v) => setC({ hideNs: v === projectHideNs ? undefined : v })} />
            <SelectField label="Bracket style" value={c.style ?? "bracket"}
              options={[["bracket", "Bracket with short ends"], ["tall", "Bracket with long ends"],
                ["line", "Line only"]]}
              onChange={(v) => setC({ style: v === "bracket" ? undefined : v })} />
            <NumField label="Line width" value={c.lineWidth} onChange={(v) => setC({ lineWidth: v })} />
            <NumField label="Label size" value={c.textSize} onChange={(v) => setC({ textSize: v })} />
            <ColorField label="Colour" value={c.color} auto={chrome.ink} surface={chrome.surface}
              onChange={(v) => setC({ color: v })} />
          </div>
          <p className="field-note">Asterisks: {starScale(pStyle, hideNs)} (multiplicity-adjusted
            where the test adjusts). The figure legend under the graph states this scale. The
            project&apos;s style (Preferences → Reporting) also writes the results tables and
            sentences; a style chosen here applies to this graph only.</p>
        </div>
      ) : (
        <div role="tabpanel" className="fmt-panel">
          <CheckField label="Show compact letters above the groups" checked={l.show}
            onChange={(v) => setL({ show: v })} />
          <p className="field-note">Groups that share a letter are not significantly
            different at the chosen α.</p>
          <div className="fmt-grid">
            <NumField label="Significance level (α)" value={l.alpha} placeholder="0.05"
              onChange={(v) => setL({ alpha: v && v > 0 && v < 1 ? v : undefined })} />
            <SelectField label="Letters" value={l.style ?? "lower"}
              options={[["lower", "a, b, c"], ["upper", "A, B, C"], ["numbers", "1, 2, 3"]]}
              onChange={(v) => setL({ style: v === "lower" ? undefined : v })} />
            <NumField label="Text size" value={l.size} onChange={(v) => setL({ size: v })} />
            <ColorField label="Colour" value={l.color} auto={chrome.ink} surface={chrome.surface}
              onChange={(v) => setL({ color: v })} />
          </div>
          {l.show && (
            <>
              <table className="results-table fmt-letters">
                <thead><tr><th>Group</th><th>Letters</th></tr></thead>
                <tbody>
                  {groups.map((g, i) => <tr key={g}><th>{g}</th><td>{preview[i]}</td></tr>)}
                </tbody>
              </table>
              <p className="field-note" role="status">
                {engine === "asking" ? "Asking the analysis engine…"
                  : engine === "engine" ? "Letters computed by the analysis engine."
                    : "Letters computed in the browser (insert-and-absorb algorithm); "
                      + "this engine build has no compact-letters handler."}
              </p>
            </>
          )}
          {c.show && l.show && (
            <p className="field-note">Brackets and letters are both on; most figures use one.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
