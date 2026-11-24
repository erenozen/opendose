// Hooks of the validation page's reference datasets (P-127): the index,
// loaded when the page opens, and opening one dataset as a project.
import { useEffect, useState } from "react";
import { useProject } from "../app/context";
import { isExampleProject } from "../guide/firstRun";
import { newId } from "../project/ids";
import { notify } from "../components/ui";
import { loadReferenceIndex, referenceProject } from "./openReferenceDataset";
import { datasetShortName, type ReferenceDataset, type ReferenceIndex } from "./referenceDatasets";

export function useReferenceIndex(): ReferenceIndex | null {
  const [index, setIndex] = useState<ReferenceIndex | null>(null);
  useEffect(() => {
    let live = true;
    void loadReferenceIndex().then((i) => { if (live) setIndex(i); }, () => {});
    return () => { live = false; };
  }, []);
  return index;
}

/** Open a reference dataset in place of the open project (Undo brings
 *  that back). */
export function useOpenReference(onOpened: () => void) {
  const { store, replace } = useProject();
  return async (d: ReferenceDataset) => {
    const name = datasetShortName(d);
    try {
      const r = await referenceProject(d, store.project.prefs, newId);
      const before = store.project;
      const worth = before.sheets.some((s) => s.kind === "data") && !isExampleProject(before);
      onOpened();
      replace(r.project, r.resultsId ?? r.dataId);
      notify(`Opened the reference dataset “${name}”: its published values are in the info sheet “Reference values”.`, {
        tone: "success", action: worth ? { label: "Undo", onAction: () => replace(before) } : undefined,
      });
    } catch (e) {
      notify(`Could not open the reference dataset “${name}”: `
        + `${String(e instanceof Error ? e.message : e).replace(/\.$/, "")}.`, { tone: "error" });
    }
  };
}
