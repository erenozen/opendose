// UI primitives. One import path for every surface:
//   import { Button, Banner, notify } from "../components/ui";
// One file per primitive, CSS next to it.

export { Button, FileButton } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize, FileButtonProps } from "./Button";
export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";
export { Field, Input, Textarea } from "./Field";
export { useValidationTiming } from "./Field.timing";
export type { FieldProps, InputProps, TextareaProps } from "./Field";
export { NumberField } from "./NumberField";
export { NumberRefs } from "./NumberField.refs";
export type { NumberFieldProps } from "./NumberField";
export { ToastProvider } from "./Toast";
export { notify, dismissToast } from "./Toast.store";
export type { ToastOptions, ToastTone, ToastAction } from "./Toast.store";
export { announce } from "./Announcer.store";
export type { Politeness } from "./Announcer.store";
export { Banner } from "./Banner";
export type { BannerProps, BannerTone } from "./Banner";

// Copy feedback and numbers in prose
export { SwapLabel } from "./LabelSwap";
export { useLabelSwap } from "./useLabelSwap";
export { Num, NumText } from "./Num";

export { default as Tabs } from "./Tabs";

// Overlays: Dialog, Popover, Menu, Tooltip on one dismiss/focus layer
export { default as Dialog } from "./Dialog";
export { default as Popover } from "./Popover";
export { default as Menu, type MenuCloseReason } from "./Menu";
export { default as Tooltip } from "./Tooltip";
export {
  useDismiss, usePresence, restoreFocus, lastInputWasKeyboard, coarsePointer,
  type DismissReason,
} from "./useDismiss";
