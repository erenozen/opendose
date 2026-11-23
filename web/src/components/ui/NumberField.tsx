// NumberField: a Field for one number. Typed as text (the value keeps
// what was typed: "1e-7", a trailing zero, a blank); the phone shows the
// decimal pad only when `min` is 0 or more, since the iOS pad has no minus
// and no "e" (DECISIONS 7), else the text keyboard. A unit suffix drawn
// inside the field, min / max / whole-number checks shown late, and
// Arrow Up / Down stepping by `step`.
//
// Controlled (value + onValueChange) or uncontrolled (defaultValue).
import {
  useContext, useId, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode,
  type Ref,
} from "react";
import { Field, Input } from "./Field";
import { numberProblem, parseNumber } from "./Field.validation";
import { NumberRefs } from "./NumberField.refs";

export interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "min" | "max" | "step"> {
  label: ReactNode;
  description?: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Shown inside the field, after the number ("µM", "%"). */
  unit?: string;
  min?: number;
  max?: number;
  /** Arrow Up / Down add or take away this much. */
  step?: number;
  /** Only whole numbers are valid. */
  integer?: boolean;
  /** An outside problem with the value, shown with the same timing. */
  error?: string | null;
  submitCount?: number;
  /** Class of the Field wrapper (the input takes `className`). */
  fieldClassName?: string;
  ref?: Ref<HTMLInputElement>;
}

function decimals(n: number): number {
  const s = String(n);
  return s.includes(".") ? s.length - s.indexOf(".") - 1 : 0;
}

export function NumberField({
  label, description, value: controlled, defaultValue = "", onValueChange, unit,
  min, max, step, integer, required, error, submitCount, fieldClassName, onKeyDown, ...props
}: NumberFieldProps) {
  const unitId = useId();
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const set = (v: string) => {
    if (controlled === undefined) setInner(v);
    onValueChange?.(v);
  };
  const resolveRef = useContext(NumberRefs);
  const resolved = resolveRef && value.trim().startsWith("@") ? resolveRef(value) : value;
  const problem = error ?? (resolved === null ? "Enter a number, or @ and the name of an info constant"
    : numberProblem(resolved, { min, max, required, integer }));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || !step || props.readOnly || props.disabled) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const n = parseNumber(value);
    if (n === null) return;
    e.preventDefault();
    let next = n + (e.key === "ArrowUp" ? step : -step);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    set(next.toFixed(Math.max(decimals(step), decimals(n))).replace(/^-0(\.0*)?$/, "0$1"));
  };

  return (
    <Field label={label} description={description} error={problem} submitCount={submitCount}
      className={`ui-number-field${fieldClassName ? ` ${fieldClassName}` : ""}`}>
      <span className="ui-number" data-unit={unit ? "" : undefined}
        style={unit ? { "--unit-ch": `${unit.length + 1}ch` } as CSSProperties : undefined}>
        <Input inputMode={min !== undefined && min >= 0 ? "decimal" : "text"} autoComplete="off"
          spellCheck={false} {...props}
          aria-describedby={[unit ? unitId : "", props["aria-describedby"] ?? ""].filter(Boolean).join(" ")
            || undefined}
          required={required} value={value} onKeyDown={onKey}
          onChange={(e) => set(e.target.value)} />
        {unit && <span id={unitId} className="ui-number-unit">{unit}</span>}
      </span>
    </Field>
  );
}
