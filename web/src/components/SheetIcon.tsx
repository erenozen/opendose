import type { SheetKind } from "../project/types";

// 14px glyphs per sheet kind, drawn with currentColor.
export default function SheetIcon({ kind }: { kind: SheetKind }) {
  const common = {
    width: 14, height: 14, viewBox: "0 0 14 14", fill: "none",
    stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": true,
    className: "sheet-icon",
  } as const;
  switch (kind) {
    case "data":
      return (
        <svg {...common}>
          <rect x="1.5" y="2" width="11" height="10" rx="1.5" />
          <path d="M1.5 5.3h11M5.2 2v10M8.8 2v10" />
        </svg>
      );
    case "results":
      return (
        <svg {...common}>
          <rect x="2" y="1.5" width="10" height="11" rx="1.5" />
          <path d="M4.3 4.5h5.4M4.3 7h5.4M4.3 9.5h3.2" strokeLinecap="round" />
        </svg>
      );
    case "graph":
      return (
        <svg {...common}>
          <path d="M2 1.8V12h10.2" strokeLinecap="round" />
          <path d="M3.6 10C6 10 6 4 10.8 3.4" strokeLinecap="round" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.4" />
          <path d="M7 6.3v3.6" strokeLinecap="round" />
          <circle cx="7" cy="4.3" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "layout":
      return (
        <svg {...common}>
          <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
          <path d="M7 1.5v11M1.5 7H7" />
        </svg>
      );
  }
}

export function SnowflakeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 1v10M1.7 3.5l8.6 5M1.7 8.5l8.6-5M4.6 1.8 6 3.1l1.4-1.3M4.6 10.2 6 8.9l1.4 1.3" />
    </svg>
  );
}

/** A user-defined group of sheets in the navigator. */
export function FolderIcon({ open = false }: { open?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true" className="sheet-icon">
      {open
        ? <path d="M1.5 11.5V3.2c0-.4.3-.7.7-.7h2.9l1.3 1.4h4.4c.4 0 .7.3.7.7v1.2M1.5 11.5l1.6-5h9.4l-1.6 5H1.5Z" />
        : <path d="M1.5 11.5V3.2c0-.4.3-.7.7-.7h2.9l1.3 1.4h5.4c.4 0 .7.3.7.7v6.2c0 .4-.3.7-.7.7H1.5Z" />}
    </svg>
  );
}

/** A floating note. */
export function NoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true" className="sheet-icon">
      <path d="M2 2.5h10v6.2L8.7 12H2V2.5Z" />
      <path d="M12 8.7H8.7V12" />
      <path d="M4.3 5.3h5.4M4.3 7.6h3" strokeLinecap="round" />
    </svg>
  );
}
