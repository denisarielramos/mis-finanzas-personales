import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Dialogo } from '../components/ui/Dialogo'
import { useAuth } from '../hooks/useAuth'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import { formatearFechaHora } from '../utils/date'
import { textoDeExcepcion } from '../lib/errors'

const VERSION = '1.0.0'

export function ConfiguracionPage() {
  const { usuario, salir } = useAuth()
  const avisos = useAvisos()
  const enLinea = useConexion()
  const [confirmando, setConfirmando] = useState(false)
  const [saliendo, setSaliendo] = useState(false)

  async function cerrar() {
    setSaliendo(true)
    try {
      await salir()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo cerrar la sesión.'))
    } finally {
      setSaliendo(false)
      setConfirmando(false)
    }
  }

  return (
    <>
      <Encabezado titulo="Configuración" volver="/mas" />

      <div className="contenedor">
        <section className="seccion" aria-label="Usuario actual" style={{ marginTop: 0 }}>
          <div className="seccion__cabecera">
            <h2 className="seccion__titulo">Usuario actual</h2>
          </div>
          <div className="tarjeta">
            <div className="datos">
              <div className="datos__fila">
                <span className="datos__clave">Correo</span>
                <span className="datos__valor">{usuario?.email ?? '—'}</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Último acceso</span>
                <span className="datos__valor numero">
                  {formatearFechaHora(usuario?.last_sign_in_at ?? null)}
                </span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Conexión</span>
                <span className="datos__valor">{enLinea ? 'En línea' : 'Sin conexión'}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="seccion" aria-label="Información de la aplicación">
          <div className="seccion__cabecera">
            <h2 className="seccion__titulo">Información de la aplicación</h2>
          </div>
          <div className="tarjeta">
            <div className="datos">
              <div className="datos__fila">
                <span className="datos__clave">Aplicación</span>
                <span className="datos__valor">Mis Finanzas</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Versión</span>
                <span className="datos__valor numero">{VERSION}</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Moneda</span>
                <span className="datos__valor">Guaraní paraguayo (PYG)</span>
              </div>
              <div className="datos__fila">
                <span className="datos__clave">Datos</span>
                <span className="datos__valor">Supabase con RLS por usuario</span>
              </div>
            </div>
          </div>
          <p className="campo__ayuda" style={{ marginTop: 12 }}>
            Las operaciones financieras (crear, editar, anular y conciliar) se ejecutan mediante
            funciones RPC de PostgreSQL, que son las que mantienen la consistencia contable.
          </p>
        </section>

        <div className="acciones-pila">
          <Boton
            variante="peligro"
            bloque
            tamano="grande"
            icono={<LogOut size={18} aria-hidden="true" />}
            onClick={() => setConfirmando(true)}
          >
            Cerrar sesión
          </Boton>
        </div>
      </div>

      <Dialogo
        abierto={confirmando}
        titulo="¿Cerrar sesión?"
        mensaje="Tendrás que volver a escribir tu correo y contraseña para entrar."
        textoConfirmar="Cerrar sesión"
        peligroso
        procesando={saliendo}
        onConfirmar={cerrar}
        onCancelar={() => setConfirmando(false)}
      />
    </>
  )
}
