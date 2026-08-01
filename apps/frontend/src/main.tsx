import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './providers/AuthProvider'
import { ToastProvider } from './providers/ToastProvider'
import { OfflineProvider } from './providers/OfflineProvider'
import './styles/index.css'

/**
 * The service worker is a production-only concern. If a previous session left
 * one registered against the dev server it will keep controlling this page and
 * can serve a stale or empty shell, so tear any of them down on startup in dev.
 */
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      void registration.unregister()
    }
  })
  if ('caches' in window) {
    void caches.keys().then((keys) => keys.forEach((key) => void caches.delete(key)))
  }
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/*
          Vite's BASE_URL carries the trailing slash the router rejects, so it
          is trimmed here. One source of truth: change `base` in vite.config.ts
          and the router follows.
        */}
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ToastProvider>
            <AuthProvider>
              <OfflineProvider>
                <App />
              </OfflineProvider>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
