import Modal from "./Modal";

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
}

export default function ConfirmDialog({ opts, onDone }: {
  opts: ConfirmOptions;
  onDone: (ok: boolean) => void;
}) {
  return (
    <Modal title={opts.title} role="alertdialog" className="modal-narrow"
      onClose={() => onDone(false)} onSubmit={() => onDone(true)}
      actions={
        <>
          <button type="button" onClick={() => onDone(false)}>Cancel</button>
          <button type="submit" autoFocus
            className={opts.danger ? "btn-danger" : "btn-primary"}>
            {opts.confirmLabel}
          </button>
        </>
      }>
      <p className="modal-text">{opts.body}</p>
    </Modal>
  );
}
