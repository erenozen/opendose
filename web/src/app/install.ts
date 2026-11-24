// Installing OpenDose as an app (P-71). Chromium browsers fire
// `beforeinstallprompt` once the page meets their install rules (the web
// app manifest, public/manifest.webmanifest, and the offline cache); the
// event is kept so About can offer "Install as app" at the user's request.
// Other browsers never fire it: About says how they open files instead.
import { useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "available" | "installed" | "unavailable";

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // The browser's own install prompt stays in its address bar; this
    // only keeps the event for About's button.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const standalone = () => typeof window !== "undefined" && typeof window.matchMedia === "function"
  && window.matchMedia("(display-mode: standalone)").matches;

function installState(): InstallState {
  if (installed || standalone()) return "installed";
  return deferred ? "available" : "unavailable";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, installState, () => "unavailable");
}

/** Show the browser's install dialog. True when the user installed. */
export async function installApp(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  const choice = await e.userChoice;
  return choice.outcome === "accepted";
}
