import { versionLabel } from "../export/cite";
import { openChecklist } from "../report/useReport";
import { openPrivacy, openValidation } from "../share/events";
import CiteBlock from "./CiteBlock";
import Modal from "./Modal";
import { Button } from "./ui/Button";

/**
 * About OpenDose (View › About OpenDose…): privacy, the file-format
 * promise, non-affiliation, the version and how to cite. A link that opens
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
          needs the newest build.
        </p>
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
