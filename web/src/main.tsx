// First: start the engine worker (in builds boot.ts also loads on its
// own, ahead of this bundle; see vite.config.ts bootFirst).
import './boot'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import { registerOfflineCache } from './lib/offline'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerOfflineCache()
