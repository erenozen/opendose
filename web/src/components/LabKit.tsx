// The lab kit (P-75): the import dialog for a kit file (opened from
// Preferences, the templates picker, Open… or a drop) and the export
// action Preferences and the palette share. Format and merge rules:
// project/labKit.ts; this browser's stores: app/labKit.ts.
import { useEffect, useState } from "react";
import { useProject } from "../app/context";
import { importKit, onLabKitImport } from "../app/labKit";
import { KIT_SECTIONS, parseKit, sectionCount, type KitSection, type LabKit } from "../project/labKit";
import Modal from "./Modal";
import { Button, notify } from "./ui";
import "./labKit.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const reason = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/\.$/, "");

const SECTION_LABEL: Record<KitSection, (n: number) => string> = {
  templates: (n) => plural(n, "template"),
  recipes: (n) => plural(n, "import recipe"),
  plateLayouts: (n) => plural(n, "plate layout"),
  equations: (n) => plural(n, "equation"),
  preferences: () => "Preferences",
  exportSettings: () => "Image export settings",
};
const SECTION_NOTE: Partial<Record<KitSection, string>> = {
  preferences: "Replace this browser's, and apply to the open project as Preferences does",
  exportSettings: "Replace this browser's starting size, resolution and format",
};

/** Answers openLabKitImport: reads the file, then asks what to import. */
export default function LabKitHost() {
  const [open, setOpen] = useState<{ file: string; kit: LabKit } | null>(null);
  useEffect(() => onLabKitImport((file) => {
    void file.text().then(parseKit).then(
      (kit) => setOpen({ file: file.name, kit }),
      (e) => notify(`Could not import the lab kit “${file.name}”: ${reason(e)}.`, { tone: "error" }),
    );
  }), []);
  if (!open) return null;
  return <LabKitDialog file={open.file} kit={open.kit} onClose={() => setOpen(null)} />;
}

function LabKitDialog({ file, kit, onClose }: { file: string; kit: LabKit; onClose: () => void }) {
  const { setPrefs } = useProject();
  const present = KIT_SECTIONS.filter((s) => sectionCount(kit, s) > 0);
  const [chosen, setChosen] = useState<ReadonlySet<KitSection>>(() => new Set(present));
  const [busy, setBusy] = useState(false);
  const toggle = (s: KitSection, on: boolean) => setChosen((prev) => {
    const next = new Set(prev);
    if (on) next.add(s); else next.delete(s);
    return next;
  });
  const when = kit.exportedAt ? new Date(kit.exportedAt) : null;

  const submit = async () => {
    if (busy || !chosen.size) return;
    setBusy(true);
    const r = await importKit(kit, chosen, setPrefs);
    onClose();
    const parts = present.filter((s) => chosen.has(s) && r.added[s] !== undefined)
      .map((s) => (s === "preferences" || s === "exportSettings"
        ? SECTION_LABEL[s](1).toLowerCase() : SECTION_LABEL[s](r.added[s] ?? 0)));
    const extra = [
      r.already ? `${plural(r.already, "entry", "entries")} already here ${r.already === 1 ? "was" : "were"} not doubled` : "",
      r.renamed.length ? `renamed (the name was taken): ${r.renamed.map((n) => `“${n}”`).join(", ")}` : "",
    ].filter(Boolean).join("; ");
    if (r.failed) {
      notify(`Could not store ${plural(r.failed, "entry", "entries")} of the lab kit “${file}”: `
        + "this browser refused (storage full or blocked). Free space in Preferences, then import it again.",
      { tone: "error" });
    } else {
      notify(`Imported the lab kit “${file}”: ${parts.join(", ") || "nothing new"}${extra ? `; ${extra}` : ""}.`,
        { tone: "success" });
    }
  };

  return (
    <Modal title="Import a lab kit" onClose={onClose} onSubmit={() => { void submit(); }}
      actions={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Importing…"
            disabled={!chosen.size}>Import</Button>
        </>
      )}>
      <p className="modal-text">
        “{file}”{when && !Number.isNaN(when.getTime()) ? `, exported ${when.toLocaleString()}` : ""}
        {kit.software ? ` from ${kit.software}` : ""}. Entries already in this browser are not
        doubled, and none is overwritten: one whose name is taken comes in as “name (2)”.
      </p>
      {present.length ? (
        <fieldset className="field-radios lab-kit-sections">
          <legend>Import</legend>
          {present.map((s) => (
            <label key={s} className="check-row">
              <input type="checkbox" checked={chosen.has(s)} onChange={(e) => toggle(s, e.target.checked)} />
              <span>
                {SECTION_LABEL[s](sectionCount(kit, s))}
                {SECTION_NOTE[s] && <span className="field-note">{SECTION_NOTE[s]}</span>}
              </span>
            </label>
          ))}
          <p className="field-note" role="status">{chosen.size ? "" : "Tick at least one part to import."}</p>
        </fieldset>
      ) : (
        <p className="modal-text">This kit is empty: it was exported from a browser with nothing saved.</p>
      )}
    </Modal>
  );
}
