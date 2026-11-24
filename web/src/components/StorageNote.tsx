// Preferences, "Privacy on this computer": how much this browser holds for
// OpenDose and whether it agreed to keep it (navigator.storage). The words
// come from project/sessions.ts describeStorage; nothing is promised that
// the browser did not say.
import { useEffect, useState } from "react";
import { describeStorage, MAX_KEPT, storageReport } from "../project/sessions";

export default function StorageNote({ autosaveOn }: { autosaveOn: boolean }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void storageReport(typeof navigator !== "undefined" ? navigator.storage : null)
      .then((r) => { if (live) setText(describeStorage(r)); });
    return () => { live = false; };
  }, []);
  return (
    <>
      <p className="prefs-note storage-note">
        {text ?? "Checking this browser's storage…"}
      </p>
      {autosaveOn && <p className="prefs-note">
        Each tab keeps its own session. Sessions of closed tabs are offered when OpenDose
        next opens; past the {MAX_KEPT} most recent, the oldest are deleted.
      </p>}
      <p className="prefs-note">
        Saved versions (File › Save a version…) stay until you delete them in File › Open recent…,
        whether autosave is on or off.
      </p>
    </>
  );
}
