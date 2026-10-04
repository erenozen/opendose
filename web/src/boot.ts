// First script on the page: starts the analysis engine (a worker that
// downloads and boots Python) before the app's own code has even loaded,
// so the two happen in parallel. See lib/engine.ts.
import { startEngine } from "./lib/engine";

void startEngine().catch(() => { /* shown by the app, which can retry */ });
