// "Learn more" links and explainer rendering. A link opens the Help panel
// at the explainer; inside a modal dialog (where the panel would sit
// behind the dialog) the explainer expands in place instead.
import { explainer, type Explainer } from "./explainers";
import { useGuideOptional } from "./context";

export function ExplainerBody({ e }: { e: Explainer }) {
  return (
    <>
      {e.body.map((p, i) => <p key={i}>{p}</p>)}
      <p className="explainer-sources">
        Sources: {e.sources.map((s, i) => (
          <span key={s.url}>{i > 0 && "; "}
            <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
        ))}
      </p>
    </>
  );
}

/** Expands in place (for use inside dialogs). */
export function ExplainerDetails({ id }: { id: string }) {
  const e = explainer(id);
  if (!e) return null;
  return (
    <details className="explainer-inline">
      <summary>Learn more: {e.title}</summary>
      <ExplainerBody e={e} />
    </details>
  );
}

/** A small "Learn more" button that opens the Help panel at `id`. */
export default function LearnMore({ id, label }: { id: string; label?: string }) {
  const guide = useGuideOptional();
  const e = explainer(id);
  if (!e) return null;
  if (!guide) return <ExplainerDetails id={id} />;
  return (
    <button type="button" className="learn-more" title={e.summary}
      onClick={() => guide.openHelp(e.id)}>
      {label ?? "Learn more"}<span className="sr-only">: {e.title}</span>
    </button>
  );
}
