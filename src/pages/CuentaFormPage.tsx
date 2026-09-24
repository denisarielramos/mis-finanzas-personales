import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Power, Wallet } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { InputMonto } from '../components/ui/CampoMonto'
import { Dialogo } from '../components/ui/Dialogo'
import { Interruptor } from '../components/ui/Interruptor'
import { Mensaje } from '../components/ui/Estados'
import { SelectorColor, SelectorIcono } from '../components/ui/SelectorIcono'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { useConexion } from '../hooks/useConexion'
import {
  actualizarCuenta,
  cambiarEstadoCuenta,
  crearCuenta,
  obtenerCuenta,
} from '../services/accountsService'
import { ETIQUETA_TIPO_CUENTA, TIPOS_CUENTA, type TipoCuenta } from '../types/db'
import { parsearEntradaMonto } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

interface Props {
  modo?: 'crear' | 'editar'
}

/** Alta y edición de cuentas. Las cuentas se desactivan, no se borran. */
export function CuentaFormPage({ modo = 'crear' }: Props) {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const enLinea = useConexion()
  const { actualizarCuentaLocal, refrescarCuentas, refrescarSaldos } = useCatalogo()

  const editando = modo === 'editar'

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCuenta>('banco')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [icono, setIcono] = useState<string | null>('wallet')
  const [color, setColor] = useState<string | null>(null)
  const [incluirEnTotal, setIncluirEnTotal] = useState(true)
  const [activa, setActiva] = useState(true)

  const [cargando, setCargando] = useState(editando)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [confirmandoEstado, setConfirmandoEstado] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)

  useEffect(() => {
    if (!editando || !id) return
    let vigente = true

    setCargando(true)
    obtenerCuenta(id)
      .then((cuenta) => {
        if (!vigente) return
        if (!cuenta) {
          setErrorCarga('Esta cuenta ya no existe.')
          return
        }
        setNombre(cuenta.nombre)
        setTipo(cuenta.tipo)
        setSaldoInicial(String(cuenta.saldo_inicial ?? 0))
        setDescripcion(cuenta.descripcion ?? '')
        setIcono(cuenta.icono ?? 'wallet')
        setColor(cuenta.color)
        setIncluirEnTotal(cuenta.incluir_en_total)
        setActiva(cuenta.activa)
      })
      .catch((e: unknown) => {
        if (vigente) setErrorCarga(textoDeExcepcion(e, 'No se pudo cargar la cuenta.'))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [editando, id])

  function validar(): boolean {
    const nuevos: Record<string, string> = {}
    if (!nombre.trim()) nuevos.nombre = 'Escribe un nombre para la cuenta.'
    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (guardando) return
    if (!enLinea) {
      avisos.error('Sin conexión: no se puede guardar ahora.')
      return
    }
    if (!validar()) return

    setGuardando(true)
    try {
      const datos = {
        nombre,
        tipo,
        saldo_inicial: parsearEntradaMonto(saldoInicial),
        descripcion: descripcion || null,
        color,
        icono,
        incluir_en_total: incluirEnTotal,
        activa,
      }

      if (editando) {
        const guardada = await actualizarCuenta(id, datos)
        // Lo que cambió ya se conoce: se aplica en memoria en vez de volver a
        // descargar el catálogo. El saldo inicial sí afecta al saldo actual,
        // que calcula la vista, así que los saldos se revalidan en silencio.
        actualizarCuentaLocal(id, guardada)
        void refrescarSaldos()
        avisos.exito('Cuenta actualizada correctamente.')
      } else {
        await crearCuenta(datos)
        // Es una fila nueva: hay que traerla, pero sin vaciar la pantalla.
        await Promise.all([refrescarCuentas(), refrescarSaldos()])
        avisos.exito('Cuenta creada correctamente.')
      }

      navegar('/cuentas')
    } catch (e) {
      avisos.error(
        textoDeExcepcion(e, editando ? 'No se pudo actualizar la cuenta.' : 'No se pudo crear la cuenta.'),
      )
    } finally {
      setGuardando(false)
    }
  }

  async function alternarEstado() {
    setCambiandoEstado(true)
    try {
      const nuevoEstado = !activa
      await cambiarEstadoCuenta(id, nuevoEstado)
      setActiva(nuevoEstado)
      // La cuenta cambia de sección y sale (o vuelve) al patrimonio al
      // instante, sin recargar el catálogo entero. El saldo no se toca.
      actualizarCuentaLocal(id, { activa: nuevoEstado })
      avisos.exito(nuevoEstado ? 'Cuenta activada.' : 'Cuenta desactivada.')
      navegar('/cuentas')
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo cambiar el estado de la cuenta.'))
    } finally {
      setCambiandoEstado(false)
      setConfirmandoEstado(false)
    }
  }

  return (
    <>
      <Encabezado titulo={editando ? 'Editar cuenta' : 'Nueva cuenta'} volver="/cuentas" />

      <div className="contenedor">
        {errorCarga ? (
          <Mensaje tipo="error">{errorCarga}</Mensaje>
        ) : (
          <form className="formulario" onSubmit={alEnviar} noValidate>
            <Campo etiqueta="Nombre" error={errores.nombre}>
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Banco Atlas"
                  value={nombre}
                  maxLength={80}
                  disabled={cargando}
                  onChange={(e) => setNombre(e.target.value)}
                />
              )}
            </Campo>

            <Campo etiqueta="Tipo">
              {(props) => (
                <select
                  {...props}
                  className="control"
                  value={tipo}
                  disabled={cargando}
                  onChange={(e) => setTipo(e.target.value as TipoCuenta)}
                >
                  {TIPOS_CUENTA.map((valor) => (
                    <option key={valor} value={valor}>
                      {ETIQUETA_TIPO_CUENTA[valor]}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            <Campo
              etiqueta="Saldo inicial"
              ayuda="Saldo que tenía la cuenta antes de registrar movimientos aquí."
            >
              {(props) => (
                <InputMonto
                  {...props}
                  valor={saldoInicial}
                  disabled={cargando}
                  onChange={setSaldoInicial}
                />
              )}
            </Campo>

            <Campo etiqueta="Descripción">
              {(props) => (
                <input
                  {...props}
                  className="control"
                  type="text"
                  placeholder="Opcional"
                  value={descripcion}
                  maxLength={200}
                  disabled={cargando}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              )}
            </Campo>

            <div className="campo">
              <span className="campo__etiqueta">Icono</span>
              <SelectorIcono valor={icono} onCambio={setIcono} />
            </div>

            <div className="campo">
              <span className="campo__etiqueta">Color</span>
              <SelectorColor valor={color} onCambio={setColor} />
            </div>

            <div className="tarjeta tarjeta--relleno">
              <Interruptor
                etiqueta="Incluir en el patrimonio"
                descripcion="Si lo desactivas, el saldo no suma al patrimonio total."
                activo={incluirEnTotal}
                onCambio={setIncluirEnTotal}
                disabled={cargando}
              />
            </div>

            <div className="pie-formulario">
              <Boton
                type="submit"
                variante="primario"
                tamano="grande"
                bloque
                cargando={guardando}
                disabled={cargando}
                icono={<Wallet size={18} aria-hidden="true" />}
              >
                {editando ? 'Guardar cambios' : 'Crear cuenta'}
              </Boton>

              {editando ? (
                <div style={{ marginTop: 8 }}>
                  <Boton
                    variante={activa ? 'peligro' : 'secundario'}
                    bloque
                    icono={<Power size={17} aria-hidden="true" />}
                    onClick={() => setConfirmandoEstado(true)}
                    disabled={cargando || guardando}
                  >
                    {activa ? 'Desactivar cuenta' : 'Activar cuenta'}
                  </Boton>
                </div>
              ) : null}
            </div>
          </form>
        )}
      </div>

      <Dialogo
        abierto={confirmandoEstado}
        titulo={activa ? '¿Desactivar esta cuenta?' : '¿Activar esta cuenta?'}
        mensaje={
          activa
            ? 'La cuenta dejará de aparecer al registrar movimientos y no sumará al patrimonio. Sus movimientos se conservan.'
            : 'La cuenta volverá a estar disponible para registrar movimientos.'
        }
        textoConfirmar={activa ? 'Desactivar' : 'Activar'}
        peligroso={activa}
        procesando={cambiandoEstado}
        onConfirmar={alternarEstado}
        onCancelar={() => setConfirmandoEstado(false)}
      />
    </>
  )
}
