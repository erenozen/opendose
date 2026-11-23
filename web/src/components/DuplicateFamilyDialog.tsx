import { useState } from "react";
import Modal from "./Modal";
import { Button, Field, Input } from "./ui";

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
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">Duplicate</Button>
        </>
      }>
      <p className="modal-text">
        Copies “{tableName}” together with its {childCount} linked results
        and graph sheet{childCount === 1 ? "" : "s"}. Sheet names that contain
        the table name get the new name instead.
      </p>
      {/* The first control: Dialog focuses it on fine pointers (no autoFocus,
          which would open the keyboard on a phone). */}
      <Field label="Name of the new data table">
        <Input value={name} autoComplete="off" onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()} />
      </Field>
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
