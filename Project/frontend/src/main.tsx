import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Brand type (DESIGN.md §3.2): Anek Latin for headings, Mukta for text. Latin subsets only.
import '@fontsource-variable/anek-latin/wght.css'
import '@fontsource/mukta/latin-400.css'
import '@fontsource/mukta/latin-500.css'
import '@fontsource/mukta/latin-600.css'
import '@fontsource/mukta/latin-700.css'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { queryClient } from './api/query-client'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
