import { useState, type FormEvent } from 'react'
import { ChartNoAxesColumn, Eye, EyeOff } from 'lucide-react'
import { Boton } from '../components/ui/Boton'
import { Campo } from '../components/ui/Campo'
import { Mensaje } from '../components/ui/Estados'
import { useAuth } from '../hooks/useAuth'
import { textoDeExcepcion } from '../lib/errors'

/** Acceso a la aplicación. No existe registro público: es de uso personal. */
export function LoginPage() {
  const { entrar } = useAuth()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return

    if (!correo.trim() || !password) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }

    setEnviando(true)
    setError(null)
    try {
      await entrar(correo, password)
    } catch (e) {
      setError(textoDeExcepcion(e, 'No se pudo iniciar sesión.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <div className="login__caja">
        <div className="login__marca">
          <span className="login__logo" aria-hidden="true">
            <ChartNoAxesColumn size={32} strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="login__titulo">Mis Finanzas</h1>
            <p className="login__subtitulo">Tus cuentas, siempre a mano.</p>
          </div>
        </div>

        <form className="formulario" onSubmit={alEnviar} noValidate>
          <Campo etiqueta="Correo">
            {(props) => (
              <input
                {...props}
                className="control"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="next"
                placeholder="tu@correo.com"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            )}
          </Campo>

          <Campo etiqueta="Contraseña">
            {(props) => (
              <div style={{ position: 'relative' }}>
                <input
                  {...props}
                  className="control"
                  type={verPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  placeholder="••••••••"
                  style={{ paddingRight: 52 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="boton-icono boton-icono--plano"
                  style={{ position: 'absolute', right: 2, top: 0 }}
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setVerPassword((v) => !v)}
                >
                  {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}
          </Campo>

          {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

          <Boton type="submit" variante="primario" tamano="grande" bloque cargando={enviando}>
            Iniciar sesión
          </Boton>
        </form>

        <p className="login__pie">Aplicación personal · Montos en guaraníes (PYG)</p>
      </div>
    </div>
  )
}
