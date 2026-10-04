// The legend sentence shown under a graph (caption mode "under the graph"):
// on screen only, so exported images stay clean, with a Copy button for
// the manuscript's figure legend.
import { useState } from "react";
import "./figure.css";

export default function GraphCaption({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <p className="graph-caption" aria-label="Legend sentence">
      <span>{text}</span>
      <button type="button" onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>{copied ? "Copied" : "Copy"}</button>
    </p>
  );
}
