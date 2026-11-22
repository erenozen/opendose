// Label swap: a Copy, Save or Download control says it worked by swapping
// its own label for SWAP_MS ("Copied"), instead of raising a toast
// (DECISIONS 6, feedback.md). Both labels share one grid cell from the
// first render, so the button keeps the width of the wider one and
// nothing beside it moves. The swap is also spoken once (polite), since a
// changed label on a focused button is not reliably announced.
//
//   const copied = useLabelSwap();        (useLabelSwap.ts)
//   <Button onClick={async () => {
//     if (await copyText(text)) copied.flash("Copied");
//     else notify("Could not copy …", { tone: "error" });
//   }}>
//     <SwapLabel swapped={copied.swapped} done="Copied">Copy results</SwapLabel>
//   </Button>
//
// A failure is still an error toast: the swap only reports success.
import type { ReactNode } from "react";

/** The two labels of a swapping control, stacked in one cell (Button.css). */
export function SwapLabel({ swapped, done, children }: {
  swapped: boolean;
  /** What the control says after it worked: "Copied", "Saved". */
  done: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="btn-swap">
      <span className="btn-swap-label" data-shown={!swapped}>{children}</span>
      <span className="btn-swap-label" data-shown={swapped}>{done}</span>
    </span>
  );
}
