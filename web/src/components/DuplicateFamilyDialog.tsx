import { useState } from "react";
import Modal from "./Modal";

export default function DuplicateFamilyDialog({ tableName, childCount, onCancel, onDuplicate }: {
  tableName: string;
  childCount: number;
  onCancel: () => void;
  onDuplicate: (o: { name: string; withData: boolean }) => void;
}) {
  const [name, setName] = useState(`${tableName} copy`);
  const [withData, setWithData] = useState(true);
  return (
    <Modal title="Duplicate family" className="modal-narrow" onClose={onCancel}
      onSubmit={() => onDuplicate({ name, withData })}
      actions={
        <>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary">Duplicate</button>
        </>
      }>
      <p className="modal-text">
        Copies “{tableName}” together with its {childCount} linked results
        and graph sheet{childCount === 1 ? "" : "s"}. Sheet names that contain
        the table name get the new name instead.
      </p>
      <label className="field">
        <span>Name of the new data table</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()} />
      </label>
      <fieldset className="field-radios">
        <legend>Values</legend>
        <label><input type="radio" name="dup-data" checked={withData}
          onChange={() => setWithData(true)} /> Copy the data too</label>
        <label><input type="radio" name="dup-data" checked={!withData}
          onChange={() => setWithData(false)} /> Same columns and titles, empty
          table (enter new data; analyses and graphs follow)</label>
      </fieldset>
    </Modal>
  );
}
