import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Wallet } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { iconoPorNombre } from '../components/ui/SelectorIcono'
import { useCatalogo } from '../hooks/useCatalogo'
import { calcularPatrimonio } from '../services/accountsService'
import { ETIQUETA_TIPO_CUENTA } from '../types/db'
import { formatearGs } from '../utils/money'

/** Listado de cuentas con su saldo actual (calculado por `v_saldos_cuentas`). */
export function CuentasPage() {
  const navegar = useNavigate()
  const { cuentas, saldos, cargando, error, saldoPorId } = useCatalogo()

  const patrimonio = useMemo(() => calcularPatrimonio(saldos), [saldos])
  const activas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas])
  const inactivas = useMemo(() => cuentas.filter((c) => !c.activa), [cuentas])

  return (
    <>
      <Encabezado
        titulo="Cuentas"
        acciones={
          <button
            type="button"
            className="boton-icono"
            aria-label="Nueva cuenta"
            onClick={() => navegar('/cuentas/nueva')}
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        }
      />

      <div className="contenedor">
        <div className="tarjeta tarjeta--oscura patrimonio">
          <p className="patrimonio__etiqueta">Patrimonio total</p>
          <p className="patrimonio__monto numero">{cargando ? '—' : formatearGs(patrimonio)}</p>
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
                return (
                  <li key={cuenta.id}>
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
                          {cuenta.incluir_en_total ? '' : ' · Fuera del patrimonio'}
                        </span>
                      </span>
                      <span className="lista__monto numero">
                        {formatearGs(saldo?.saldo_actual ?? cuenta.saldo_inicial)}
                      </span>
                      <ChevronRight size={18} className="lista__flecha" aria-hidden="true" />
                    </button>
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
                        {formatearGs(saldo?.saldo_actual ?? cuenta.saldo_inicial)}
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
