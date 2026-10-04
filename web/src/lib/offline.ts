// The offline cache (service worker, sw/sw.js, emitted by vite.config.ts
// into production builds only). Registered once the engine is up, so it
// copies the files the first visit already downloaded (from the browser
// cache) instead of competing with the first start for bandwidth.
import { BASE_URL } from "./buildInfo";
import { startEngine } from "./engine";

export function registerOfflineCache() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register(`${BASE_URL}sw.js`, { scope: BASE_URL })
      .catch(() => { /* no offline cache: the app works as before */ });
  };
  startEngine().then(
    () => setTimeout(register, 1500),
    () => setTimeout(register, 1500),
  );
}
