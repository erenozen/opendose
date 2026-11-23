// Under a curve fit's results: the initial value every free parameter
// started from (the model's rules or a typed start, P-21) in a fold, and
// the complete fit report to copy or download (sheets/xy/fitReport.ts).
import { formatSig, type FitResult, type OptionsState } from "../../types";
import { fileSlug, toDelimited } from "../../project/exportTable";
import { copyText, downloadText } from "../common/download";
import { Button, SwapLabel, notify, useLabelSwap } from "../../components/ui";
import { fitReportRows, fitReportText, fitStarts, startsNote } from "./fitReport";
import "./xy.css";

export function FitStarts({ name, fit, options }: {
  name: string; fit: FitResult; options?: OptionsState;
}) {
  const copied = useLabelSwap();
  const starts = fitStarts(fit);
  if (!starts.length) return null;
  return (
    <details className="advanced fit-starts" data-no-export>
      <summary>Initial values</summary>
      <table className="results-table goodness">
        <caption className="sr-only">Initial values of {name}</caption>
        <thead>
          <tr>
            <th scope="col">Parameter</th>
            <th scope="col">Start</th>
            <th scope="col">From</th>
          </tr>
        </thead>
        <tbody>
          {starts.map((s) => (
            <tr key={s.name}>
              <th scope="row">{s.name}</th>
              <td>{formatSig(s.value)}</td>
              <td>{s.source === "typed" ? "typed" : "the model's rules"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint-block">{startsNote(fit)}</p>
      <div className="fit-report-actions">
        <Button size="sm" onClick={async () => {
          if (await copyText(fitReportText(name, fit, options))) copied.flash("Fit report copied");
          else {
            notify(`Could not copy the fit report of “${name}”: the browser refused the clipboard. `
              + "Download it as CSV instead.", { tone: "error" });
          }
        }}>
          <SwapLabel swapped={copied.swapped} done="Copied">Copy fit report</SwapLabel>
        </Button>
        <Button size="sm" onClick={() => downloadText(`${fileSlug(name, "fit")}-fit-report.csv`,
          toDelimited(fitReportRows(name, fit, options), "csv"), "text/csv;charset=utf-8")}>
          Download fit report (CSV)
        </Button>
      </div>
    </details>
  );
}
