import { useMemo, useState } from 'react'
import { ArrowRight, Check, Link2, X } from 'lucide-react'
import { Encabezado } from '../components/Encabezado'
import { Boton } from '../components/ui/Boton'
import { Dialogo } from '../components/ui/Dialogo'
import { EsqueletoLista, EstadoVacio, Mensaje } from '../components/ui/Estados'
import { useCarga } from '../hooks/useCarga'
import { useCatalogo } from '../hooks/useCatalogo'
import { useAvisos } from '../hooks/useToast'
import {
  DIAS_MAX_POR_DEFECTO,
  buscarTransferenciasPotenciales,
  conciliarTransferencia,
  motivosDeCoincidencia,
} from '../services/reconcileService'
import { ETIQUETA_NIVEL, type TransferenciaPotencial } from '../types/db'
import { formatearFecha } from '../utils/date'
import { formatearGs } from '../utils/money'
import { textoDeExcepcion } from '../lib/errors'

const CLASE_NIVEL: Record<string, string> = {
  alta: 'etiqueta--positivo',
  media: 'etiqueta--aviso',
  baja: '',
}

function clave(candidato: TransferenciaPotencial): string {
  return `${candidato.salida_id}|${candidato.entrada_id}`
}

/**
 * Conciliación de transferencias.
 * Nada se concilia automáticamente: cada par se confirma a mano.
 */
export function ConciliacionPage() {
  const avisos = useAvisos()
  const { refrescarSaldos } = useCatalogo()

  const [version, setVersion] = useState(0)
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState<TransferenciaPotencial | null>(null)
  const [procesando, setProcesando] = useState(false)

  const { datos, cargando, error } = useCarga(
    () => buscarTransferenciasPotenciales(DIAS_MAX_POR_DEFECTO),
    [version],
    'No se pudieron buscar transferencias potenciales.',
  )

  const candidatos = useMemo(
    () => (datos ?? []).filter((c) => !ignorados.has(clave(c))),
    [datos, ignorados],
  )

  async function confirmar() {
    if (!confirmando) return
    setProcesando(true)
    try {
      await conciliarTransferencia(confirmando.salida_id, confirmando.entrada_id)
      await refrescarSaldos()
      avisos.exito('Transferencia conciliada correctamente.')
      setConfirmando(null)
      setVersion((v) => v + 1)
    } catch (e) {
      avisos.error(textoDeExcepcion(e, 'No se pudo conciliar la transferencia.'))
    } finally {
      setProcesando(false)
    }
  }

  function ignorar(candidato: TransferenciaPotencial) {
    setIgnorados((actuales) => new Set(actuales).add(clave(candidato)))
    avisos.info('Sugerencia ocultada hasta que vuelvas a entrar.')
  }

  return (
    <>
      <Encabezado
        titulo="Conciliación"
        volver="/mas"
        subtitulo={`Coincidencias con hasta ${DIAS_MAX_POR_DEFECTO} días de diferencia`}
      />

      <div className="contenedor">
        {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

        {cargando ? (
          <EsqueletoLista filas={3} />
        ) : candidatos.length === 0 ? (
          <EstadoVacio
            titulo="No hay transferencias pendientes de conciliación."
            texto="Cuando dos movimientos de cuentas distintas parezcan una misma transferencia, aparecerán aquí."
            icono={<Link2 size={22} aria-hidden="true" />}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {candidatos.map((candidato) => (
              <article className="tarjeta candidato" key={clave(candidato)}>
                <div className="candidato__cabecera">
                  <span className="etiqueta etiqueta--info">Posible transferencia</span>
                  <span className={`etiqueta ${CLASE_NIVEL[candidato.nivel] ?? ''}`}>
                    {ETIQUETA_NIVEL[candidato.nivel] ?? candidato.nivel}
                  </span>
                </div>

                <p className="candidato__ruta">
                  <span>{candidato.cuenta_origen}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                  <span>{candidato.cuenta_destino}</span>
                </p>

                <p className="candidato__monto numero">
                  {formatearGs(candidato.monto, { signo: 'nunca' })}
                </p>

                <p className="texto-suave numero" style={{ fontSize: '0.875rem' }}>
                  Salida {formatearFecha(candidato.fecha_salida)} · Entrada{' '}
                  {formatearFecha(candidato.fecha_entrada)}
                </p>

                <div className="candidato__motivos">
                  {motivosDeCoincidencia(candidato).map((motivo) => (
                    <span className="etiqueta" key={motivo}>
                      {motivo}
                    </span>
                  ))}
                  <span className="etiqueta">Puntaje: {candidato.puntaje}</span>
                </div>

                <div className="candidato__descripciones">
                  <span>
                    <strong>Salida:</strong> {candidato.descripcion_salida || 'Sin descripción'}
                  </span>
                  <span>
                    <strong>Entrada:</strong> {candidato.descripcion_entrada || 'Sin descripción'}
                  </span>
                </div>

                <div className="candidato__acciones">
                  <Boton
                    variante="secundario"
                    icono={<X size={16} aria-hidden="true" />}
                    onClick={() => ignorar(candidato)}
                  >
                    Ignorar
                  </Boton>
                  <Boton
                    variante="primario"
                    icono={<Check size={16} aria-hidden="true" />}
                    onClick={() => setConfirmando(candidato)}
                  >
                    Confirmar
                  </Boton>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="campo__ayuda" style={{ marginTop: 16 }}>
          «Ignorar» solo oculta la sugerencia durante esta visita: la base de datos actual no tiene
          dónde guardar los descartes, y esta aplicación no modifica el esquema.
        </p>
      </div>

      <Dialogo
        abierto={confirmando !== null}
        titulo="¿Confirmar la transferencia?"
        mensaje={
          confirmando
            ? `Los dos movimientos de ${formatearGs(confirmando.monto, { signo: 'nunca' })} pasarán a ser una única transferencia entre ${confirmando.cuenta_origen} y ${confirmando.cuenta_destino}. Dejarán de contar como gasto e ingreso.`
            : ''
        }
        textoConfirmar="Confirmar"
        procesando={procesando}
        onConfirmar={confirmar}
        onCancelar={() => setConfirmando(null)}
      />
    </>
  )
}
