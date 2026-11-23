// The first screen of a password-protected share link ("#e=…"): asks for
// the password, decrypts the project in the browser (protect.ts) and hands
// it to the app (boot.ts setUnlockedShare). Shown by main.tsx before the
// app mounts, so the app opens the project exactly as a "#p=" link.
import { useState, type FormEvent } from "react";
import { Button, coarsePointer, Field, Input } from "../components/ui";
import { clearShareLink, locationHash, setUnlockedShare } from "./boot";
import { protectedPayload, unprotectJson } from "./protect";
import "./share.css";

export default function UnlockScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      setUnlockedShare(await unprotectJson(protectedPayload(locationHash()) ?? "", password));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  const skip = () => {
    clearShareLink();
    onDone();
  };

  return (
    <main className="unlock-screen">
      <form className="unlock-card" onSubmit={open} aria-labelledby="unlock-title">
        <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <h1 id="unlock-title">This shared project is password-protected</h1>
        <p>
          Enter the password the sender gave you. The project is unlocked here,
          in your browser: neither the password nor the data is sent anywhere.
        </p>
        {/* The page exists to take this password: focus it, but not on touch,
            where the keyboard would cover the explanation (forms.md). */}
        <Field label="Password">
          <Input type="password" autoFocus={!coarsePointer()} autoComplete="off" spellCheck={false}
            value={password} aria-invalid={error ? true : undefined}
            onChange={(e) => { setPassword(e.target.value); setError(""); }} />
        </Field>
        {error && <p className="unlock-error" role="alert">Could not open the shared project: {error}.</p>}
        <div className="unlock-actions">
          <Button onClick={skip}>Open OpenDose without it</Button>
          <Button type="submit" variant="primary" disabled={!password} busy={busy}
            busyLabel="Unlocking…">
            Open project
          </Button>
        </div>
      </form>
    </main>
  );
}
