// UI primitives (phase 3). One import path for every surface:
//   import { Button, Banner, notify } from "../components/ui";

// ---- feedback and controls (p3-feedback)
export { Button, FileButton } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize, FileButtonProps } from "./Button";
export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";
export { Field, Input } from "./Field";
export { useValidationTiming } from "./Field.timing";
export type { FieldProps, InputProps } from "./Field";
export { NumberField } from "./NumberField";
export type { NumberFieldProps } from "./NumberField";
export { ToastProvider } from "./Toast";
export { notify, dismissToast } from "./Toast.store";
export type { ToastOptions, ToastTone, ToastAction } from "./Toast.store";
export { Announcer } from "./Announcer";
export { announce } from "./Announcer.store";
export type { Politeness } from "./Announcer.store";
export { Banner } from "./Banner";
export type { BannerProps, BannerTone } from "./Banner";
