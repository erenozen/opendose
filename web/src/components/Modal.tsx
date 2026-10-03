import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal dialog on the native <dialog> element: focus is trapped and
 * restored by the browser, Escape cancels, a click on the backdrop closes.
 * Submitting the form (Enter in a field, or the primary button) calls
 * onSubmit.
 */
export default function Modal({
  title, onClose, onSubmit, children, actions, className = "", role,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  children: ReactNode;
  actions: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  return (
    <dialog ref={ref} className={`modal ${className}`} aria-labelledby={titleId}
      role={role}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onPointerDown={(e) => { if (e.target === ref.current) onClose(); }}>
      <form className="modal-body" method="dialog"
        onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
        <h2 id={titleId} className="modal-title">{title}</h2>
        {children}
        <div className="modal-actions">{actions}</div>
      </form>
    </dialog>
  );
}
