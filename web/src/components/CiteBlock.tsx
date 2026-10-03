import { useState } from "react";
import { citation } from "../export/cite";
import { copyText } from "../export/download";
import { getRuntimeVersions } from "../lib/engine";

export function CopyButton({ text, label = "Copy", className = "copy-btn" }: {
  text: string; label?: string; className?: string;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button type="button" className={className} data-label={label}
      onClick={async () => {
        setState((await copyText(text)) ? "done" : "failed");
        setTimeout(() => setState("idle"), 1500);
      }}>
      {/* Keyed remount lets @starting-style blur-crossfade the label */}
      <span className="swap-label" key={state}>
        {state === "done" ? "Copied ✓" : state === "failed" ? "Select and copy" : label}
      </span>
    </button>
  );
}

/**
 * "How to cite OpenDose": a plain reference and a BibTeX entry, each with
 * a copy button. Library versions are the ones loaded in this browser.
 */
export default function CiteBlock({ headingLevel = 4 }: { headingLevel?: 3 | 4 }) {
  const c = citation(getRuntimeVersions());
  const H = headingLevel === 3 ? "h3" : "h4";
  return (
    <div className="cite-block">
      <H className="cite-head">How to cite OpenDose</H>
      <p className="cite-text">{c.plain}</p>
      <div className="cite-actions">
        <CopyButton text={c.plain} label="Copy citation" />
        <CopyButton text={c.bibtex} label="Copy BibTeX" />
      </div>
      <details className="cite-bibtex">
        <summary>BibTeX</summary>
        <pre>{c.bibtex}</pre>
      </details>
    </div>
  );
}
