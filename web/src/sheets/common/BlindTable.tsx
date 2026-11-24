// Blinding a table (P-124): the dialogs that blind and unblind it, and the
// banner the table shows while it is blind. The model is project/blinding.ts;
// keys are kept by app/blindingKeys.ts.
import { useState } from "react";
import { useProject } from "../../app/context";
import { downloadKey, findKey, keepKey, newBlindingId } from "../../app/blindingKeys";
import Modal from "../../components/Modal";
import { Banner, Button, FileButton, notify } from "../../components/ui";
import {
  blindProblem, blindTable, codeFor, codesText, leakScan, parseKey, unblindTable, type BlindingKey,
} from "../../project/blinding";
import type { DataSheet } from "../../project/types";

/** The condition: this table's group names are blinded. */
export function BlindBanner({ sheet, onUnblind }: { sheet: DataSheet; onUnblind?: () => void }) {
  const b = sheet.blinding;
  return (
    <Banner tone="info" className="blind-banner" open={!!b}>
      <Banner.Title>Group names are blinded</Banner.Title>
      <Banner.Detail>
        {b ? `The groups show as ${codesText(b.codes)} here, in graphs, results, exports and share links. `
          + "A value you exclude now is recorded as excluded blind. Unblinding needs the key." : ""}
      </Banner.Detail>
      {onUnblind && (
        <Banner.Actions><Button size="sm" onClick={onUnblind}>Unblind…</Button></Banner.Actions>
      )}
    </Banner>
  );
}

/** "Blind this table…": what changes, what still shows a name, where the key goes. */
export function BlindDialog({ sheet, onClose }: { sheet: DataSheet; onClose: () => void }) {
  const api = useProject();
  const [saveFile, setSaveFile] = useState(true);
  const problem = blindProblem(api.project, sheet.id);
  const leaks = problem ? [] : leakScan(api.project, sheet.id);
  const n = sheet.table.datasets.length;
  const blind = () => {
    if (problem || api.readOnly) return;
    const r = blindTable(api.project, sheet.id, { id: newBlindingId(), at: new Date().toISOString() });
    if ("error" in r) {
      notify(`Could not blind “${sheet.name}”: ${r.error}.`, { tone: "error" });
      return;
    }
    const kept = keepKey(r.key);
    if (saveFile || !kept) downloadKey(r.key);
    api.apply(() => r.project);
    // Undo must not bring the names back: the history before this is gone.
    api.store.reset(api.store.project);
    // Results computed with the names are dropped, so no save writes them.
    for (const s of api.store.project.sheets) {
      if (s.kind === "results" && s.parentId === sheet.id) api.results.forget(s.id);
    }
    onClose();
    notify(`Blinded “${sheet.name}”: its groups are now ${codesText(r.key.names.map((x) => x.code))}.`
      + (kept ? "" : " This browser would not keep the key, so the key file was saved: keep it."), { tone: "success" });
  };
  return (
    <Modal title={`Blind “${sheet.name}”`} onClose={onClose} onSubmit={blind}
      actions={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!!problem || api.readOnly}>Blind the table</Button>
        </>
      )}>
      {problem ? (
        <p className="ui-field-error" role="alert">This table cannot be blinded: {problem}.</p>
      ) : (
        <>
          <p className="modal-text">
            The {n} group names become the codes {codesText(Array.from({ length: n }, (_, i) => codeFor(i)))}
            {" "}in the grid, graphs, results, methods, exports and share links, in the order the
            groups have now (whoever knows that order can still tell them apart). Values and
            results do not change. Undo cannot bring the names back.
          </p>
          <p className="modal-text">
            The key, which code is which group, is kept in this browser and never in the project
            file. Without it the names cannot be restored. Forget this computer&apos;s data erases
            the copy here, so keep the key file somewhere safe.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={saveFile} onChange={(e) => setSaveFile(e.target.checked)} />
            <span>Save the key as a file too</span>
          </label>
          {leaks.length > 0 && (
            <div className="blind-leaks" role="status">
              <p className="field-note">These still show a group name and are not changed by blinding; edit them first:</p>
              <ul>{leaks.slice(0, 12).map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** "Unblind…": with the key kept in this browser, or a key file. */
export function UnblindDialog({ sheet, onClose }: { sheet: DataSheet; onClose: () => void }) {
  const api = useProject();
  const id = sheet.blinding?.id ?? "";
  const [fileKey, setFileKey] = useState<BlindingKey | null>(null);
  const [err, setErr] = useState("");
  const key = fileKey ?? (id ? findKey(id) : null);
  const readKey = async (f: File) => {
    setErr("");
    try {
      const k = parseKey(JSON.parse(await f.text()));
      if (!k) throw new Error("it is not an OpenDose blinding key");
      if (k.id !== id) throw new Error("it is the key of another blinding");
      setFileKey(k);
    } catch (e) {
      setFileKey(null);
      setErr(`Could not use “${f.name}”: ${(e instanceof Error ? e.message : String(e)).replace(/\.$/, "")}. Choose the key file saved when this table was blinded.`);
    }
  };
  const unblind = () => {
    if (!key || api.readOnly) return;
    const r = unblindTable(api.project, sheet.id, key, new Date().toISOString());
    if ("error" in r) { setErr(`Could not unblind “${sheet.name}”: ${r.error}.`); return; }
    api.apply(() => r.project);
    for (const s of api.store.project.sheets) {
      if (s.kind === "results" && s.parentId === sheet.id) api.results.forget(s.id);
    }
    onClose();
    const k = r.session.exclusions.length;
    notify(`Unblinded “${sheet.name}”: the group names are back.`
      + (k ? ` ${k === 1 ? "1 value was" : `${k} values were`} excluded while blind; the methods say so.` : ""),
    { tone: "success" });
  };
  return (
    <Modal title={`Unblind “${sheet.name}”`} onClose={onClose} onSubmit={unblind}
      actions={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!key || api.readOnly}>Unblind</Button>
        </>
      )}>
      <p className="modal-text">
        Puts the group names back from the key. Values excluded while the table was blind are
        recorded as excluded blind, in the History and the methods.
      </p>
      <p className="field-note" role="status">
        {fileKey ? "The key file matches this table." : key ? "The key is kept in this browser."
          : "This browser does not hold the key: open the key file saved when the table was blinded."}
      </p>
      {!key && (
        <div className="blind-key">
          <FileButton accept=".json,application/json" inputLabel="Blinding key file" onFile={(f) => void readKey(f)}>
            Open the key file…
          </FileButton>
        </div>
      )}
      {err && <p className="ui-field-error" role="alert">{err}</p>}
    </Modal>
  );
}
