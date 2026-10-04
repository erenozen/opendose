import MenuButton from "../sheets/common/MenuButton";
import "../sheets/common/grid.css";
import { exportBundle, exportPzfxFile, openShareLink } from "./events";

/** The header's Save menu: more ways to keep and hand on the project
 *  than the project file ("Save project" stays its own button). */
export default function SaveMenu({ onSave }: { onSave: () => void }) {
  return (
    <span className="save-menu">
      <MenuButton align="right" title="Share or export the project"
        label={<span className="sr-only">More ways to save and share</span>}
        items={[
          { label: "Copy share link…", onSelect: () => openShareLink() },
          { label: "Download export bundle (.zip)", onSelect: () => exportBundle() },
          { label: "Export as .pzfx (GraphPad Prism data file)", onSelect: () => exportPzfxFile() },
          "sep",
          { label: "Download project file (.json)", onSelect: onSave },
        ]} />
    </span>
  );
}
