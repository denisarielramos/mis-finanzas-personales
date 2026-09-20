import {
  Baby,
  Banknote,
  Book,
  Briefcase,
  Bus,
  Car,
  Coffee,
  CreditCard,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  Heart,
  House,
  Landmark,
  LineChart,
  Music,
  Package,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Catálogo reducido de iconos Lucide.
 * Se guarda el NOMBRE del icono en la columna `icono` de la base.
 */
export const ICONOS: Record<string, LucideIcon> = {
  tag: Tag,
  wallet: Wallet,
  landmark: Landmark,
  banknote: Banknote,
  'piggy-bank': PiggyBank,
  'credit-card': CreditCard,
  'line-chart': LineChart,
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  coffee: Coffee,
  house: House,
  car: Car,
  fuel: Fuel,
  bus: Bus,
  plane: Plane,
  heart: Heart,
  stethoscope: Stethoscope,
  'graduation-cap': GraduationCap,
  book: Book,
  dumbbell: Dumbbell,
  shirt: Shirt,
  gift: Gift,
  film: Film,
  music: Music,
  smartphone: Smartphone,
  wifi: Wifi,
  zap: Zap,
  wrench: Wrench,
  briefcase: Briefcase,
  receipt: Receipt,
  package: Package,
  baby: Baby,
  'paw-print': PawPrint,
  sparkles: Sparkles,
}

export const NOMBRES_ICONOS = Object.keys(ICONOS)

/** Devuelve el componente de icono guardado en la base, con respaldo. */
export function iconoPorNombre(nombre: string | null | undefined, respaldo: LucideIcon = Tag) {
  if (!nombre) return respaldo
  return ICONOS[nombre] ?? respaldo
}

interface Props {
  valor: string | null
  onCambio: (nombre: string) => void
}

export function SelectorIcono({ valor, onCambio }: Props) {
  return (
    <div className="selector-iconos" role="group" aria-label="Icono">
      {NOMBRES_ICONOS.map((nombre) => {
        const Icono = ICONOS[nombre]
        return (
          <button
            key={nombre}
            type="button"
            className="selector-iconos__opcion"
            aria-pressed={valor === nombre}
            aria-label={`Icono ${nombre}`}
            onClick={() => onCambio(nombre)}
          >
            <Icono size={20} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

export const COLORES = [
  '#0b1220',
  '#1d4ed8',
  '#0284c7',
  '#059669',
  '#65a30d',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
  '#7c3aed',
  '#4b5563',
  '#0f766e',
]

export function SelectorColor({
  valor,
  onCambio,
}: {
  valor: string | null
  onCambio: (color: string) => void
}) {
  return (
    <div className="selector-colores" role="group" aria-label="Color">
      {COLORES.map((color) => (
        <button
          key={color}
          type="button"
          className="selector-colores__opcion"
          aria-pressed={valor === color}
          aria-label={`Color ${color}`}
          onClick={() => onCambio(color)}
        >
          <span style={{ background: color }} />
        </button>
      ))}
    </div>
  )
}
