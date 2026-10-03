// Pyodide bridge: loads the real CPython + scipy in the browser and runs
// the same opendose package that the native test suite validates.
import { loadPyodide, version as pyodideVersion } from "pyodide";

export interface EngineBridge {
  analyze: (payload: unknown) => unknown;
}

let enginePromise: Promise<EngineBridge> | null = null;
let pyRuntime: Awaited<ReturnType<typeof loadPyodide>> | null = null;

export function getEngine(
  onStatus: (msg: string) => void = () => {},
): Promise<EngineBridge> {
  if (!enginePromise) {
    enginePromise = init(onStatus).catch((err) => {
      enginePromise = null; // allow retry after transient network failure
      throw err;
    });
  }
  return enginePromise;
}

// Dev/SPA servers answer missing files with index.html and HTTP 200, so a
// bad deploy or a fetch racing the sync-py copy would silently write HTML
// into the Python filesystem and die later with a confusing SyntaxError.
// Validate what came back and retry (bypassing caches) before giving up.
async function fetchAsset(url: string, name: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch(url, attempt ? { cache: "reload" } : undefined);
    const text = resp.ok ? await resp.text() : "";
    const looksHtml = /^\s*<(!doctype|html)/i.test(text);
    if (resp.ok && text && !looksHtml) return text;
    if (attempt >= 2) {
      throw new Error(`could not load engine file "${name}"` +
        (looksHtml
          ? " (the server returned a web page instead of the file)"
          : ` (HTTP ${resp.status})`));
    }
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
}

async function init(onStatus: (msg: string) => void): Promise<EngineBridge> {
  onStatus("Downloading Python runtime…");
  const py = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`,
  });
  onStatus("Loading NumPy + SciPy…");
  await py.loadPackage(["numpy", "scipy", "micropip"]);
  // openpyxl (xlsx plate import) is pure Python; not bundled with Pyodide
  const micropip = py.pyimport("micropip");
  await micropip.install("openpyxl");

  onStatus("Installing analysis engine…");
  py.FS.mkdirTree("/app/opendose");
  const pyFiles: string[] = JSON.parse(await fetchAsset(
    `${import.meta.env.BASE_URL}py/opendose/manifest.json`,
    "manifest.json",
  ));
  await Promise.all(
    pyFiles.map(async (name) => {
      const text = await fetchAsset(
        `${import.meta.env.BASE_URL}py/opendose/${name}`, name);
      py.FS.writeFile(`/app/opendose/${name}`, text);
    }),
  );
  py.runPython(
    'import sys\nsys.path.insert(0, "/app")\nfrom opendose.api import analyze_json',
  );
  const analyzeJson = py.globals.get("analyze_json");
  pyRuntime = py;

  return {
    analyze(payload: unknown) {
      return JSON.parse(analyzeJson(JSON.stringify(payload)) as string);
    },
  };
}

// ------------------------------------------------------------ xlsx reading

/** One worksheet as rows of cell text (numbers in full precision, dates
 *  as ISO text, blanks as ""). */
export interface XlsxSheet { name: string; rows: string[][] }

// Uses openpyxl, which the runtime already installs for plate import.
const READ_XLSX_PY = `
import base64, datetime, io, json
def _opendose_read_xlsx(b64):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(b64)),
                                data_only=True, read_only=True)
    out = []
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            cells = []
            for v in row:
                if v is None:
                    cells.append("")
                elif isinstance(v, bool):
                    cells.append("TRUE" if v else "FALSE")
                elif isinstance(v, datetime.datetime):
                    cells.append(v.date().isoformat() if v.time() == datetime.time(0)
                                 else v.isoformat(sep=" ", timespec="minutes"))
                elif isinstance(v, (datetime.date, datetime.time)):
                    cells.append(v.isoformat())
                elif isinstance(v, float):
                    cells.append(str(int(v)) if v.is_integer() and abs(v) < 1e15
                                 else repr(v))
                else:
                    cells.append(str(v))
            while cells and cells[-1] == "":
                cells.pop()
            rows.append(cells)
        while rows and not rows[-1]:
            rows.pop()
        out.append({"name": ws.title, "rows": rows})
    wb.close()
    return json.dumps(out)
`;
let xlsxReady = false;

/** Read every worksheet of an .xlsx file (in the browser, via the Python
 *  runtime; waits for it to load). */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxSheet[]> {
  await getEngine();
  const py = pyRuntime;
  if (!py) throw new Error("the Python runtime is not available");
  if (!xlsxReady) { py.runPython(READ_XLSX_PY); xlsxReady = true; }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const fn = py.globals.get("_opendose_read_xlsx");
  try {
    return JSON.parse(fn(btoa(bin)) as string) as XlsxSheet[];
  } finally {
    fn.destroy?.();
  }
}
