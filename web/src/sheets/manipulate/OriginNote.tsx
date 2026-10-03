// The note above a data table that says where its values come from: the
// chain it belongs to (derived tables) or the simulation that made it.
import { useState } from "react";
import { useProject } from "../../app/context";
import { getEngine } from "../../lib/engine";
import { chainOf, unlinkDerived } from "../../project/derived";
import { updateSheet } from "../../project/ops";
import type { DataSheet, Sheet } from "../../project/types";
import { analysisDef } from "../registry";
import { DiceIcon, LinkIcon } from "./LinkIcon";
import { openSimulate, withSimulation } from "./simulateApi";
import { randomSeed, simulateTable, simulationSentence, type SimForm } from "./simulate";
import "./manipulate.css";

export default function OriginNote({ data }: { data: DataSheet }) {
  if (data.derived) return <DerivedNote data={data} />;
  if (data.simulation) return <SimulatedNote data={data} />;
  return null;
}

function DerivedNote({ data }: { data: DataSheet }) {
  const { project, select, apply } = useProject();
  const chain = chainOf(project, data.id);
  const me = chain[chain.length - 1];
  const source = chain[chain.length - 2]?.data;
  const producer = me?.producer;
  const pDef = producer && source ? analysisDef(source.table.type, producer.analysis) : undefined;
  return (
    <div className="origin-note" role="note">
      <LinkIcon size={14} />
      <div className="origin-text">
        <p>
          Computed from <strong>{source?.name ?? "another table"}</strong>
          {pDef ? <> by <strong>{pDef.short}</strong></> : null}. It updates on its own;
          edit the source table or the {pDef?.short ?? "analysis"} settings to change it.
        </p>
        {chain.length > 2 && (
          <nav className="chain-crumbs" aria-label="Chain of analyses">
            {chain.map((c, i) => (
              <span key={c.data.id}>
                {i > 0 && <span className="crumb-sep" aria-hidden="true"> → </span>}
                {c.data.id === data.id ? <span aria-current="page">{c.data.name}</span>
                  : <button type="button" className="crumb" onClick={() => select(c.data.id)}>{c.data.name}</button>}
              </span>
            ))}
          </nav>
        )}
      </div>
      <div className="origin-actions">
        {source && <button type="button" onClick={() => select(source.id)}>Source table</button>}
        {producer && <button type="button" onClick={() => select(producer.id)}>Settings</button>}
        <button type="button" title="Keep the current values as an ordinary, editable table"
          onClick={() => apply((p) => unlinkDerived(p, data.id))}>Unlink</button>
      </div>
    </div>
  );
}

function SimulatedNote({ data }: { data: DataSheet }) {
  const { apply, engineReady } = useProject();
  const spec = data.simulation!;
  const [error, setError] = useState<string | null>(null);
  const [showMethods, setShowMethods] = useState(false);
  const again = async () => {
    setError(null);
    try {
      const engine = await getEngine();
      const seed = randomSeed();
      const table = simulateTable(engine, spec.kind, spec.form as SimForm, seed);
      apply((p) => withSimulation(updateSheet<Sheet>(p, data.id,
        (s) => (s.kind === "data" && !s.frozen ? { ...s, table } : s)), data.id, spec.kind,
      spec.form as SimForm, seed, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const sentence = simulationSentence(spec);
  return (
    <div className="origin-note" role="note">
      <DiceIcon size={14} />
      <div className="origin-text">
        <p>Simulated data (seed {spec.seed}). You can edit it like any table.</p>
        {showMethods && <p className="origin-methods">{sentence}</p>}
        {error && <p className="results-error" role="alert">{error}</p>}
      </div>
      <div className="origin-actions">
        <button type="button" className="btn-primary" disabled={!engineReady || !!data.frozen}
          onClick={again}>Simulate again</button>
        <button type="button" disabled={!!data.frozen}
          onClick={() => openSimulate({ editId: data.id })}>Settings…</button>
        <button type="button" aria-expanded={showMethods}
          onClick={() => setShowMethods((v) => !v)}>Methods</button>
      </div>
    </div>
  );
}
