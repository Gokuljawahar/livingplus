import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Brand type (DESIGN.md §3.2): Plus Jakarta Sans for headings, Inter for text.
// Self-hosted variable fonts; browsers fetch only the subsets a page uses.
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@fontsource-variable/inter/wght.css'
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
