// Results / methods panel factories for the manipulations (kept apart
// from the components so fast refresh keeps working).
import type { ComponentType } from "react";
import type { DataTableModel } from "../../project/types";
import type { ResultsProps } from "../types";
import { ManipResultsView, MethodsCard } from "./panels";
import type { ManipResult } from "./run";

export function makeManipResults(outputName: (table: string) => string,
  Extra?: ComponentType<{ result: ManipResult }>) {
  return function ManipResults(props: ResultsProps<unknown, ManipResult>) {
    return (
      <ManipResultsView {...props} outputName={outputName}
        extra={Extra ? (r) => <Extra result={r} /> : undefined} />
    );
  };
}

export function makeMethods<O>(sentence: (o: O, t: DataTableModel) => string) {
  return function ManipMethods({ options, table, result }: ResultsProps<O, ManipResult>) {
    if (!result || result.error) return null;
    return <MethodsCard text={sentence(options, table)} />;
  };
}
