import { Outlet } from 'react-router-dom'
import { BarraInferior } from '../components/BarraInferior'

/** Estructura con navegación inferior (pantallas principales). */
export function LayoutApp() {
  return (
    <div className="app">
      <main className="app__contenido">
        <Outlet />
      </main>
      <BarraInferior />
    </div>
  )
}
