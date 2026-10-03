// Public API of the graph-format layer. See ./README.md.
export * from "./format";
export {
  applyFormat, axisMaps, fontStack, lettersFor, plottedOrder, rgba, tagTrace, traceTag,
  type FormatContext, type Formatted, type Layout, type Trace, type TraceRole,
  type TraceTag,
} from "./apply";
export { plotConfig, relayoutToFormat } from "./edits";
export {
  extractComparisons, resultBlocks, riskSetsFromResult, riskSetsFromTable,
  type ComparisonSet, type RiskSet,
} from "./results";
export {
  compactLetters, formatP, lettersInputKey, lettersPayload, pairKey, parseEngineLetters,
  pStars, stackBrackets, type Comparison,
} from "./significance";
export { usePlotEdits } from "./usePlotEdits";
