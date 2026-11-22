# Feedback

Source: [ui/Toast.store.ts](../../web/src/components/ui/Toast.store.ts)
(`notify`), [ui/Banner.tsx](../../web/src/components/ui/Banner.tsx),
[ui/LabelSwap.tsx](../../web/src/components/ui/LabelSwap.tsx) (`SwapLabel`, `useLabelSwap`),
[ui/Announcer.store.ts](../../web/src/components/ui/Announcer.store.ts)
(`announce`), [EngineStatus.tsx](../../web/src/components/EngineStatus.tsx)
(`EngineSlot`). Direction: DECISIONS section 6. Events are toasts,
conditions are banners, and nothing that reports feedback moves the
layout or takes focus.

## Which one

```
Is it about the engine's boot (downloading, starting, ready, failed)?
 ├── Yes → EngineSlot (already mounted; never add another boot message)
 └── No
      ├── Did a Copy, Save or Download control just succeed?
      │    └── Yes → label swap (below): "Copied", "Saved", "Downloaded" on the
      │         control for 2000ms, width reserved at mount. No toast.
      ├── Did something just happen, or fail? (an event) → notify(message, { tone })
      ├── Is something true until it changes: read-only, a restore offer, a choice
      │    the app needs, a failed check? (a condition) → Banner at the top of its pane
      ├── Is it a problem with one field? → Field's error (forms.md)
      └── Is it a status line inside the dialog or panel in use ("Reading the file…")?
           → a <p className="field-note" role="status"> next to the control
```

A failure of Copy, Save or Download is still an error toast: the label
swap only reports success.

## notify (toasts)

Use for events. If the message stays true until the user acts, it is a
Banner; if it belongs to one field, it is a Field error. Tones:
`success`, `info`, `error`, `progress`. Nothing else exists. Always pass
`tone`: a call without one is guessed from the wording (`inferTone`),
which only exists for old call sites.

- `success`: what was asked for is done. `Opened “Assay 3.pzfx”.`
- `info`: something happened the user did not ask for, or a neutral
  fact. `Reopened your last session, “Assay 3”.`
- `error`: it failed. Stays until dismissed. Add `action` with the next
  step (`Choose another file`) whenever one exists.
- `progress`: a long operation. Show it with an `id`, then call `notify`
  again with the same `id` and tone `success` or `error`: it resolves in
  place instead of stacking a second toast.
- A deletion adds `action: { label: "Undo", onAction }`.

Success and info leave after max(4 s, reading time at 200 words a minute
+ 1 s), paused while hovered, focused or in a hidden tab. At most 3 show;
the oldest self-dismissing one makes room. F6 moves focus into the stack
and back. Never set a duration, never focus a toast, never raise a toast
for every keystroke or cell edit.

```tsx
// Correct: app/useFileOpen.ts:82
notify(`Opening “${file.name}”…`, { tone: "progress", id: TOAST_ID });
// … then, in place:
notify(`Opened “${file.name}”.`, { tone: "success", id: TOAST_ID });
notify(`Could not open “${file.name}”: ${e instanceof Error ? e.message : e}`, {
  tone: "error", id: TOAST_ID,
  action: { label: "Choose another file", onAction: () => pickRef.current() },
});
```

## Label swap

Use on Copy, Save, Download to say it worked. `SwapLabel` stacks both
labels in one cell (width reserved at mount); `useLabelSwap().flash(spoken)`
swaps for `SWAP_MS` (2000) and speaks `spoken` once. A failure is an
error toast.

```tsx
// Correct: sheets/common/ResultsExport.tsx
const copied = useLabelSwap();
<Button size="sm" variant="ghost" onClick={async () => {
  if (await copyText(text)) copied.flash("Results copied");
  else notify(`Could not copy the results of “${name}”: …`, { tone: "error" });
}}><SwapLabel swapped={copied.swapped} done="Copied">Copy results</SwapLabel></Button>

// Incorrect: a hint span beside the button, and a failure with no reason
flash(await copyText(toDelimited(m, "tsv")) ? "Copied." : "Copy failed.");
```

## Banner

Use for a condition, placed at the top of the pane it concerns (the app
shell's `.banner-region` for project-wide ones). If it is over once seen,
it is a toast. One tinted callout per pane at most: a second competes
with the result it sits above.

Tones: `neutral` (default), `info`, `warn`, `error`, `success`. Nothing
else exists. The icon carries the hue; `warn` and `error` add a 2px
inset rule; `error` tints the tile with `--danger-soft`.

Parts: `Banner.Title` (one sentence, 13px semibold), `Banner.Detail`
(12px muted), `Banner.Actions` (keycap Buttons, at most one `primary`;
they wrap under the text below 620px of banner width). Props: `open`
(set false to play the 150ms exit; keep it mounted, do not unmount it
yourself), `onDismiss` + `dismissLabel` (adds the 24px dismiss button with
a 44px hit area), `announce` (speak the title once on appear: use it for
banners the user did not cause), `icon` (null for none).

```tsx
// Correct: App.tsx:126
<Banner tone="info" className="restore-banner" open={!!autosave.offer && !guide.startPending}>
  <Banner.Title>Restore your last session?</Banner.Title>
  <Banner.Detail>“{autosave.offer.title}”, {autosave.offer.sheets} sheets, saved ….</Banner.Detail>
  <Banner.Actions><Button variant="primary" onClick={…}>Restore</Button></Banner.Actions>
</Banner>

// Incorrect: a bespoke strip (its own border, an accent rule, no exit)
<div className={`guide-banner banner-${b.tone}`} role="note">…</div>
```

## EngineSlot

The engine's boot state, in a fixed 340 x 34 slot that is always mounted,
so the boot and its end move nothing. It already renders on the start
screen and the welcome panel. Never show boot progress anywhere else, and
never unmount the slot when the engine is ready.

## announce and live regions

`<Announcer>` mounts one polite and one assertive region at the root
(inside `ToastProvider`). Toasts and banners speak through it; you only
call `announce(message, "polite" | "assertive")` for a change with no
visible message (a keyboard action whose result is only visual).
Assertive is for errors only.

- Speak phases, never counters; never `aria-live` on a whole section,
  only `role="status"` on the one line that changes, mounted before it does.

```tsx
// Correct: components/EngineStatus.tsx:176. Words spoken, seconds hidden.
<span role="status">{text}</span>
<span className="analysis-busy-time" aria-hidden="true">{elapsed.toFixed(1)} s</span>

// Incorrect: a live region on a counter reads every simulated run aloud.
<span className="mc-count" aria-live="polite">{progress.done} of {progress.total}</span>
```

## Copy

[content.md](content.md): name the object (`“Assay 3”`), past tense for
done (`Opened`), `…` for work in progress, errors as `Could not <verb>
<object>: <reason>.` plus the next step.
