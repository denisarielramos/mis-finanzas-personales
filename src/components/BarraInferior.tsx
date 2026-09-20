import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ArrowRightLeft, House, Plus, Receipt, Ellipsis, Wallet, Minus } from 'lucide-react'
import { Hoja } from './ui/Hoja'

const PESTANAS = [
  { ruta: '/', etiqueta: 'Inicio', Icono: House },
  { ruta: '/movimientos', etiqueta: 'Movimientos', Icono: Receipt },
  { ruta: '/cuentas', etiqueta: 'Cuentas', Icono: Wallet },
  { ruta: '/mas', etiqueta: 'Más', Icono: Ellipsis },
]

const NUEVAS_OPERACIONES = [
  {
    ruta: '/nuevo/gasto',
    titulo: 'Nuevo gasto',
    detalle: 'Registrar una salida de dinero',
    Icono: Minus,
    clase: 'icono-circular--negativo',
  },
  {
    ruta: '/nuevo/ingreso',
    titulo: 'Nuevo ingreso',
    detalle: 'Registrar una entrada de dinero',
    Icono: Plus,
    clase: 'icono-circular--positivo',
  },
  {
    ruta: '/nuevo/transferencia',
    titulo: 'Nueva transferencia',
    detalle: 'Mover dinero entre tus cuentas',
    Icono: ArrowRightLeft,
    clase: 'icono-circular--info',
  },
]

/** Navegación inferior fija, con el botón central para crear operaciones. */
export function BarraInferior() {
  const navegar = useNavigate()
  const [hojaAbierta, setHojaAbierta] = useState(false)

  return (
    <>
      <nav className="barra-inferior" aria-label="Navegación principal">
        {PESTANAS.slice(0, 2).map(({ ruta, etiqueta, Icono }) => (
          <NavLink
            key={ruta}
            to={ruta}
            end={ruta === '/'}
            className={({ isActive }) =>
              `barra-inferior__item${isActive ? ' barra-inferior__item--activo' : ''}`
            }
          >
            <Icono size={21} aria-hidden="true" />
            <span>{etiqueta}</span>
          </NavLink>
        ))}

        <div className="barra-inferior__centro">
          <button
            type="button"
            className="barra-inferior__mas"
            aria-label="Nueva operación"
            aria-haspopup="dialog"
            aria-expanded={hojaAbierta}
            onClick={() => setHojaAbierta(true)}
          >
            <Plus size={26} aria-hidden="true" />
          </button>
        </div>

        {PESTANAS.slice(2).map(({ ruta, etiqueta, Icono }) => (
          <NavLink
            key={ruta}
            to={ruta}
            className={({ isActive }) =>
              `barra-inferior__item${isActive ? ' barra-inferior__item--activo' : ''}`
            }
          >
            <Icono size={21} aria-hidden="true" />
            <span>{etiqueta}</span>
          </NavLink>
        ))}
      </nav>

      <Hoja abierta={hojaAbierta} titulo="Nueva operación" onCerrar={() => setHojaAbierta(false)}>
        <div className="hoja__opciones">
          {NUEVAS_OPERACIONES.map(({ ruta, titulo, detalle, Icono, clase }) => (
            <button
              key={ruta}
              type="button"
              className="hoja__opcion"
              onClick={() => {
                setHojaAbierta(false)
                navegar(ruta)
              }}
            >
              <span className={`icono-circular ${clase}`} aria-hidden="true">
                <Icono size={20} />
              </span>
              <span>
                <span className="hoja__opcion-titulo" style={{ display: 'block' }}>
                  {titulo}
                </span>
                <span className="hoja__opcion-detalle">{detalle}</span>
              </span>
            </button>
          ))}
        </div>
      </Hoja>
    </>
  )
}
