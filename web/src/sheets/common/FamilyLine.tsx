// The family line of a comparisons table: how many comparisons the P
// values were adjusted for, and by which method (report/family.ts). A
// p.model-line, so Copy / CSV of the results carries it too.
import { familyLine, familyOf, type Family } from "../../report/family";
import "../column/residuals.css";

export default function FamilyLine({ mc, fallbackMethod, family }: {
  mc?: unknown; fallbackMethod?: string; family?: Family | null;
}) {
  const f = family ?? familyOf(mc, fallbackMethod);
  if (!f) return null;
  const note = f.kind === "adjusted" || f.kind === "fdr"
    ? " The unadjusted P is each comparison's own test before the correction; report the adjusted one."
    : "";
  return (
    <p className="model-line family-line" data-family-size={f.size}>
      {familyLine(f)}{note}
    </p>
  );
}
