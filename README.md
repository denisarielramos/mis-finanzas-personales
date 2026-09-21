# Mis Finanzas

Aplicación web (PWA) de finanzas personales en guaraníes (PYG), pensada primero para
iPhone y también utilizable desde una PC. Se instala desde Safari con
**Compartir → Añadir a pantalla de inicio**.

Toda la interfaz está en español y los importes se muestran siempre como `Gs. 150.000`,
sin decimales.

## Qué incluye

- **Acceso** con correo y contraseña (Supabase Auth). No hay registro público.
- **Inicio**: patrimonio total, resumen del mes (ingresos, gastos, balance), cuentas,
  últimos movimientos y gasto por categoría.
- **Movimientos** del mes agrupados por fecha, con filtros (todos, gastos, ingresos,
  transferencias). Las dos mitades de una transferencia se muestran como una sola
  operación: `Banco Atlas → Ueno`.
- **Detalle** de cada operación, con edición y eliminación (anulación).
- **Alta de gastos, ingresos y transferencias** con formularios cómodos en móvil.
- **Cuentas**: crear, editar y desactivar.
- **Categorías** (incluidas subcategorías), **presupuestos**, **recurrentes** y
  **conciliación de transferencias**.
- **Configuración**: usuario actual y cierre de sesión.

## Stack

| Pieza | Uso |
|---|---|
| React + TypeScript | Interfaz y tipos |
| Vite | Desarrollo y build |
| @supabase/supabase-js | Acceso a datos y autenticación |
| lucide-react | Iconos |
| recharts | Gráfico de gastos por categoría |
| vite-plugin-pwa | Manifest y service worker |
| react-router-dom | Navegación entre pantallas |

Estilos con CSS propio (variables y clases), sin framework de UI. Hay modo claro y
modo oscuro, siguiendo el ajuste del sistema.

## Variables de entorno

La aplicación solo usa credenciales **públicas**:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Están declaradas en `.env.example`. Para desarrollo local se copian a `.env.local`
(ignorado por git). **Nunca** se usa `service_role`, `sb_secret` ni la contraseña de la
base de datos: el acceso a los datos lo controla RLS en PostgreSQL.

Si faltan las variables, la aplicación no se rompe: muestra una pantalla que indica qué
falta configurar.

## Ejecución

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # build de producción en dist/
npm run preview  # previsualiza el build
```

## Despliegue en Vercel

1. Importar el repositorio en Vercel (framework detectado: Vite).
2. Build command: `npm run build` · Output directory: `dist`.
3. En **Settings → Environment Variables** añadir `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Desplegar.

`vercel.json` ya incluye la reescritura a `index.html` (necesaria para que funcionen las
rutas internas al recargar) y evita cachear `sw.js` y el manifest.

## Instalación como PWA en iPhone

1. Abrir la URL desplegada en **Safari** (no en otro navegador).
2. Pulsar **Compartir**.
3. **Añadir a pantalla de inicio**.
4. Abrir la app desde el icono: se ve a pantalla completa, sin barra de navegador.

La sesión se mantiene al cerrar y volver a abrir la aplicación.

## Lógica financiera: todo pasa por los RPC de PostgreSQL

La aplicación **no duplica la lógica contable en React**. Se apoya en las funciones que
ya existen en la base de datos:

| RPC | Dónde se usa |
|---|---|
| `crear_movimiento` | `src/services/movementsService.ts` → formulario de gasto/ingreso |
| `editar_movimiento` | `src/services/movementsService.ts` → edición de gasto/ingreso |
| `anular_movimiento` | `src/services/movementsService.ts` → «Eliminar movimiento» |
| `crear_transferencia` | `src/services/transfersService.ts` → nueva transferencia |
| `editar_transferencia` | `src/services/transfersService.ts` → editar transferencia |
| `anular_transferencia` | `src/services/transfersService.ts` → «Eliminar transferencia» |
| `buscar_transferencias_potenciales` | `src/services/reconcileService.ts` → pantalla Conciliación |
| `conciliar_transferencia` | `src/services/reconcileService.ts` → botón «Confirmar» |

Reglas que respeta la aplicación:

- Los montos se envían **siempre en positivo**; `monto_firmado` lo calcula la base.
- **Nunca** se borra un movimiento físicamente: se anula.
- **Nunca** se crea, edita ni anula una sola mitad de una transferencia.
- Una transferencia entre cuentas propias **no es gasto ni ingreso**: no entra en los
  totales ni en los presupuestos.
- Ingresos y gastos del resumen cuentan solo `estado = confirmado`.
- El saldo de cada cuenta viene de la vista **`v_saldos_cuentas`**; no se recalcula
  descargando movimientos.
- La conciliación nunca es automática: cada par se confirma a mano.

Las cuentas, categorías y presupuestos sí se escriben directamente en sus tablas
(`insert`/`update`, respetando RLS). El `user_id` se obtiene siempre de Supabase Auth,
nunca está escrito en el código.

## Estructura

```
src/
  components/      # Componentes compartidos (cabecera, filas, gráfico) y ui/
  hooks/           # Contextos y hooks (auth, catálogo, avisos, carga, conexión)
  layouts/         # Estructura con y sin barra inferior
  lib/             # Cliente Supabase y traducción de errores
  pages/           # Una pantalla por archivo
  services/        # Acceso a datos: un servicio por dominio
  styles/          # Tokens, base, layout, componentes y pantallas
  types/           # Tipos del esquema existente
  utils/           # Formato de dinero, fechas y agrupación de movimientos
public/icons/      # Iconos de la PWA
scripts/           # Generador de iconos provisionales
```

## Iconos: qué reemplazar

Los iconos actuales son **provisionales** (fondo oscuro con tres barras). Para poner el
logotipo definitivo basta con sobrescribir estos archivos manteniendo nombre y tamaño:

| Archivo | Tamaño |
|---|---|
| `public/icons/icon-192.png` | 192 × 192 |
| `public/icons/icon-512.png` | 512 × 512 |
| `public/icons/icon-maskable-512.png` | 512 × 512 (con margen de seguridad) |
| `public/icons/apple-touch-icon.png` | 180 × 180 (sin transparencia) |
| `public/favicon.svg` | vectorial |

Con `npm run icons` se regeneran los provisionales.

## Limitaciones conocidas

- **Sin operaciones offline.** El service worker cachea la aplicación, pero los datos
  siempre se piden en vivo. Si no hay conexión, los formularios avisan en lugar de
  encolar operaciones financieras.
- **«Ignorar» en Conciliación no se guarda.** Solo oculta la sugerencia durante la
  visita: no existe una tabla donde registrar los descartes y la aplicación no modifica
  el esquema de la base.
- **Recurrentes.** La aplicación guarda la configuración en `public.recurrentes`
  (nombre, cuenta, categoría, tipo, monto, frecuencia, próxima fecha, descripción,
  `generar_automaticamente` y `activa`), pero **no genera movimientos**: eso depende de
  un proceso del backend. Las frecuencias admitidas son las del CHECK de la tabla:
  semanal, quincenal, mensual y anual.
- El gráfico muestra las 4 categorías con más gasto y agrupa el resto en «Otras», para
  que siga siendo legible en un iPhone.
