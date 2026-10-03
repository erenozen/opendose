import { useProject } from "../app/context";
import { softwareSentence } from "../export/cite";
import { getRuntimeVersions } from "../lib/engine";
import { findSheet } from "../project/ops";
import { analysisDef } from "../sheets/registry";
import type { ResultsProps } from "../sheets/types";
import type { AnalysisResult, OptionsState } from "../types";
import { MODELS_META, formatSig } from "../types";
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
  const meta = MODELS_META[options.model];
  const constraints: string[] = [];
  if (options.top.enabled) constraints.push(`Top = ${options.top.value}`);
  if (options.bottom.enabled) constraints.push(`Bottom = ${options.bottom.value}`);
  if (options.hillSlope.enabled) {
    constraints.push(`HillSlope = ${options.hillSlope.value}`);
  }

  const parts: string[] = [];
  parts.push(
    `Data were fitted by nonlinear regression to the "${meta.label}" model` +
    (constraints.length ? ` (constraining ${constraints.join(", ")})` : ""));
  if (options.sharedParams.length) {
    parts.push(`with ${options.sharedParams.join(", ")} shared across ` +
      `datasets (global fit)`);
  }
  if (options.weighting !== "none") {
    parts.push(`using ${options.weighting} weighting`);
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
