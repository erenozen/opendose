import { CopyButton } from "../../components/CiteBlock";

/** A "Methods text" card: a manuscript-ready paragraph with a Copy button,
 *  styled like the curve-fit methods text. */
export default function CopyableMethods({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="result-card methods-text">
      <h3>Methods text</h3>
      <p>{text}</p>
      <CopyButton text={text} what="the methods text" />
    </div>
  );
}
