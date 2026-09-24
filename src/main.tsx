import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'

import { App } from './App'
import { ProveedorAuth } from './hooks/useAuth'
import { ProveedorAvisos } from './hooks/useToast'
import { ProveedorPrivacidad } from './hooks/usePrivacidad'
import './styles/index.css'

const contenedor = document.getElementById('root')
if (!contenedor) throw new Error('No se encontró el elemento #root')

createRoot(contenedor).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorAvisos>
        <ProveedorPrivacidad>
          <ProveedorAuth>
            <App />
          </ProveedorAuth>
        </ProveedorPrivacidad>
      </ProveedorAvisos>
    </BrowserRouter>
  </StrictMode>,
)

// Service worker: cachea el shell de la aplicación y se actualiza solo.
// Los datos financieros nunca se cachean: siempre se piden a Supabase.
registerSW({ immediate: true })
