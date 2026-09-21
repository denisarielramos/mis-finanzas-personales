import { Link } from 'react-router-dom'
import { ChevronRight, CreditCard, Link2, Repeat, Settings, Tags, Target } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { useAuth } from '../hooks/useAuth'

const OPCIONES = [
  {
    ruta: '/categorias',
    titulo: 'Categorías',
    detalle: 'Organiza tus ingresos y gastos',
    Icono: Tags,
  },
  {
    ruta: '/presupuestos',
    titulo: 'Presupuestos',
    detalle: 'Límites de gasto por categoría',
    Icono: Target,
  },
  {
    ruta: '/recurrentes',
    titulo: 'Recurrentes',
    detalle: 'Ingresos y gastos previstos que se repiten',
    Icono: Repeat,
  },
  {
    ruta: '/cuotas',
    titulo: 'Cuotas y financiaciones',
    detalle: 'Compras en cuotas y saldo pendiente',
    Icono: CreditCard,
  },
  {
    ruta: '/conciliacion',
    titulo: 'Conciliación',
    detalle: 'Transferencias entre cuentas por confirmar',
    Icono: Link2,
  },
  {
    ruta: '/configuracion',
    titulo: 'Configuración',
    detalle: 'Cuenta y datos de la aplicación',
    Icono: Settings,
  },
]

export function MasPage() {
  const { usuario } = useAuth()
  const inicial = (usuario?.email ?? '?').charAt(0).toUpperCase()

  return (
    <>
      <Encabezado titulo="Más" />

      <div className="contenedor">
        <div className="menu-mas">
          <div className="tarjeta perfil">
            <span className="perfil__avatar" aria-hidden="true">
              {inicial}
            </span>
            <span className="perfil__datos">
              <span className="perfil__correo">{usuario?.email ?? 'Sesión activa'}</span>
              <span className="lista__detalle">Cuenta personal · Guaraníes (PYG)</span>
            </span>
          </div>

          <ul className="lista">
            {OPCIONES.map(({ ruta, titulo, detalle, Icono }) => (
              <li key={ruta}>
                <Link to={ruta} className="lista__item">
                  <span className="icono-circular" aria-hidden="true">
                    <Icono size={18} />
                  </span>
                  <span className="lista__cuerpo">
                    <span className="lista__titulo">{titulo}</span>
                    <span className="lista__detalle">{detalle}</span>
                  </span>
                  <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
