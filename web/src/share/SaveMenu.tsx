import MenuButton from "../sheets/common/MenuButton";
import "../sheets/common/grid.css";
import { exportBundle, exportPzfxFile, openPptxExport, openReplay, openShareLink } from "./events";
import { usePrismBatch } from "./usePrismBatch";

/** The header's Save menu: more ways to keep and hand on the project
 *  than the project file ("Save project" stays its own button), the
 *  PowerPoint export, applying the project to new data, and the batch
 *  conversion of GraphPad Prism files to CSV. */
export default function SaveMenu({ onSave }: { onSave: () => void }) {
  const batch = usePrismBatch();
  return (
    <span className="save-menu">
      <MenuButton align="right" title="Share or export the project"
        label={<span className="sr-only">More ways to save and share</span>}
        items={[
          { label: "Copy share link…", onSelect: () => openShareLink() },
          { label: "Download export bundle (.zip)", onSelect: () => exportBundle() },
          { label: "Export tables as .pzfx (opens in GraphPad Prism)", onSelect: () => exportPzfxFile() },
          { label: "Export graphs to PowerPoint (.pptx)…", onSelect: () => openPptxExport(null, { kind: "all" }) },
          "sep",
          { label: "Apply to new data…", onSelect: () => openReplay() },
          { label: "Convert Prism files to CSV…", onSelect: batch.pick },
          "sep",
          { label: "Download project file (.json)", onSelect: onSave },
        ]} />
      {batch.input}
    </span>
  );
}
