// Shown for table types whose editor is final but whose analyses and
// graphs are still being built.
export default function PlaceholderPanel({ label, hint }: {
  label: string;
  hint?: string;
}) {
  return (
    <div className="controls placeholder-panel" role="note">
      <section>
        <h3>Analyses &amp; graphs</h3>
        <p className="placeholder-lead">
          <span className="soon-badge">Coming next release</span>
        </p>
        <p className="hint-block">
          Analyses and graphs for {label} tables land in the next release.
          The table you enter now is saved with the project and will be
          analyzed as-is once they arrive.
        </p>
      </section>
      {hint && (
        <section>
          <h3>How to enter data</h3>
          <p className="hint-block">{hint}</p>
        </section>
      )}
    </div>
  );
}
