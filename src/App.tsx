import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { supabaseConfigurado } from './lib/supabase'
import { useAuth } from './hooks/useAuth'
import { ProveedorCatalogo } from './hooks/useCatalogo'
import { LayoutApp } from './layouts/LayoutApp'
import { LayoutSimple } from './layouts/LayoutSimple'

import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { MovimientosPage } from './pages/MovimientosPage'
import { MovimientoDetallePage } from './pages/MovimientoDetallePage'
import { TransferenciaDetallePage } from './pages/TransferenciaDetallePage'
import { CuentasPage } from './pages/CuentasPage'
import { CuentaFormPage } from './pages/CuentaFormPage'
import { MovimientoFormPage } from './pages/MovimientoFormPage'
import { TransferenciaFormPage } from './pages/TransferenciaFormPage'
import { MasPage } from './pages/MasPage'

// Pantallas secundarias: se cargan solo cuando se visitan.
const CategoriasPage = lazy(() =>
  import('./pages/CategoriasPage').then((m) => ({ default: m.CategoriasPage })),
)
const PresupuestosPage = lazy(() =>
  import('./pages/PresupuestosPage').then((m) => ({ default: m.PresupuestosPage })),
)
const RecurrentesPage = lazy(() =>
  import('./pages/RecurrentesPage').then((m) => ({ default: m.RecurrentesPage })),
)
const ConciliacionPage = lazy(() =>
  import('./pages/ConciliacionPage').then((m) => ({ default: m.ConciliacionPage })),
)
const ConfiguracionPage = lazy(() =>
  import('./pages/ConfiguracionPage').then((m) => ({ default: m.ConfiguracionPage })),
)
const CuotasPage = lazy(() => import('./pages/CuotasPage').then((m) => ({ default: m.CuotasPage })))
const PlanDetallePage = lazy(() =>
  import('./pages/PlanDetallePage').then((m) => ({ default: m.PlanDetallePage })),
)
const PlanCuotasFormPage = lazy(() =>
  import('./pages/PlanCuotasFormPage').then((m) => ({ default: m.PlanCuotasFormPage })),
)

function PantallaCargando() {
  return (
    <div className="cargando-pantalla">
      <LoaderCircle size={28} className="girando" aria-hidden="true" />
      <p>Cargando Mis Finanzas…</p>
    </div>
  )
}

/** Se muestra cuando faltan las variables de entorno de Supabase. */
function PantallaConfiguracion() {
  return (
    <div className="login">
      <div className="login__caja">
        <div className="login__marca">
          <span className="login__logo" aria-hidden="true">
            <TriangleAlert size={30} />
          </span>
          <h1 className="login__titulo">Falta configuración</h1>
        </div>
        <div className="tarjeta tarjeta--relleno">
          <p style={{ marginBottom: 12 }}>
            La aplicación necesita las variables de entorno de Supabase para funcionar:
          </p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>
              <code>VITE_SUPABASE_URL</code>
            </li>
            <li>
              <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
            </li>
          </ul>
          <p className="campo__ayuda" style={{ marginTop: 12 }}>
            Configúralas en el entorno de despliegue (por ejemplo, en Vercel) y vuelve a cargar la
            página.
          </p>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const { comprobando, sesion } = useAuth()

  if (!supabaseConfigurado) return <PantallaConfiguracion />
  // Evita el parpadeo del login mientras se restaura la sesión guardada.
  if (comprobando) return <PantallaCargando />
  if (!sesion) return <LoginPage />

  return (
    <ProveedorCatalogo>
      <Suspense fallback={<PantallaCargando />}>
        <Routes>
          <Route element={<LayoutApp />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/movimientos" element={<MovimientosPage />} />
            <Route path="/movimientos/:id" element={<MovimientoDetallePage />} />
            <Route path="/transferencias/:id" element={<TransferenciaDetallePage />} />
            <Route path="/cuentas" element={<CuentasPage />} />
            <Route path="/mas" element={<MasPage />} />
            <Route path="/categorias" element={<CategoriasPage />} />
            <Route path="/presupuestos" element={<PresupuestosPage />} />
            <Route path="/recurrentes" element={<RecurrentesPage />} />
            <Route path="/conciliacion" element={<ConciliacionPage />} />
            <Route path="/cuotas" element={<CuotasPage />} />
            <Route path="/cuotas/:id" element={<PlanDetallePage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
          </Route>

          <Route element={<LayoutSimple />}>
            <Route path="/nuevo/gasto" element={<MovimientoFormPage tipo="gasto" />} />
            <Route path="/nuevo/ingreso" element={<MovimientoFormPage tipo="ingreso" />} />
            <Route path="/nuevo/transferencia" element={<TransferenciaFormPage />} />
            <Route path="/movimientos/:id/editar" element={<MovimientoFormPage modo="editar" />} />
            <Route
              path="/transferencias/:id/editar"
              element={<TransferenciaFormPage modo="editar" />}
            />
            <Route path="/cuentas/nueva" element={<CuentaFormPage />} />
            <Route path="/cuentas/:id/editar" element={<CuentaFormPage modo="editar" />} />
            <Route path="/cuotas/nueva" element={<PlanCuotasFormPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ProveedorCatalogo>
  )
}
