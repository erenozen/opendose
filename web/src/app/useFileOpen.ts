import { useCallback, useState } from "react";
import { analyzeAsync } from "../lib/engine";
import { newId } from "../project/ids";
import { parseProjectFile, savedSelection } from "../project/persist";
import { useProject } from "./context";
import { prepareReproduceCheck } from "./reproduceCheck";
import { prismTableToFamily, type PrismTable } from "./factory";

/**
 * Open button: an OpenDose project (.json, v1 or v2) replaces the project;
 * a Prism file (.pzfx / .prism) adds its data tables to the project as new
 * families (one picked from a chooser, or all of them).
 */
export function useFileOpen() {
  const { apply, replace, select, setStatus, store } = useProject();
  const [prismTables, setPrismTables] = useState<PrismTable[] | null>(null);

  const importTables = useCallback((tables: PrismTable[]) => {
    let first = "";
    apply((p) => {
      let next = p;
      for (const t of tables) {
        const r = prismTableToFamily(next, t, newId);
        next = r.project;
        if (!first) first = r.dataId;
      }
      return next;
    });
    setPrismTables(null);
    if (first) select(first);
    setStatus(`Imported ${tables.length} data table${tables.length === 1 ? "" : "s"} from the `
      + "Prism file; analyses are recomputed here.");
  }, [apply, select, setStatus]);

  const openPrism = useCallback(async (file: File) => {
    // Sent as bytes for both formats: a .prism file is a zip archive, and
    // reading one as text would corrupt it. The engine tells them apart.
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const res = await analyzeAsync({
      analysis: "pzfx_import",
      data: { pzfx_b64: btoa(binary) },
      options: {},
    }, { priority: "user" }) as { error?: string; tables?: PrismTable[] };
    if (res.error || !res.tables?.length) {
      throw new Error(res.error ?? "no tables found");
    }
    if (res.tables.length === 1) importTables(res.tables);
    else setPrismTables(res.tables);
  }, [importTables]);

  const open = useCallback(async (file: File) => {
    try {
      if (/\.(pzfx|prism|prism\.zip|zip)$/i.test(file.name)) {
        await openPrism(file);
        return;
      }
      const text = await file.text();
      const project = parseProjectFile(text, { prefs: store.project.prefs, ids: newId });
      // Saved by another build: recompute and compare (stable-results-versions).
      replace(prepareReproduceCheck(text, project, file.name), savedSelection(text));
      setStatus("");
    } catch (e) {
      setStatus(`Could not load file: ${e instanceof Error ? e.message : e}`);
    }
  }, [openPrism, replace, setStatus, store]);

  return { open, prismTables, importTables, dismissPrism: () => setPrismTables(null) };
}
