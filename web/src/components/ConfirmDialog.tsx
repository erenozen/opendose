import Modal from "./Modal";
import { Button } from "./ui/Button";

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
          <Button onClick={() => onDone(false)}>Cancel</Button>
          <Button type="submit" autoFocus variant={opts.danger ? "danger" : "primary"}>
            {opts.confirmLabel}
          </Button>
        </>
      }>
      <p className="modal-text">{opts.body}</p>
    </Modal>
  );
}
