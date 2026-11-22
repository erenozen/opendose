// The Button's closed sets of variants and sizes, and its class list.
// Apart from Button.tsx so Menu.Trigger and Popover.Trigger can look like
// the Button they are without importing a component module.
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

/** The class list of a Button of this variant and size. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md",
  extra?: string): string {
  return ["btn", `btn--${variant}`, size === "sm" ? "btn--sm" : "", extra ?? ""]
    .filter(Boolean).join(" ");
}
