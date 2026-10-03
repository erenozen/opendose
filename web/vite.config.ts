import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site at /opendose/; dev stays at the root.
  // Engine fetches already resolve via import.meta.env.BASE_URL.
  base: command === 'build' ? '/opendose/' : '/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  optimizeDeps: {
    // pyodide loads its own assets from the CDN at runtime; pre-bundling breaks it
    exclude: ['pyodide'],
  },
}))
