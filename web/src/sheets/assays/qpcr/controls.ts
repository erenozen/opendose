// Words for the qPCR control checks (engine assay_qpcr.control_checks).
// Pure, unit-tested.
import { num } from "../kit/format.ts";

export const CONTROLS_SOURCE = "MIQE (Bustin et al. 2009, Clin Chem 55:611) asks for no-template (NTC) and "
  + "no-reverse-transcription (no-RT) controls and their Cq values.";

/** The chip of one amplified control: "NTC amplified for GAPDH (Cq 34)". */
export function controlChip(f: { kind: string; control: string; target: string; cq: number }): string {
  const who = f.kind === "ntc"
    ? (/^ntc$/i.test(f.control.trim()) ? "NTC" : `NTC “${f.control}”`)
    : `No-RT control “${f.control}”`;
  return `${who} amplified for ${f.target} (Cq ${num(f.cq)})`;
}
