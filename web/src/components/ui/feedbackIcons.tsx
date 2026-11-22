// 16px tone icons shared by Toast and Banner. Decorative: the words
// carry the meaning, the icon only repeats the tone.
import type { ReactNode } from "react";

export type FeedbackTone = "neutral" | "info" | "warn" | "error" | "success" | "progress";

const common = {
  width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
  strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true, focusable: false,
};

export function ToneIcon({ tone }: { tone: FeedbackTone }): ReactNode {
  switch (tone) {
    case "success":
      return (
        <svg {...common}><circle cx="8" cy="8" r="6.25" /><path d="m5.4 8.2 1.8 1.8 3.4-3.6" /></svg>
      );
    case "error":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.25" /><path d="M8 4.8v3.6" />
          <circle cx="8" cy="10.9" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "warn":
      return (
        <svg {...common}>
          <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.4 9.5a1 1 0 0 1-.87 1.5H2.6a1 1 0 0 1-.87-1.5Z" />
          <path d="M8 6.2v3" /><circle cx="8" cy="11.2" r="0.75" fill="currentColor" stroke="none" />
        </svg>
      );
    case "progress":
      return (
        <svg {...common} className="tone-spinner">
          <circle cx="8" cy="8" r="6" opacity="0.25" /><path d="M14 8a6 6 0 0 0-6-6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.25" /><path d="M8 7.3v3.9" />
          <circle cx="8" cy="5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export function CloseIcon() {
  return (
    <svg {...common} width={14} height={14} viewBox="0 0 14 14">
      <path d="m3.5 3.5 7 7M10.5 3.5l-7 7" />
    </svg>
  );
}
