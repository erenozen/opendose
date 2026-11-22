import { fileSlug, toDelimited } from "../../project/exportTable";
import { copyText, downloadText } from "./download";
import { Button, SwapLabel, notify, useLabelSwap } from "../../components/ui";
import "./grid.css";

/** "Copy table" / "CSV" for one results table (the shell's Copy results
 *  strip exports the whole sheet). `matrix` is the table as rows of text,
 *  header row first, at full precision. Copy says "Copied" on itself
 *  (ui/LabelSwap); a failure is an error toast. */
export default function TableCopy({ name, matrix }: { name: string; matrix: () => string[][] }) {
  const copied = useLabelSwap();
  return (
    <div className="results-export table-copy" role="group" aria-label={`Export ${name}`}>
      <Button size="sm" variant="ghost" aria-label={`Copy ${name} as tab-separated text`}
        onClick={async () => {
          const m = matrix();
          if (m.length < 2) {
            notify(`Nothing to copy yet: “${name}” has no rows.`, { tone: "info" });
            return;
          }
          if (await copyText(toDelimited(m, "tsv"))) copied.flash(`Copied ${name}`);
          else {
            notify(`Could not copy “${name}”: the browser refused the clipboard. Download it as CSV instead.`,
              { tone: "error" });
          }
        }}>
        <SwapLabel swapped={copied.swapped} done="Copied">Copy table</SwapLabel>
      </Button>
      <Button size="sm" variant="ghost" aria-label={`Download ${name} as CSV`}
        onClick={() => downloadText(`${fileSlug(name, "table")}.csv`, toDelimited(matrix(), "csv"),
          "text/csv;charset=utf-8")}>CSV</Button>
    </div>
  );
}
