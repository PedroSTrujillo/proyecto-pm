// La misma cuenta, los mismos umbrales y los mismos formatos de la aplicación
// (server/rotacion.js y public/js/util.js), para que la página muestre lo mismo que el reporte.

export const SEMANAS_SE_AGOTA = 2
export const SEMANAS_SOBRA = 12
export const SEMANAS_HISTORICO_MINIMO = 26

export type Estado = 'se_agota' | 'normal' | 'sobra' | 'sin_ventas'

export type Rotacion = {
  promedioSemanal: number
  semanasInventario: number | null
  estado: Estado
  sobra: boolean
}

export function calcularRotacion(vendido: number, semanasHistorico: number, existencias: number): Rotacion {
  if (!(vendido > 0) || !(semanasHistorico > 0)) {
    return { promedioSemanal: 0, semanasInventario: null, estado: 'sin_ventas', sobra: existencias > 0 }
  }
  const promedioSemanal = vendido / semanasHistorico
  const semanasInventario = Math.max(existencias, 0) / promedioSemanal
  const estado: Estado =
    semanasInventario < SEMANAS_SE_AGOTA ? 'se_agota' : semanasInventario > SEMANAS_SOBRA ? 'sobra' : 'normal'
  return { promedioSemanal, semanasInventario, estado, sobra: estado === 'sobra' }
}

// De menos a más semanas: lo que se agota primero va arriba. Sin ventas, al final.
export function ordenarPorSemanas<T extends Rotacion & { existencias: number }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => {
    if (a.semanasInventario === null && b.semanasInventario === null) return b.existencias - a.existencias
    if (a.semanasInventario === null) return 1
    if (b.semanasInventario === null) return -1
    return a.semanasInventario - b.semanasInventario || b.promedioSemanal - a.promedioSemanal
  })
}

const formatos = new Map<number, Intl.NumberFormat>()
function formato(max: number) {
  let f = formatos.get(max)
  if (!f) {
    f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: max })
    formatos.set(max, f)
  }
  return f
}

export function numero(n: number, max = 2) {
  return Number.isFinite(n) ? formato(max).format(n) : '—'
}

export function ventasSemana(n: number) {
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '0'
  return formato(n < 1 ? 2 : 1).format(n)
}

export function semanas(n: number | null) {
  if (n === null || !Number.isFinite(n)) return '—'
  return formato(n >= 100 ? 0 : 1).format(n)
}
