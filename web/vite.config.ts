import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// Version stamp for "How to cite" and the methods text: the package
// version, the commit it was built from and the build date.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
function commit(): string {
  const ci = process.env.GITHUB_SHA
  if (ci) return ci.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    return ''
  }
}

// The engine's Python files, hashed: the engine bundle's URL carries it
// (src/lib/buildInfo.ts), so browsers and the offline cache never mix an
// old engine with new pages.
function engineHash(): string {
  const dir = new URL('../engine/opendose/', import.meta.url)
  const h = createHash('sha256')
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.py')).sort()) {
    h.update(f).update(readFileSync(new URL(f, dir)))
  }
  return h.digest('hex').slice(0, 12)
}

const pyodideVersion: string = JSON.parse(readFileSync(
  new URL('./node_modules/pyodide/package.json', import.meta.url), 'utf8')).version
const pyodidePrefix = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`

/** Pyodide files the engine always loads: the runtime and the wheels of
 *  NumPy and SciPy (with their dependencies) named by the lock file. */
function pyodideFiles(): string[] {
  const lock = JSON.parse(readFileSync(
    new URL('./node_modules/pyodide/pyodide-lock.json', import.meta.url), 'utf8')) as {
    packages: Record<string, { file_name: string; depends?: string[] }>
  }
  const names = new Set<string>()
  const visit = (n: string) => {
    if (names.has(n) || !lock.packages[n]) return
    names.add(n)
    for (const d of lock.packages[n].depends ?? []) visit(d)
  }
  ;['numpy', 'scipy', 'micropip'].forEach(visit)
  return [
    'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json',
    ...[...names].map((n) => lock.packages[n].file_name),
  ].map((f) => pyodidePrefix + f)
}

/** dist/sw.js: the offline cache (sw/sw.js), told which files make up
 *  this build. */
function serviceWorker(hash: string): Plugin {
  return {
    name: 'opendose-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const app = [
        './', 'index.html', 'favicon.svg', 'icons.svg', `py/opendose/bundle.json?v=${hash}`,
        ...Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html'),
      ]
      const build = createHash('sha256').update(JSON.stringify(app)).digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8')
        .replace('__BUILD__', build)
        .replace('__APP_FILES__', JSON.stringify(app))
        .replace('__RUNTIME_FILES__', JSON.stringify(pyodideFiles()))
        .replace('__PYODIDE_PREFIX__', pyodidePrefix)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/** Put the boot entry's script first in the built page, so the engine
 *  worker starts while the app's own (much larger) code downloads. In dev
 *  main.tsx imports boot.ts as its first module. */
function bootFirst(base: string): Plugin {
  return {
    name: 'opendose-boot-first',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const boot = Object.values(ctx.bundle ?? {}).find((c) =>
          c.type === 'chunk' && c.isEntry && c.name === 'boot')
        if (!boot) return []
        return [{
          tag: 'script', injectTo: 'head-prepend',
          attrs: { type: 'module', crossorigin: true, src: `${base}${boot.fileName}` },
        }]
      },
    },
  }
}

const ENGINE_HASH = engineHash()

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site at /opendose/; dev stays at the root.
  // Engine fetches already resolve via import.meta.env.BASE_URL.
  base: command === 'build' ? '/opendose/' : '/',
  plugins: [react(), serviceWorker(ENGINE_HASH), bootFirst('/opendose/')],
  define: {
    __ENGINE_HASH__: JSON.stringify(ENGINE_HASH),
    __PYODIDE_VERSION__: JSON.stringify(pyodideVersion),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    rolldownOptions: {
      // boot.ts is an entry of its own (see bootFirst): a few kB that
      // start the engine worker without waiting for the app's code.
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        boot: fileURLToPath(new URL('./src/boot.ts', import.meta.url)),
      },
      output: {
        // Vendor code in chunks of its own, so a release that only changes
        // the app does not make browsers download Plotly (~4.8 MB) again.
        codeSplitting: {
          groups: [
            { name: 'plotly', test: /node_modules[\\/]plotly\.js-dist-min[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
    // Plotly's prebuilt bundle is one module and cannot be split further;
    // warn about anything bigger than it.
    chunkSizeWarningLimit: 5000,
  },
  // The engine worker imports pyodide's loader, which uses import.meta
  // and dynamic import(): ES module workers.
  worker: { format: 'es' },
  optimizeDeps: {
    // pyodide loads its own assets from the CDN at runtime; pre-bundling breaks it
    exclude: ['pyodide'],
  },
}))
