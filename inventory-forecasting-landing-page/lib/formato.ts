// Números, plata y fechas en español de Colombia.

const formatos = new Map<string, Intl.NumberFormat>()
function formato(min: number, max: number) {
  const k = `${min}-${max}`
  if (!formatos.has(k)) formatos.set(k, new Intl.NumberFormat('es-CO', { minimumFractionDigits: min, maximumFractionDigits: max }))
  return formatos.get(k)!
}

export function numero(n: number | null | undefined, max = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return formato(0, max).format(n)
}

export function ventasSemana(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  if (n === 0) return '0'
  return formato(0, n < 1 ? 2 : n < 10 ? 1 : 0).format(n)
}

export function semanas(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  return formato(0, n >= 10 ? 0 : 1).format(n)
}

// Para cuánto alcanza un inventario. Menos de una semana se dice en días: "0 semanas" no dice nada.
export function alcancePartes(n: number | null | undefined): { valor: string; unidad: string } {
  if (n === null || n === undefined) return { valor: '—', unidad: '' }
  if (n < 1) {
    const d = n <= 0 ? 0 : Math.max(1, Math.round(n * 7))
    return { valor: String(d), unidad: d === 1 ? 'día' : 'días' }
  }
  return { valor: semanas(n), unidad: semanas(n) === '1' ? 'semana' : 'semanas' }
}

// "3 días", "2,4 sem" (corto) o "2,4 semanas".
export function alcance(n: number | null | undefined, corto = false) {
  const p = alcancePartes(n)
  if (!p.unidad) return p.valor
  return `${p.valor} ${corto && p.unidad.startsWith('semana') ? 'sem' : p.unidad}`
}

// $84,6 M · $412 mil · $950
export function plata(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  const a = Math.abs(n)
  if (a >= 1e9) return `$${formato(0, 2).format(n / 1e9)} mil M`
  if (a >= 1e6) return `$${formato(0, 1).format(n / 1e6)} M`
  if (a >= 1e4) return `$${formato(0, 0).format(Math.round(n / 1000))} mil`
  return `$${formato(0, 0).format(n)}`
}

export function porcentaje(n: number | null | undefined, signo = false) {
  if (n === null || n === undefined) return '—'
  const v = Math.round(n * 100)
  return `${signo && v > 0 ? '+' : ''}${formato(0, 0).format(v)} %`
}

const fmtFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' })
const fmtFechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtFechaHora = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Bogota' })
const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' })
const fmtMesAnio = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// "2026-10-10" o un instante ISO
function aFecha(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v)
}

export function fecha(v: string | null | undefined) {
  return v ? fmtFecha.format(aFecha(v)) : '—'
}
// "2026-01-15" (un día del calendario, sin hora).
export function dia(v: string | null | undefined) {
  return v ? fmtFecha.format(aFecha(v)) : '—'
}
export function fechaCorta(v: string | null | undefined) {
  return v ? fmtFechaCorta.format(aFecha(v)).replace('.', '') : '—'
}
export function fechaHora(v: string | null | undefined) {
  return v ? fmtFechaHora.format(new Date(v)) : '—'
}
export function mesCorto(v: string) {
  return fmtMes.format(aFecha(v)).replace('.', '')
}
// "2026-05" → "mayo de 2026"
export function mesAnio(v: string) {
  return fmtMesAnio.format(new Date(`${v}-15T12:00:00Z`))
}

// Una duración en semanas dicha como se habla: "media semana", "1 semana", "2,5 semanas".
export function duracion(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  if (n === 0.5) return 'media semana'
  if (n === 1) return '1 semana'
  return `${semanas(n)} semanas`
}

export function plural(n: number, uno: string, varios: string) {
  return `${numero(n)} ${n === 1 ? uno : varios}`
}

// Misma clave de comparación que usa el servidor (server/valores.js).
export function claveCodigo(v: unknown) {
  const t = String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t
}

// Suma días a "YYYY-MM-DD".
export function sumarDias(v: string, dias: number) {
  const d = aFecha(v)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
