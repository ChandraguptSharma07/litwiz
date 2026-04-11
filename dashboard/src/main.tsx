// ──────────────────────────────────────────────────────────────
//  main.tsx — React application entry point
//
//  Mounts the root <App /> component into the DOM inside React
//  StrictMode. StrictMode enables extra development-time checks
//  (double-rendering, effect cleanup verification) that are
//  stripped in production builds.
// ──────────────────────────────────────────────────────────────

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
