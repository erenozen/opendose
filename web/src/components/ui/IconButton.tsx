// IconButton: a Button whose only content is an icon. The accessible
// name is required by the type, so an unlabelled icon button does not
// compile. Ghost by default (toolbars, dismiss buttons).
import { Button, type ButtonProps } from "./Button";

export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "busyLabel"> {
  /** What the button does, for screen readers ("Dismiss notification"). */
  "aria-label": string;
}

export function IconButton({ variant = "ghost", className, ...props }: IconButtonProps) {
  return <Button variant={variant} className={className ? `btn--icon ${className}` : "btn--icon"}
    {...props} />;
}
