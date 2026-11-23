// One table file dropped on the page or chosen with Open (app/tableFile.ts):
// the Import dialog on that file, making a new table. While the first-run
// example is open the table takes its place, as a paste does (DECISIONS
// 4); otherwise it joins the project as a new family. Mounted once in App.
import { useEffect, useState } from "react";
import { useProject } from "../../app/context";
import { handOverReport, onTableFile } from "../../app/tableFile";
import { notify } from "../../components/ui";
import { projectWithTable } from "../../guide/actions";
import { isExampleProject } from "../../guide/firstRun";
import { newId } from "../../project/ids";
import ImportDialog from "./ImportDialog";

/** The table's name: the file name without its extension. */
const tableNameOf = (fileName: string) =>
  fileName.replace(/\.[^.]+$/, "").trim() || "Imported data";

export default function TableFileImport() {
  const { apply, select, readOnly } = useProject();
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => onTableFile((f) => {
    if (readOnly) {
      notify(`Could not import “${f.name}”: this shared project is read-only. Make a copy to edit it.`,
        { tone: "error" });
      return;
    }
    setFile(f);
  }), [readOnly]);
  if (!file) return null;
  return (
    // a new file is a new dialog: nothing carries over from the last one
    <ImportDialog key={`${file.name}:${file.lastModified}:${file.size}`} file={file}
      onClose={() => setFile(null)}
      onCreate={(table, report) => {
        let dataId = "";
        apply((p) => {
          const r = projectWithTable(p, table, tableNameOf(file.name), newId, isExampleProject(p));
          dataId = r.dataId;
          return r.project;
        });
        setFile(null);
        if (dataId) {
          handOverReport(dataId, report);
          select(dataId);
        }
      }} />
  );
}
