import { Component, type ErrorInfo, type ReactNode } from "react";
import { Ctx, type ProjectApi } from "../app/context";
import { saveBlob } from "../export/download";
import { serializeProject } from "../project/persist";
import { Button } from "./ui/Button";

/**
 * The app's last line: a render error or a code chunk that fails
 * to load shows what happened and two ways on, Reload and Download project
 * file, instead of a blank page. The autosave keeps the work either way.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  static contextType = Ctx;
  declare context: ProjectApi | null;
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OpenDose stopped on an error:", error, info.componentStack);
  }

  private download = () => {
    const p = this.context?.store.project;
    if (!p) return;
    const slug = p.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "opendose-project";
    saveBlob(new Blob([serializeProject(p)], { type: "application/json" }), `${slug}.json`);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="crash" role="alert" aria-labelledby="crash-title">
        <h1 id="crash-title">This view could not be shown</h1>
        <p>
          OpenDose stopped on an error: {error.message || String(error)}. Your
          project is kept in this browser&apos;s autosave and comes back when you
          reload. Download the project file first if you want a copy.
        </p>
        <div className="crash-actions">
          <Button variant="primary" onClick={() => location.reload()}>Reload</Button>
          {this.context && <Button onClick={this.download}>Download project file</Button>}
        </div>
      </main>
    );
  }
}

/**
 * One pane's boundary: a render error in a results panel, or a panel
 * chunk that fails to load, replaces that pane only, with what happened
 * and Try again; the header, navigator and grid stay. A new `resetKey`
 * (another result or sheet) clears the error.
 */
export class PaneBoundary extends Component<{ children: ReactNode; resetKey?: unknown },
  { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { key: unknown }) {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OpenDose could not show a panel:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="empty-hint result-card pane-error" role="alert">
        <p>Could not show this panel: {error.message || String(error)}.</p>
        <Button size="sm" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
