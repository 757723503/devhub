import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isOverlayView } from '@renderer/features/overlay/is-overlay'
import { appearance } from '@renderer/lib/appearance'
import { RemoteGate } from '@renderer/features/remote/remote-gate'
import App from './App'

const queryClient = new QueryClient()

if (isOverlayView()) document.documentElement.dataset.overlay = 'true'
appearance.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RemoteGate>
        <App />
      </RemoteGate>
    </QueryClientProvider>
  </StrictMode>
)
