import { useState } from "react";
import DesignDialog from "./DesignDialog";
import type { TableRecommendation } from "./designToTable";

/** "Describe your experiment…": opens the three design questions and
 *  hands back the table they pick (start screen). */
export default function DescribeExperimentButton({ onPick }: {
  onPick: (r: TableRecommendation) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="describe-experiment" onClick={() => setOpen(true)}>
        Not sure? Describe your experiment…</button>
      {open && (
        <DesignDialog action="Create this table" onClose={() => setOpen(false)}
          onPick={(r) => { setOpen(false); onPick(r); }} />
      )}
    </>
  );
}
