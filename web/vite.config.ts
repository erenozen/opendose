import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the site at /opendose/; dev stays at the root.
  // Engine fetches already resolve via import.meta.env.BASE_URL.
  base: command === 'build' ? '/opendose/' : '/',
  plugins: [react()],
  optimizeDeps: {
    // pyodide loads its own assets from the CDN at runtime; pre-bundling breaks it
    exclude: ['pyodide'],
  },
}))
