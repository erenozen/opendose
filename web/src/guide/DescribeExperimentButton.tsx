import { useState } from "react";
import { Button } from "../components/ui";
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
      <Button className="describe-experiment" onClick={() => setOpen(true)}>
        Not sure? Describe your experiment…</Button>
      {open && (
        <DesignDialog action="Create this table" onClose={() => setOpen(false)}
          onPick={(r) => { setOpen(false); onPick(r); }} />
      )}
    </>
  );
}
