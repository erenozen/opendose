// "Your data and privacy": what OpenDose sends and keeps, how that is
// enforced, and how to check it. Opens from the info popover and at
// "#privacy" (ShareHost), like the validation page. Keep it in step with
// web/public/_headers, web/scripts/e2e-privacy.mjs, src/project/forget.ts
// and docs/self-hosting.md.
import Modal from "../components/Modal";
import { Button } from "../components/ui";

const REPO = "https://github.com/erenozen/opendose";
const file = (path: string) => `${REPO}/blob/main/${path}`;

function Source({ path, children }: { path: string; children: string }) {
  return <a href={file(path)} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export default function PrivacyPage({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Your data and privacy" className="privacy-page" onClose={onClose}
      actions={<Button onClick={onClose}>Close</Button>}>
      <section aria-labelledby="pp-short">
        <h3 id="pp-short">In short</h3>
        <p>
          Every analysis runs in your browser. This site sends you the app, and
          nothing comes back: your data, results and files are never uploaded,
          to us or to anyone else.
        </p>
      </section>

      <section aria-labelledby="pp-sent">
        <h3 id="pp-sent">What is sent and received</h3>
        <ul>
          <li>
            Your browser downloads the app and its Python engine (Pyodide with
            NumPy and SciPy, about 31 MB the first time, then kept offline) from
            this site, and from nowhere else.
          </li>
          <li>No account, no cookies, no analytics, no tracking, no error reports.</li>
          <li>
            The site is hosted by Cloudflare. Like any web server it sees your IP
            address, your browser and which of the app&apos;s files were
            downloaded. It never sees your data, because your data is never sent.
          </li>
        </ul>
      </section>

      <section aria-labelledby="pp-enforced">
        <h3 id="pp-enforced">Enforced, not just promised</h3>
        <ul>
          <li>
            The site tells your browser that the page may contact this site and
            nothing else (a <Source path="web/public/_headers">Content Security Policy</Source>).
            The browser enforces it, so even a bug could not send your data elsewhere.
          </li>
          <li>
            Every change to OpenDose runs an{" "}
            <Source path="web/scripts/e2e-privacy.mjs">automatic test</Source> that uses
            the app with marked data and fails if anything leaves the page or any
            other server is contacted.
          </li>
          <li>
            The whole app is <a href={REPO} target="_blank" rel="noopener noreferrer">open
            source</a>, so anyone can read exactly what it does.
          </li>
        </ul>
      </section>

      <section aria-labelledby="pp-kept">
        <h3 id="pp-kept">What stays on this computer</h3>
        <ul>
          <li>
            Autosave keeps your work in this browser, so a closed tab loses nothing.
            Saved templates, import recipes, plate layouts, your equations and
            settings are kept here too.
          </li>
          <li>
            On a shared computer, use <strong>Preferences, Privacy on this
            computer</strong>: switch autosave off, or <strong>Forget this
            computer&apos;s data</strong> to erase all of it.
          </li>
          <li>
            The offline copy of the app holds only the app&apos;s own files, never data.
          </li>
        </ul>
      </section>

      <section aria-labelledby="pp-sharing">
        <h3 id="pp-sharing">Sharing</h3>
        <p>
          A share link carries the project inside the link itself. Anyone who gets
          the link, and every app it passes through (e-mail, chat, link previews,
          browser history), could read it, so links are protected with a password
          by default. Send the password separately. You can also share the project
          file through a channel your institution approves.
        </p>
      </section>

      <section aria-labelledby="pp-check">
        <h3 id="pp-check">Check it yourself</h3>
        <ul>
          <li>
            Open your browser&apos;s developer tools (F12), choose the Network tab and
            work as usual: every request goes to this site, and after the first
            load almost nothing is requested at all.
          </li>
          <li>
            Or open OpenDose once, turn off Wi-Fi, and keep working: it does not
            need the internet.
          </li>
        </ul>
      </section>

      <section aria-labelledby="pp-own">
        <h3 id="pp-own">Run your own copy</h3>
        <p>
          If your institution needs tools to run on its own servers, or on a
          computer with no internet, OpenDose can be built once and served from
          anywhere: see the <Source path="docs/self-hosting.md">self-hosting guide</Source>.
        </p>
      </section>
    </Modal>
  );
}
