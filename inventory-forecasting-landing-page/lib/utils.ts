import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Los tamaños de letra propios de la app (globals.css) tienen que contar como tamaño: si no,
// twMerge cree que text-nota es un color y lo borra al lado de text-muted-foreground.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ['etiqueta', 'nota', 'chico', 'cuerpo'] } } })

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
