import { versionLabel } from "../export/cite";
import { openChecklist } from "../report/useReport";
import { openPrivacy, openValidation } from "../share/events";
import CiteBlock from "./CiteBlock";
import Modal from "./Modal";
import { Button } from "./ui/Button";
import { notify } from "./ui/Toast.store";
import { modKey } from "../app/commandRegistry";
import { canPickFiles } from "../app/fileSave";
import { installApp, useInstallState } from "../app/install";

/** "Install as app" (P-71): what this browser can do with project files. */
function InstallNote() {
  const state = useInstallState();
  const inPlace = canPickFiles();
  const files = ".json, .pzfx and .prism files";
  if (state === "installed") {
    return (
      <p className="info-install">
        Installed as an app on this device: {files} open in it by double-click,
        and Save project ({modKey("S")}) writes back into the file you opened.
      </p>
    );
  }
  if (state === "available") {
    return (
      <p className="info-install">
        Install as app: OpenDose gets its own window, works offline, and opens {files} by
        double-click. Nothing is sent anywhere; the app is this page.{" "}
        <Button size="sm" onClick={async () => {
          if (await installApp()) notify("Installed OpenDose as an app.", { tone: "success" });
        }}>Install as app</Button>
      </p>
    );
  }
  return (
    <p className="info-install">
      {inPlace
        ? `Install as app: Chrome and Edge offer it in the address bar once the page has loaded; the app opens ${files} by double-click. In this browser Save project (${modKey("S")}) writes back into a file opened with Open…`
        : `This browser cannot install OpenDose as an app that opens files; use Open… (${modKey("O")}). Save project downloads the project file.`}
    </p>
  );
}

/** The format page (docs/project-file-format.md), with the schema beside it. */
const FORMAT_DOC = "https://github.com/erenozen/opendose/blob/main/docs/project-file-format.md";

/**
 * About OpenDose (View › About OpenDose…): privacy, the file-format
 * promise with a link to the format page, non-affiliation, the version and how to cite. A link that opens
 * another dialog closes this one first, so the two never stack.
 */
export default function AboutDialog({ dataId, onClose }: {
  /** The data table on screen, for the journal checklists. */
  dataId?: string;
  onClose: () => void;
}) {
  const then = (open: () => void) => () => { onClose(); open(); };
  return (
    <Modal title="About OpenDose" className="about-dialog" onClose={onClose}
      actions={<Button onClick={onClose}>Close</Button>}>
      <div className="info-pop">
        <p className="info-privacy">
          Privacy: all computation runs in your browser and no data is
          sent anywhere; the page contacts no server but this one.
          Autosave stays in this browser&apos;s own storage (Preferences,
          Privacy on this computer: turn it off, or forget everything).
          A share link carries the data inside it, so protect it with a
          password.{" "}
          <button type="button" data-still className="linkish" onClick={then(() => openPrivacy())}>
            How your data stays private
          </button>
        </p>
        <p className="info-format">
          File format: project files carry a version number, and every
          release opens every earlier version, so an old file never
          needs the newest build.{" "}
          <a href={FORMAT_DOC} target="_blank" rel="noopener noreferrer">
            The project file format and its JSON Schema
          </a>
        </p>
        <InstallNote />
        <p>
          OpenDose is a free, independent open-source project built
          on NumPy/SciPy. It is not affiliated with, endorsed by, or
          sponsored by GraphPad Software; results are cross-validated
          against independent implementations.
        </p>
        <p className="info-version">
          Version {versionLabel()} ·{" "}
          <button type="button" data-still className="linkish" onClick={then(() => openValidation())}>
            How OpenDose is validated
          </button>
          {" · "}
          <button type="button" data-still className="linkish" onClick={then(() => openChecklist(dataId))}>
            Journal checklists
          </button>
        </p>
        <CiteBlock />
      </div>
    </Modal>
  );
}
