// The autosave's conditions at the top of the app (DECISIONS 6, one Banner
// each): sessions of closed tabs to restore, and the session this tab had
// being open in another tab (a duplicated tab). Logic: app/useAutosave.ts.
import type { AutosaveApi } from "../app/useAutosave";
import { useUi } from "../app/ui";
import type { SessionRecord } from "../project/autosave";
import { Banner, Button } from "./ui";

const savedAt = (r: SessionRecord) => new Date(r.savedAt).toLocaleString();
const sheetCount = (r: SessionRecord) => `${r.sheets} sheet${r.sheets === 1 ? "" : "s"}`;
/** One kept session in words; two tabs on one project differ by the sheet
 *  each had on screen. */
const describe = (r: SessionRecord) => `“${r.title}”, ${sheetCount(r)}`
  + `${r.sheet ? `, last on “${r.sheet}”` : ""}, saved ${savedAt(r)}`;

export default function SessionBanners({ autosave, pending }: {
  autosave: AutosaveApi;
  /** The app is still deciding where to open: show nothing yet. */
  pending: boolean;
}) {
  const ui = useUi();
  const { offers, heldElsewhere } = autosave;
  const single = offers.length === 1 ? offers[0] : null;

  // Discard deletes the saved session for good: say so, and ask.
  const discard = async (r: SessionRecord) => {
    const ok = await ui.confirm(single ? {
      title: "Discard your last session?",
      body: "The autosaved project is deleted from this browser and cannot be restored.",
      confirmLabel: "Discard",
      danger: true,
    } : {
      title: `Discard “${r.title}”?`,
      body: `The session saved ${savedAt(r)} is deleted from this browser and cannot be restored.`,
      confirmLabel: "Discard",
      danger: true,
    });
    if (ok) await autosave.discard(r.id);
  };

  return (
    <>
      <Banner tone="info" className="restore-banner" open={offers.length > 0 && !pending}
        onDismiss={autosave.hide} dismissLabel="Hide for now (the sessions stay in this browser)">
        {single ? (
          <>
            <Banner.Title>Restore your last session?</Banner.Title>
            <Banner.Detail>
              {describe(single)}.
            </Banner.Detail>
            <Banner.Actions>
              <Button variant="primary" onClick={() => { void autosave.restore(single.id); }}>Restore</Button>
              <Button onClick={() => { void discard(single); }}>Discard last session</Button>
            </Banner.Actions>
          </>
        ) : offers.length > 1 && (
          <>
            <Banner.Title>Restore one of your last {offers.length} sessions?</Banner.Title>
            <Banner.Detail>
              <ul className="session-list" aria-label="Saved sessions">
                {offers.map((r) => {
                  const which = ` ${describe(r)}`;
                  return (
                    <li key={r.id} className="session-row">
                      <span>{describe(r)}.</span>
                      <span className="session-row-actions">
                        <Button size="sm" onClick={() => { void autosave.restore(r.id); }}>
                          Restore<span className="sr-only">{which}</span>
                        </Button>
                        <Button size="sm" onClick={() => { void discard(r); }}>
                          Discard<span className="sr-only">{which}</span>
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Banner.Detail>
          </>
        )}
      </Banner>
      <Banner tone="info" className="restore-banner" open={!!heldElsewhere && !pending} announce
        onDismiss={autosave.dismissHeld}>
        {heldElsewhere && (
          <>
            <Banner.Title>“{heldElsewhere.title}” is open in another tab.</Banner.Title>
            <Banner.Detail>
              This tab keeps a session of its own, so neither tab writes over the other.
            </Banner.Detail>
            <Banner.Actions>
              <Button onClick={autosave.copyHeld}>Open a copy here</Button>
            </Banner.Actions>
          </>
        )}
      </Banner>
    </>
  );
}
