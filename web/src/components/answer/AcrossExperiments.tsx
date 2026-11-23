// "Across experiments" in the results headline (P-08): the summary of one
// fit per experiment, above the fit of all the values together, because
// with a replicate map the experiment is the unit and this is the number
// to report (the pooled fit's CI counts wells).
import { useId } from "react";
import { Num, NumText } from "../ui";
import { potencySummaries } from "../../sheets/xy/experiments";
import { potencyItem } from "./potencyFacts";

export default function AcrossExperiments({ result, xUnit }: { result: unknown; xUnit: string }) {
  const id = useId();
  const items = potencySummaries(result).map((s) => potencyItem(s, xUnit));
  if (!items.length) return null;
  return (
    <section className="answer-group" aria-labelledby={id}>
      <h3 id={id} className="answer-group-label">Across experiments</h3>
      <dl className="answer-items" data-count={Math.min(items.length, 3)}>
        {items.map((it) => {
          const f = it.figure;
          return (
            <div key={it.title} className={`answer-item${f.demoted ? " is-demoted" : ""}`}>
              <dt className="answer-name">
                <span className="answer-set">{it.title}</span>
                <span className="answer-param">{f.name}</span>
              </dt>
              {f.demoted && <dd className="answer-reason"><NumText text={f.demoted} /></dd>}
              <dd className="answer-figure"><Num>{f.value}</Num></dd>
              {f.ci && <dd className="answer-ci"><NumText text={f.ci} /></dd>}
              {f.facts.map((x) => <dd key={x} className="answer-facts"><NumText text={x} /></dd>)}
              {it.perExperiment && (
                <dd className="answer-facts"><NumText text={it.perExperiment} /></dd>
              )}
              {[...it.excluded, ...it.notes].map((x) => (
                <dd key={x} className="answer-reason"><NumText text={x} /></dd>
              ))}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
