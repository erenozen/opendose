// First: start the engine worker (in builds boot.ts also loads on its
// own, ahead of this bundle; see vite.config.ts bootFirst).
import './boot'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { registerOfflineCache } from './lib/offline'
// Listens for the install prompt before it can fire (About › Install as app).
import './app/install'
import { hasProtectedLink } from './share/boot'
import UnlockScreen from './share/UnlockScreen'

const root = createRoot(document.getElementById('root')!)
const renderApp = () => root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// A password-protected share link ("#e=…") asks for its password first;
// the app then opens the unlocked project the way it opens a "#p=" link.
if (hasProtectedLink()) {
  root.render(
    <StrictMode>
      <UnlockScreen onDone={renderApp} />
    </StrictMode>,
  )
} else {
  renderApp()
}

registerOfflineCache()
