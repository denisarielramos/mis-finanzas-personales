import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Wallet } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { BotonPrivacidad } from '../components/BotonPrivacidad'
import { Boton } from '../components/ui/Boton'
import { Interruptor } from '../components/ui/Interruptor'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { iconoPorNombre } from '../components/ui/SelectorIcono'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import { actualizarCuenta, calcularPatrimonio } from '../services/accountsService'
import { ETIQUETA_TIPO_CUENTA, type UUID } from '../types/db'
import { usePrivacidad } from '../hooks/usePrivacidad'
import { textoDeExcepcion } from '../lib/errors'

/** Listado de cuentas con su saldo actual (calculado por `v_saldos_cuentas`). */
export function CuentasPage() {
  const { monto } = usePrivacidad()
  const navegar = useNavigate()
  const avisos = useAvisos()
  const { cuentas, saldos, cargando, error, saldoPorId, refrescar } = useCatalogo()

  /** Valor optimista mientras la base confirma el cambio del interruptor. */
  const [pendientes, setPendientes] = useState<Record<UUID, boolean>>({})

  const patrimonio = useMemo(() => calcularPatrimonio(saldos), [saldos])
  const activas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas])
  const inactivas = useMemo(() => cuentas.filter((c) => !c.activa), [cuentas])

  /**
   * Cambia `incluir_en_total` con la misma actualización de cuentas de
   * siempre. No toca saldos ni movimientos: solo decide qué cuentas suman
   * en el patrimonio total (y, por tanto, en el disponible proyectado).
   */
  async function alternarIncluir(id: UUID, incluir: boolean) {
    setPendientes((actuales) => ({ ...actuales, [id]: incluir }))
    try {
      await actualizarCuenta(id, { incluir_en_total: incluir })
      await refrescar()
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo cambiar la cuenta.'))
    } finally {
      setPendientes((actuales) => {
        const copia = { ...actuales }
        delete copia[id]
        return copia
      })
    }
  }

  return (
    <>
      <Encabezado
        titulo="Cuentas"
        acciones={
          <>
            <BotonPrivacidad />
            <button
              type="button"
              className="boton-icono"
              aria-label="Nueva cuenta"
              onClick={() => navegar('/cuentas/nueva')}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          </>
        }
      />

      <div className="contenedor">
        <div className="tarjeta tarjeta--oscura patrimonio">
          <p className="patrimonio__etiqueta">Patrimonio total</p>
          <p className="patrimonio__monto numero">{cargando ? '—' : monto(patrimonio)}</p>
          <p className="patrimonio__pie">Suma de las cuentas activas incluidas en el total.</p>
        </div>

        {error ? (
          <div style={{ marginTop: 16 }}>
            <Mensaje tipo="error">{error}</Mensaje>
          </div>
        ) : null}

        <section className="seccion" aria-label="Cuentas activas">
          {cargando ? (
            <EsqueletoLista filas={4} />
          ) : activas.length === 0 ? (
            <EstadoVacio
              titulo="Todavía no tienes cuentas."
              texto="Crea tu primera cuenta para empezar a registrar movimientos."
              icono={<Wallet size={22} aria-hidden="true" />}
              accion={
                <Link to="/cuentas/nueva">
                  <Boton variante="primario">Crear mi primera cuenta</Boton>
                </Link>
              }
            />
          ) : (
            <ul className="lista">
              {activas.map((cuenta) => {
                const Icono = iconoPorNombre(cuenta.icono, Wallet)
                const saldo = saldoPorId(cuenta.id)
                const incluida = pendientes[cuenta.id] ?? cuenta.incluir_en_total
                return (
                  <li className="fila-con-accion fila-con-accion--compacta" key={cuenta.id}>
                    <button
                      type="button"
                      className="lista__item"
                      onClick={() => navegar(`/cuentas/${cuenta.id}/editar`)}
                    >
                      <span
                        className="icono-circular"
                        aria-hidden="true"
                        style={
                          cuenta.color
                            ? { background: `${cuenta.color}1a`, color: cuenta.color }
                            : undefined
                        }
                      >
                        <Icono size={18} />
                      </span>
                      <span className="lista__cuerpo">
                        <span className="lista__titulo">{cuenta.nombre}</span>
                        <span className="lista__detalle">
                          {ETIQUETA_TIPO_CUENTA[cuenta.tipo] ?? cuenta.tipo}
                          {incluida ? '' : ' · Fuera del patrimonio'}
                        </span>
                      </span>
                      <span className="lista__monto numero">
                        {monto(saldo?.saldo_actual ?? cuenta.saldo_inicial)}
                      </span>
                    </button>

                    <span className="fila-con-accion__accion">
                      <Interruptor
                        compacto
                        etiqueta={`Incluir ${cuenta.nombre} en el patrimonio`}
                        activo={incluida}
                        disabled={pendientes[cuenta.id] !== undefined}
                        onCambio={(valor) => alternarIncluir(cuenta.id, valor)}
                      />
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {inactivas.length > 0 ? (
          <section className="seccion" aria-label="Cuentas desactivadas">
            <div className="seccion__cabecera">
              <h2 className="seccion__titulo">Desactivadas</h2>
            </div>
            <ul className="lista">
              {inactivas.map((cuenta) => {
                const Icono = iconoPorNombre(cuenta.icono, Wallet)
                const saldo = saldoPorId(cuenta.id)
                return (
                  <li key={cuenta.id}>
                    <button
                      type="button"
                      className="lista__item"
                      style={{ opacity: 0.65 }}
                      onClick={() => navegar(`/cuentas/${cuenta.id}/editar`)}
                    >
                      <span className="icono-circular" aria-hidden="true">
                        <Icono size={18} />
                      </span>
                      <span className="lista__cuerpo">
                        <span className="lista__titulo">{cuenta.nombre}</span>
                        <span className="lista__detalle">
                          {ETIQUETA_TIPO_CUENTA[cuenta.tipo] ?? cuenta.tipo} · Desactivada
                        </span>
                      </span>
                      <span className="lista__monto numero">
                        {monto(saldo?.saldo_actual ?? cuenta.saldo_inicial)}
                      </span>
                      <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <p className="campo__ayuda" style={{ marginTop: 16 }}>
          El saldo mostrado es el que calcula la base de datos a partir del saldo inicial y de los
          movimientos confirmados.
        </p>
      </div>
    </>
  )
}
