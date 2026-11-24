// The lab kit (P-75) against this browser's stores: what an export
// gathers, and what an import adds. The format and its merge rules are in
// project/labKit.ts; the dialog is components/LabKit.tsx.
import { APP_VERSION } from "../export/cite";
import { saveBlob } from "../export/download";
import { browserExportDefault, setBrowserExportDefault } from "../export/useExportSettings";
import { savedEquations, saveEquation } from "../lib/userEquation";
import {
  KIT_EXTENSION, mergeEntries, nextName, serializeKit, type KitSection, type LabKit,
} from "../project/labKit";
import { loadPrefs } from "../project/prefs";
import type { Prefs } from "../project/types";
import { browserRecipes, saveBrowserRecipe } from "../share/recipes/saved";
import { savedTemplates as savedPlateLayouts, saveTemplate as savePlateLayout } from "../sheets/assays/plate/templates";
import { addTemplates, loadSavedTemplates } from "./templates";

const EVENT = "opendose-lab-kit";

/** Open the import dialog for a kit file (Preferences, the templates
 *  picker, Open… or a drop of a kit file). */
export function openLabKitImport(file: File): void {
  window.dispatchEvent(new CustomEvent<File>(EVENT, { detail: file }));
}

export function onLabKitImport(fn: (file: File) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<File>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Everything this browser holds that a kit carries. */
export async function gatherKit(now = new Date()): Promise<Omit<LabKit, "version">> {
  return {
    exportedAt: now.toISOString(),
    software: `OpenDose ${APP_VERSION}`,
    templates: await loadSavedTemplates(),
    recipes: browserRecipes(),
    plateLayouts: savedPlateLayouts().map((t) => ({
      name: t.name, format: t.format, wells: t.wells, description: t.description,
    })),
    equations: savedEquations(),
    preferences: loadPrefs(),
    exportSettings: browserExportDefault(),
  };
}

export function kitFileName(now = new Date()): string {
  return `opendose-lab-kit-${now.toISOString().slice(0, 10)}${KIT_EXTENSION}`;
}

/** Download this browser's kit; returns what it holds. */
export async function downloadKit(): Promise<Omit<LabKit, "version">> {
  const kit = await gatherKit();
  saveBlob(new Blob([serializeKit(kit)], { type: "application/json" }), kitFileName());
  return kit;
}

export interface KitImportOutcome {
  /** Section -> entries added (preferences: 1 when applied). */
  added: Partial<Record<KitSection, number>>;
  /** Entries already here, not doubled. */
  already: number;
  /** Names taken here by other content: the kit's came in renamed. */
  renamed: string[];
  /** Entries this browser refused to store (storage full or blocked). */
  failed: number;
}

/**
 * Add the chosen sections of a kit to this browser. Lists are merged
 * (project/labKit.ts mergeEntries: nothing here is overwritten); the
 * preferences and export settings, when chosen, replace this browser's
 * through `setPrefs`, as changing them in Preferences does.
 */
export async function importKit(kit: LabKit, sections: ReadonlySet<KitSection>,
  setPrefs: (p: Prefs) => void): Promise<KitImportOutcome> {
  const out: KitImportOutcome = { added: {}, already: 0, renamed: [], failed: 0 };
  const note = (s: KitSection, m: { added: number; already: number; renamed: string[] }) => {
    out.added[s] = m.added;
    out.already += m.already;
    out.renamed.push(...m.renamed);
  };

  if (sections.has("templates") && kit.templates.length) {
    const have = await loadSavedTemplates();
    const m = mergeEntries(have, kit.templates, {
      key: (t) => t.id,
      rekey: (t, taken) => ({ ...t, id: nextName(t.id, taken) }),
      content: (t) => ({ ...t, id: "", savedAt: 0 }),
      label: (t) => t.name,
    });
    note("templates", m);
    if (m.added && !await addTemplates(m.list.slice(have.length))) out.failed += m.added;
  }
  if (sections.has("recipes") && kit.recipes.length) {
    const have = browserRecipes();
    const m = mergeEntries(have, kit.recipes, {
      key: (r) => r.name,
      rekey: (r, taken) => ({ ...r, name: nextName(r.name, taken) }),
      content: (r) => r.spec,
    });
    note("recipes", m);
    // saving replaces a recipe with the same id: give an added one a free id
    const ids = new Set(have.map((x) => x.id));
    for (const r of m.list.slice(have.length)) {
      const id = ids.has(r.id) ? nextName(r.id, (k) => ids.has(k)) : r.id;
      ids.add(id);
      if (!saveBrowserRecipe({ ...r, id })) out.failed++;
    }
  }
  if (sections.has("plateLayouts") && kit.plateLayouts.length) {
    const have = savedPlateLayouts().map((t) => ({
      name: t.name, format: t.format as number, wells: t.wells as Record<string, unknown>,
      description: t.description,
    }));
    const m = mergeEntries(have, kit.plateLayouts, {
      key: (l) => l.name,
      rekey: (l, taken) => ({ ...l, name: nextName(l.name, taken) }),
      content: (l) => [l.format, l.wells],
    });
    note("plateLayouts", m);
    for (const l of m.list.slice(have.length)) {
      if (!savePlateLayout(l.name, l.format as 96 | 384, l.wells as Parameters<typeof savePlateLayout>[2])) out.failed++;
    }
  }
  if (sections.has("equations") && kit.equations.length) {
    const have = savedEquations();
    const m = mergeEntries(have, kit.equations, {
      key: (e) => e.id,
      rekey: (e, taken) => ({ ...e, id: nextName(e.id, taken) }),
      content: (e) => ({ ...e, id: "" }),
      label: (e) => e.name || e.id,
    });
    note("equations", m);
    for (const e of m.list.slice(have.length)) saveEquation(e);
  }
  if (sections.has("preferences") && kit.preferences) {
    setPrefs(kit.preferences);
    out.added.preferences = 1;
  }
  if (sections.has("exportSettings") && kit.exportSettings) {
    if (setBrowserExportDefault(kit.exportSettings)) out.added.exportSettings = 1;
    else out.failed++;
  }
  return out;
}
