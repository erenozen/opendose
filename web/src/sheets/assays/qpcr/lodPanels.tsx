// qPCR LoD95 from a hit-rate dilution series (engine
// assay_qpcr.lod95_by_target): the share of wells with a Cq per quantity
// and the quantity detected in 95% of wells, with Fieller's CI.
import { interval, num } from "../kit/format";
import { Chip } from "../kit/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function Lod95({ lod, level }: { lod: Record<string, any> | undefined; level: string }) {
  const rows = Object.entries(lod ?? {});
  if (!rows.length) return null;
  return (
    <div className="qpcr-lod">
      <h4>Limit of detection (LoD95) from the hit-rate series</h4>
      <div className="results-scroll">
        <table className="results-table qpcr-lod-table">
          <thead><tr><th scope="col">Target</th><th scope="col">LoD95 (quantity)</th>
            <th scope="col">{level} CI (Fieller)</th><th scope="col">Note</th>
            <th scope="col">Wells with a Cq, by quantity</th></tr></thead>
          <tbody>
            {rows.map(([t, r]) => (
              <tr key={t}>
                <th scope="row">{t}</th>
                <td>{r.lod95 != null ? <strong>{num(r.lod95)}</strong> : "not estimated"}</td>
                <td>{r.ci ? interval(r.ci) : r.lod95 != null ? "unbounded" : ""}</td>
                <td>{r.note ? <Chip tone="warn">{r.note}</Chip> : <Chip tone="pass">within the series</Chip>}</td>
                <td>{(r.levels ?? []).map((x: any) => `${num(x.quantity)}: ${x.detected}/${x.n}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="assay-cite">
        A well with a Cq is a hit. Probit regression of the hit rate on log10 quantity (Finney 1971); the LoD95
        is the quantity detected in 95% of wells, with Fieller's confidence interval, as Forootan et al. (2017,
        Biomol Detect Quantif 12:1) determine a qPCR limit of detection. MIQE (Bustin et al. 2009) asks for it
        to be reported. The quantity is in the units of the Quantity column.
      </p>
    </div>
  );
}
