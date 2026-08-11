import { useState } from "react";
import type { AnalysisResult, OptionsState } from "../types";
import { MODELS_META, formatSig } from "../types";

interface Props {
  result: AnalysisResult | null;
  options: OptionsState;
  xUnit: string;
}

// Auto-generated manuscript sentence, ready to paste into a paper.
export default function MethodsText({ result, options, xUnit }: Props) {
  const [copied, setCopied] = useState(false);
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
    `intervals, using OpenDose (open-source, built on SciPy)`);

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
    (ic50s.length ? ic50s.join("; ") + "." : "");

  return (
    <div className="result-card methods-text">
      <h3>Methods text</h3>
      <p>{text}</p>
      <button className="copy-btn" onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>
        {/* Keyed remount lets @starting-style blur-crossfade the label */}
        <span className="swap-label" key={copied ? "copied" : "copy"}>
          {copied ? "Copied ✓" : "Copy"}
        </span>
      </button>
    </div>
  );
}
