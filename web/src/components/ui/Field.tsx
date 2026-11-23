// Field: a label, one control, an optional description and an error,
// wired together: the label's htmlFor and the control's id come from one
// generated id; the description and the error reach screen readers via
// aria-describedby; aria-invalid is set while the error shows.
//
//   <Field label="Name" error={nameProblem}>
//     <Input value={name} onChange={(e) => setName(e.target.value)} />
//   </Field>
//
// Errors follow reward early, punish late (Field.validation.ts): pass the
// live problem as `error`; it shows after the control is left or after a
// submit attempt (bump `submitCount`), and clears as soon as it is fixed.
import {
  createContext, useContext, useId,
  type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes,
} from "react";
import { useValidationTiming } from "./Field.timing";
import "./Field.css";

interface FieldCtx {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  onBlur: () => void;
}
const Ctx = createContext<FieldCtx | null>(null);

export interface FieldProps {
  label: ReactNode;
  description?: ReactNode;
  /** The value's current problem, if any (shown late, cleared early). */
  error?: string | null;
  /** Bump on each submit attempt to show a pending problem at once. */
  submitCount?: number;
  /** Fixed id for the control (otherwise generated). */
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, description, error, submitCount, id, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `${auto}-control`;
  const descId = `${auto}-desc`;
  const errId = `${auto}-error`;
  const { problem, onBlur } = useValidationTiming(error, submitCount);
  const describedBy = [description ? descId : "", problem ? errId : ""].filter(Boolean).join(" ")
    || undefined;
  return (
    <div className={`field ui-field${className ? ` ${className}` : ""}`}
      data-invalid={problem ? "" : undefined}>
      <label className="ui-field-label" htmlFor={controlId}>{label}</label>
      <Ctx.Provider value={{ id: controlId, describedBy, invalid: !!problem, onBlur }}>
        {children}
      </Ctx.Provider>
      {description && <p id={descId} className="field-note ui-field-description">{description}</p>}
      <p id={errId} className="ui-field-error" hidden={!problem}>{problem}</p>
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
}

/** A text input. Inside a Field it takes the Field's id, description,
 *  error and blur timing; outside one it is a plain input. */
export function Input({ ref, onBlur, ...props }: InputProps) {
  const ctx = useContext(Ctx);
  const describedBy = [props["aria-describedby"], ctx?.describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <input ref={ref} id={ctx?.id} {...props}
      aria-describedby={describedBy}
      aria-invalid={ctx?.invalid || props["aria-invalid"] || undefined}
      onBlur={(e) => { ctx?.onBlur(); onBlur?.(e); }} />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

/** A multi-line text box, wired into its Field like Input. */
export function Textarea({ ref, onBlur, className, ...props }: TextareaProps) {
  const ctx = useContext(Ctx);
  const describedBy = [props["aria-describedby"], ctx?.describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <textarea ref={ref} id={ctx?.id} className={`field-textarea${className ? ` ${className}` : ""}`} {...props}
      aria-describedby={describedBy}
      aria-invalid={ctx?.invalid || props["aria-invalid"] || undefined}
      onBlur={(e) => { ctx?.onBlur(); onBlur?.(e); }} />
  );
}
