// Methods text for the column analyses: one manuscript-ready paragraph
// built from the options and the result (methodsSentence.ts), ending with
// the software sentence.
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import type { ColumnOptionsState } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import type { ResultsProps } from "../types";
import { columnMethodsSentence } from "./methodsSentence";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export function ColumnMethods({ options, result }:
  ResultsProps<ColumnOptionsState, Record<string, unknown>>) {
  if (!result || (result as R).error) return null;
  let sentence = "";
  try { sentence = columnMethodsSentence(options, result as R); } catch { sentence = ""; }
  if (!sentence) return null;
  return <CopyableMethods text={`${sentence} ${softwareSentence(getRuntimeVersions())}`} />;
}
