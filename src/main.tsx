import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Redirect GitHub Pages to Vercel automatically
if (window.location.hostname.includes('github.io')) {
  window.location.replace('https://references-validation.vercel.app' + window.location.search + window.location.hash);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
