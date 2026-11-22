import { citation } from "../export/cite";
import { copyText } from "../export/download";
import { getRuntimeVersions } from "../lib/engine";
import { Button, SwapLabel, notify, useLabelSwap } from "./ui";

/** Copy one block of text. Says "Copied" on itself for two seconds
 *  (DECISIONS 6, ui/LabelSwap); a refused clipboard is an error toast
 *  that says how to copy by hand. */
export function CopyButton({ text, label = "Copy", what = "the text" }: {
  text: string;
  label?: string;
  /** What is copied, for the error message ("the methods text"). */
  what?: string;
}) {
  const copied = useLabelSwap();
  return (
    <Button size="sm" className="copy-btn" onClick={async () => {
      if (await copyText(text)) copied.flash("Copied");
      else {
        notify(`Could not copy ${what}: the browser refused the clipboard. Select the text and `
          + "copy it with Ctrl+C (⌘C on a Mac).", { tone: "error" });
      }
    }}>
      <SwapLabel swapped={copied.swapped} done="Copied">{label}</SwapLabel>
    </Button>
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
        <CopyButton text={c.plain} label="Copy citation" what="the citation" />
        <CopyButton text={c.bibtex} label="Copy BibTeX" what="the BibTeX entry" />
      </div>
      <details className="cite-bibtex">
        <summary>BibTeX</summary>
        <pre>{c.bibtex}</pre>
      </details>
    </div>
  );
}
