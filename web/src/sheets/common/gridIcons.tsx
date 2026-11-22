// 14px stroke icons for the table tools (add, remove, move), drawn like
// CloseIcon in components/ui/feedbackIcons.tsx: currentColor, 1.5 stroke.
const common = {
  width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", stroke: "currentColor",
  strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function PlusIcon() {
  return <svg {...common}><path d="M7 3v8M3 7h8" /></svg>;
}
export function MinusIcon() {
  return <svg {...common}><path d="M3 7h8" /></svg>;
}
export function ArrowUpIcon() {
  return <svg {...common}><path d="M7 11V3M3.5 6.5 7 3l3.5 3.5" /></svg>;
}
export function ArrowDownIcon() {
  return <svg {...common}><path d="M7 3v8M3.5 7.5 7 11l3.5-3.5" /></svg>;
}
