// Banner: one primitive for conditions (DECISIONS 6), placed at the top
// of the pane it concerns: restore the last session, pick Prism tables,
// a shared read-only project, the engine boot, a reproduce check, a
// results chip. Compound parts, so each banner says what it needs:
//
//   <Banner tone="info" open={!!offer} onDismiss={dismiss}>
//     <Banner.Title>Restore your last session?</Banner.Title>
//     <Banner.Detail>“Assay 3”, 4 sheets, saved 21 Nov.</Banner.Detail>
//     <Banner.Actions>
//       <Button variant="primary" onClick={restore}>Restore</Button>
//     </Banner.Actions>
//   </Banner>
//
// The root is a region named by its title (or by aria-label). A banner
// never takes focus; `announce` speaks its title once when it appears.
// Closing (open=false) plays a 150 ms exit before unmounting (at once when
// dismissed from the keyboard); the content below then closes the gap at
// once (no height animation).
import {
  createContext, useContext, useEffect, useId, useRef,
  type HTMLAttributes, type ReactNode, type Ref,
} from "react";
import { announce } from "./Announcer.store";
import { CloseIcon, ToneIcon } from "./feedbackIcons";
import { IconButton } from "./IconButton";
import { useMergedRefs, usePresence } from "./useDismiss";
import "./Banner.css";

export type BannerTone = "neutral" | "info" | "warn" | "error" | "success";

const Ctx = createContext<{ titleId: string } | null>(null);

export interface BannerProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  tone?: BannerTone;
  /** Shown or not. Leaving plays the exit, then unmounts. Default true. */
  open?: boolean;
  /** Replaces the tone's icon; null for none. */
  icon?: ReactNode | null;
  /** Adds a dismiss button ("Dismiss" unless dismissLabel says more). */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Speak the title once when the banner appears. */
  announce?: boolean;
  ref?: Ref<HTMLElement>;
}

export function Banner({
  tone = "neutral", open = true, icon, onDismiss, dismissLabel = "Dismiss",
  announce: speak = false, className, children, ref, ...props
}: BannerProps) {
  const titleId = useId();
  // The shared presence hook (useDismiss): the exit lasts as long as the
  // transitions it starts, and a keyboard dismiss removes it at once.
  const root = useRef<HTMLElement | null>(null);
  const setRef = useMergedRefs(root, ref);
  const { mounted, state } = usePresence(open, root);
  const closing = state === "closed";
  // While leaving, show what was there (callers often clear the content
  // together with `open`).
  const last = useRef(children);
  if (open) last.current = children;
  const spoken = useRef(false);
  useEffect(() => {
    if (!mounted) { spoken.current = false; return; }
    if (!speak || spoken.current) return;
    spoken.current = true;
    const title = root.current?.querySelector(".banner-title")?.textContent ?? "";
    announce(title, tone === "error" ? "assertive" : "polite");
  }, [mounted, speak, tone]);
  if (!mounted) return null;
  const labelled = props["aria-label"] || props["aria-labelledby"];
  return (
    <section
      ref={setRef}
      className={`banner${className ? ` ${className}` : ""}`}
      data-tone={tone} data-closing={closing ? "" : undefined}
      aria-labelledby={labelled ? undefined : titleId} {...props}
      // Leaving: out of the accessibility tree and inert while it fades.
      aria-hidden={closing || undefined} inert={closing || undefined}>
      <div className="banner-grid">
        {icon !== null && <span className="banner-icon">{icon ?? <ToneIcon tone={tone} />}</span>}
        <Ctx.Provider value={{ titleId }}>
          <div className="banner-body">{open ? children : last.current}</div>
        </Ctx.Provider>
        {onDismiss && (
          <IconButton size="sm" className="banner-dismiss" aria-label={dismissLabel}
            onClick={onDismiss}>
            <CloseIcon />
          </IconButton>
        )}
      </div>
    </section>
  );
}

function BannerTitle({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const ctx = useContext(Ctx);
  return (
    <p id={ctx?.titleId} className={`banner-title${className ? ` ${className}` : ""}`} {...props}>
      {children}
    </p>
  );
}

function BannerDetail({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`banner-detail${className ? ` ${className}` : ""}`} {...props}>{children}</div>;
}

/** Keycaps, at most one filled primary. Wraps under the text below
 *  620px of banner width. */
function BannerActions({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`banner-actions${className ? ` ${className}` : ""}`} {...props}>{children}</div>;
}

Banner.Title = BannerTitle;
Banner.Detail = BannerDetail;
Banner.Actions = BannerActions;
