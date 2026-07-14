import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import 'devextreme/dist/css/dx.light.css'

import './assets/styles/variables.css'
import './assets/styles/site.css'
import './assets/styles/dashboard.css'
import './i18n'

import App from './App'

// DevExtreme license
import dxConfig from 'devextreme/core/config'
dxConfig({
  licenseKey:
    'ewogICJmb3JtYXQiOiAxLAogICJjdXN0b21lcklkIjogImQxYTEwNTVhLWE0OTAtNDdhZi04MTQzLWE4Y2M4M2Y4MjQyYSIsCiAgIm1heFZlcnNpb25BbGxvd2VkIjogMjUxCn0=.Jde6ONLDG8lEWJHkd3k0zfWYZYaHy6vV3kRi7QP7Tar7ED17MLnt+XYHQJPtDMLzEiwvslyFHDHpJqHtlneW0BoiUwkSC+Mh5MuWjlOD2XtP3BbFIZkD4ePc8ECU4Ck1rd1Rrg==',
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
