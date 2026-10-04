// Why the automatic curve fit did not run (app/fitGuard.ts), with the way
// to run it anyway. The fit settings stay on the left, unchanged.
import { FIT_ANYWAY } from "../app/fitGuard";

export default function FitGuardNote({ reason, onFit, readOnly }: {
  reason: string;
  onFit: (patch: Record<string, unknown>) => void;
  readOnly: boolean;
}) {
  return (
    <div className="fit-guard-note result-card" role="note">
      <h4>Not fitted automatically</h4>
      <p>
        {reason} Choose the model that suits these data under the fit settings
        (it runs as soon as a setting changes), or fit the default
        dose-response model anyway.
      </p>
      {!readOnly && (
        <button type="button" onClick={() => onFit({ [FIT_ANYWAY]: true })}>Fit anyway</button>
      )}
    </div>
  );
}
