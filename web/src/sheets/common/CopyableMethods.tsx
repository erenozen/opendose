import { useState } from "react";

/** A "Methods text" card: a manuscript-ready paragraph with a Copy button,
 *  styled like the curve-fit methods text. */
export default function CopyableMethods({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <div className="result-card methods-text">
      <h3>Methods text</h3>
      <p>{text}</p>
      <button type="button" className="copy-btn" onClick={() => {
        void navigator.clipboard?.writeText(text);
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
