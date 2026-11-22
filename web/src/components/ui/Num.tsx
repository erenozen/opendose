// Num: a number in prose that never breaks across lines: not at the
// e-notation hyphen ("1.04e-7"), not between a comparator and its value
// ("< 0.0001"), not inside a range ("0.8 to 1.2"). content.md, "Numbers".
//
//   <Num>{formatSig(v)}</Num>              one value you already hold
//   <NumText text={meaning.sentence} />    a sentence: wraps every number in it
//
// Both only add a span: the text, and so copy, export and e2e reads, are
// unchanged.
import type { ReactNode } from "react";
import { numberRuns } from "./Num.runs";
import "./Num.css";

export function Num({ children }: { children: ReactNode }) {
  return <span className="num">{children}</span>;
}

/** A sentence with every number in it kept on one line. */
export function NumText({ text }: { text: string }) {
  return (
    <>
      {numberRuns(text).map((r, i) => (r.num
        ? <span key={i} className="num">{r.text}</span> : r.text))}
    </>
  );
}
