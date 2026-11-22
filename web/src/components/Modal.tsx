import type { ReactNode } from "react";
import Dialog from "./ui/Dialog";

/**
 * A modal dialog that is open while mounted: callers render it when they
 * want it and unmount it to close. Built on the Dialog primitive
 * (ui/Dialog), which brings focus back to the opener, fades out on close,
 * locks the page scroll and keeps Tab inside. Escape and a backdrop click
 * call onClose; submitting the form (Enter in a field, or a submit
 * button) calls onSubmit.
 */
export default function Modal({
  title, onClose, onSubmit, children, actions, className = "", role, instant,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  children: ReactNode;
  actions: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
  /** Open without motion (a dialog summoned by a keyboard shortcut). */
  instant?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} role={role}
      className={className} instant={instant}>
      <Dialog.Body onSubmit={onSubmit}>
        <Dialog.Title>{title}</Dialog.Title>
        {children}
        <Dialog.Actions>{actions}</Dialog.Actions>
      </Dialog.Body>
    </Dialog>
  );
}
