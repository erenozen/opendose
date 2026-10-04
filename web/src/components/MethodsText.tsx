import { useProject } from "../app/context";
import { softwareSentence } from "../export/cite";
import { getRuntimeVersions } from "../lib/engine";
import { findSheet } from "../project/ops";
import { analysisDef } from "../sheets/registry";
import type { ResultsProps } from "../sheets/types";
import type { AnalysisResult, OptionsState } from "../types";
import { formatSig } from "../types";
import { modelMeta, USER_MODEL_ID } from "../lib/modelLibrary";
import { sharedParameters } from "../lib/userEquation";
import { constraintState } from "../sheets/xy/fitOptions";
import CiteBlock, { CopyButton } from "./CiteBlock";

interface Props {
  result: AnalysisResult | null;
  options: OptionsState;
  xUnit: string;
}

// Auto-generated manuscript sentence, ready to paste into a paper.
export default function MethodsText({ result, options, xUnit }: Props) {
  if (!result || result.error || !result.datasets.some((d) => d.fit)) {
    return null;
  }
  const isUser = options.model === USER_MODEL_ID;
  const meta = modelMeta(options.model);
  const constraints: string[] = [];
  const params = isUser ? Object.keys(options.userEquation?.rules ?? {}) : meta.constrainable;
  for (const p of params) {
    const st = constraintState(options, p);
    if (st.enabled && st.value.trim() !== "") constraints.push(`${p} = ${st.value}`);
  }

  const parts: string[] = [];
  if (isUser) {
    const eq = options.userEquation;
    const name = eq?.name.trim() || "a user-defined equation";
    const text = (eq?.text ?? "").split(/\r?\n/).map((l) => l.split(";")[0].trim())
      .filter(Boolean).join("; ");
    parts.push(`Data were fitted by nonlinear regression to ${eq?.name.trim()
      ? `the user-defined equation “${name}”` : name} (${text})`
      + (constraints.length ? `, constraining ${constraints.join(", ")}` : ""));
    const shared = eq ? sharedParameters(eq, params) : [];
    if (shared.length) {
      parts.push(`with ${shared.join(", ")} shared across datasets (global fit)`);
    }
  } else {
    parts.push(
      `Data were fitted by nonlinear regression to the "${meta.label}" model` +
      (constraints.length ? ` (constraining ${constraints.join(", ")})` : ""));
    const shared = meta.globalOnly && !options.sharedParams.length
      ? meta.shared ?? [] : options.sharedParams;
    if (shared.length) {
      parts.push(`with ${shared.join(", ")} shared across ` +
        `datasets (global fit)`);
    }
  }
  if (options.weighting !== "none") {
    const yWeights = options.weighting === "1/Y" || options.weighting === "1/Y2";
    // what the engine did (it reports weight_source with each fit)
    const direct = result.datasets.some((d) =>
      (d.fit as { weight_source?: string } | undefined)?.weight_source === "objective");
    parts.push(`using ${options.weighting} weighting` + (!yWeights ? ""
      : direct
        ? " (the weighted sum of squares, with weights from the fitted curve, minimised directly)"
        : " (weights from the fitted curve, iteratively reweighted)"));
  }
  if (options.routEnabled) {
    parts.push(`after ROUT outlier elimination (Q = ${options.routQ}%)`);
  }
  parts.push(`with ${options.ciMethod === "profile"
    ? "asymmetrical (profile likelihood)" : "asymptotic"} 95% confidence ` +
    `intervals`);

  const ic50s = result.datasets
    .filter((d) => d.fit?.params?.IC50 ?? d.fit?.params?.EC50)
    .map((d) => {
      const e = d.fit!.params.IC50 ?? d.fit!.params.EC50;
      const label = d.fit!.params.IC50 ? "IC50" : "EC50";
      const ci = e.ci95
        ? ` (95% CI ${formatSig(e.ci95[0])}–${formatSig(e.ci95[1])})` : "";
      return `${d.name}: ${label} = ${formatSig(e.value)} ${xUnit}${ci}`;
    });

  const text = parts.join(", ") + ". " +
    softwareSentence(getRuntimeVersions()) +
    (ic50s.length ? " " + ic50s.join("; ") + "." : "");

  return <MethodsCard text={text} />;
}

function MethodsCard({ text }: { text: string }) {
  return (
    <div className="result-card methods-text">
      <h3>Methods text</h3>
      <p>{text}</p>
      <CopyButton text={text} />
      <CiteBlock />
    </div>
  );
}

/**
 * Methods text for analyses that do not bring their own MethodsPanel: a
 * plain statement of which analysis ran on which table, in which software.
 * It says nothing it cannot know, so it stays correct for any analysis.
 */
export function GenericMethodsText({ sheet, table, result }: ResultsProps) {
  const { project } = useProject();
  if (!result || (typeof result === "object" && "error" in result
    && (result as { error?: unknown }).error)) return null;
  const def = analysisDef(table.type, sheet.analysis);
  const label = def?.label ?? sheet.analysis;
  const data = findSheet(project, sheet.parentId);
  const text = `The analysis “${label}” was run on the data table `
    + `“${data?.name ?? "data"}”. ${softwareSentence(getRuntimeVersions())}`;
  return <MethodsCard text={text} />;
}
