import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './responsive-fixes.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Die PWA benötigt auf manchen Desktop-Browsern einen Service Worker für
// die Installations-Eingabeaufforderung. Keine Haushaltsdaten offline cachen.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    void navigator.serviceWorker.register(`${base}service-worker.js`, { scope: base })
      .catch((error: unknown) => console.warn('App-Installation: Service Worker konnte nicht registriert werden.', error))
  })
}
