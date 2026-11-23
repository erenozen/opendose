// The close guard of dialogs that hold unapplied edits (the format
// dialogs, the assay wizard).
import { useCallback, useRef } from "react";
import { useUi } from "../app/ui";

/**
 * Escape or a click outside a format dialog with unapplied edits asks
 * before it drops them: a long dialog is easy to leave by
 * accident. Cancel stays a plain close, since pressing it is the choice.
 * Returns the onClose to give the Modal.
 */
export function useDiscardGuard(dirty: boolean, onClose: () => void,
  body = "The edits in this dialog have not been applied to the graph."): () => void {
  const ui = useUi();
  const asking = useRef(false);
  return useCallback(() => {
    if (!dirty) { onClose(); return; }
    if (asking.current) return;
    asking.current = true;
    void ui.confirm({
      title: "Discard your changes?",
      body,
      confirmLabel: "Discard",
      danger: true,
    }).then((ok) => {
      asking.current = false;
      if (ok) onClose();
    });
  }, [dirty, onClose, ui, body]);
}
