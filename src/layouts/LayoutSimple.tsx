import { Outlet } from 'react-router-dom'

/** Estructura sin navegación inferior (formularios a pantalla completa). */
export function LayoutSimple() {
  return (
    <div className="app">
      <main className="app__contenido" style={{ paddingBottom: 'var(--espacio-6)' }}>
        <Outlet />
      </main>
    </div>
  )
}
