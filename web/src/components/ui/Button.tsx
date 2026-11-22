// Button: the app's one button (DECISIONS 2). A closed set of variants:
//   primary    filled accent, one per view
//   secondary  a keycap (1px inset line, no fill): standalone actions
//   ghost      no line, no fill: commands inside a toolbar
//   danger     filled danger: the confirm of a destructive action
// and two sizes (sm, md). 32px tall at md on a mouse, at least 44px of
// hit area on touch. Press scale comes from the global rule in base.css;
// pass data-still to opt out.
//
// `busy` refuses clicks and swaps the label for `busyLabel` (what
// is happening: "Simulating…"); both labels share one grid cell, so the
// button keeps the width of the wider and nothing beside it moves.
import { useRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Work in progress: the button is disabled and says `busyLabel`. */
  busy?: boolean;
  /** What the button says while busy ("Simulating…"). */
  busyLabel?: string;
  ref?: Ref<HTMLButtonElement>;
}

function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md",
  extra?: string): string {
  return ["btn", `btn--${variant}`, size === "sm" ? "btn--sm" : "", extra ?? ""]
    .filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary", size = "md", busy = false, busyLabel, type = "button",
  className, disabled, children, ref, onClick, ...props
}: ButtonProps) {
  // Busy is aria-disabled, not disabled: a disabled button drops the
  // focus it had, so a keyboard user would land on the page body. The
  // click (and the form submit it would start) is refused instead.
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)}
      disabled={disabled} aria-disabled={busy || undefined} data-busy={busy ? "" : undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick} {...props}>
      {busyLabel ? (
        <span className="btn-swap">
          <span className="btn-swap-label" data-shown={!busy}>{children}</span>
          <span className="btn-swap-label" data-shown={busy}>{busyLabel}</span>
        </span>
      ) : children}
    </button>
  );
}

export interface FileButtonProps extends Omit<ButtonProps, "onClick" | "onChange"> {
  /** File types the picker offers (the input's accept). */
  accept: string;
  /** Called with the chosen file; the input is reset, so picking the
   *  same file again fires again. */
  onFile?: (file: File) => void;
  /** With `multiple`: called with every chosen file. */
  onFiles?: (files: File[]) => void;
  /** The picker takes several files at once. */
  multiple?: boolean;
  /** Accessible name of the file input itself (scripts set files on it). */
  inputLabel: string;
  children: ReactNode;
}

/** A real button that opens the file picker: keyboard reachable, unlike
 *  a label wrapped around a hidden input (K2). The input stays in the
 *  DOM, visually hidden and out of the tab order. */
export function FileButton({
  accept, onFile, onFiles, multiple, inputLabel, children, ...props
}: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button {...props} onClick={() => input.current?.click()}>{children}</Button>
      <input ref={input} type="file" accept={accept} multiple={multiple} className="sr-only"
        tabIndex={-1} aria-hidden="true" aria-label={inputLabel}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          onFiles?.(files);
          onFile?.(files[0]);
        }} />
    </>
  );
}
