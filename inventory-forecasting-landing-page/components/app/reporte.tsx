'use client'

// Reporte de rotación del paso 3 de un pedido: una fila por producto, de menos a más semanas.
// Es el instrumento de la prueba: muestra el mismo número que mide la hipótesis (semanas de
// inventario), sin cantidad sugerida.

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mesAnio, numero, plural, semanas, ventasSemana } from '@/lib/formato'
import type { Estado } from '@/lib/tipos'
import { Boton, ChipEstado, ESTADOS, Pildoras, claseEntrada } from './ui'

export type FilaReporte = {
  codigo: string
  nombre: string
  promedioSemanal: number
  promedioSimple?: number
  existencias: number
  semanasInventario: number | null
  estado: 'se_agota' | 'normal' | 'sobra' | 'sin_ventas'
  sobra: boolean
  senales: string[]
  pico?: { mes: string; vendido: number; contado: number } | null
  semanasProducto?: number
}

export type ReporteRotacion = {
  filas: FilaReporte[]
  resumen: { productos: number; seAgotan: number; sobran: number; filasVenta: number }
  periodo: { desde: string; hasta: string; semanas: number; totales: boolean }
  ejemplo: { codigo: string; promedioSemanal: number; existencias: number; semanasInventario: number } | null
  umbrales?: { seAgota: number; sobra: number }
  ajustes?: unknown
  avisos?: string[]
  hojasUsadas?: { archivo: string; hoja: string | null; uso: string; columnas: Record<string, string>; porMes: boolean }[]
  archivos?: string[]
  subidoEn?: string
}

// Avisos que cambian cómo se leen las semanas (archivo viejo, meses sin ventas): van a la vista.
const AVISO_IMPORTANTE = /^(Tus ventas llegan hasta|No hay ninguna venta entre)/

// Los campos del lector, como se los mostramos al usuario.
const NOMBRE_CAMPO: Record<string, string> = {
  codigo: 'código', nombre: 'nombre', fecha: 'fecha', cantidad: 'unidades vendidas', existencias: 'existencias',
  entrada: 'unidades que entraron', documento: 'tipo de documento', costo: 'costo unitario', costoTotal: 'valor del inventario',
  proveedor: 'proveedor',
}

export function estadoDeFila(f: FilaReporte): Estado {
  if (f.estado === 'se_agota') return 'agota'
  if (f.estado === 'sin_ventas') return 'sin_ventas'
  if (f.sobra) return 'sobra'
  return 'normal'
}

const SENALES: Record<string, (f: FilaReporte) => string> = {
  no_en_ventas: () => 'No aparece en las ventas',
  no_en_existencias: () => 'No aparece en las existencias (se tomó 0)',
  existencias_negativas: () => 'Existencias negativas en el archivo',
  devoluciones: () => 'Las devoluciones igualan o superan las ventas',
  pico_recortado: (f) => (f.pico ? `Mes fuera de lo normal: en ${mesAnio(f.pico.mes)} vendió ${numero(f.pico.vendido)} y se contaron ${numero(f.pico.contado)}` : 'Mes fuera de lo normal'),
  producto_nuevo: (f) => `Empezó a venderse hace poco: se cuentan ${numero(f.semanasProducto ?? 0)} semanas`,
}

const POR_PAGINA = 200
type Filtro = 'todos' | 'agota' | 'sobra'

export function Reporte({ r, compacto = false }: { r: ReporteRotacion; compacto?: boolean }) {
  const u = r.umbrales || { seAgota: 2, sobra: 12 }
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [mostrar, setMostrar] = useState(POR_PAGINA)
  const lista = useMemo(() => {
    const b = q.trim().toLowerCase()
    return r.filas.filter((f) => {
      const e = estadoDeFila(f)
      if (filtro === 'agota' && e !== 'agota') return false
      if (filtro === 'sobra' && !f.sobra) return false
      return !b || String(f.codigo).toLowerCase().includes(b) || String(f.nombre || '').toLowerCase().includes(b)
    })
  }, [r, q, filtro])
  const e = r.ejemplo
  const conAjustes = Boolean(r.ajustes) && !r.periodo.totales

  const importantes = (r.avisos || []).filter((a) => AVISO_IMPORTANTE.test(a))
  // Varias hojas o archivos con las mismas columnas se describen una sola vez.
  const usadas = [...new Map((r.hojasUsadas || []).map((h) => [`${h.uso}|${h.porMes}|${JSON.stringify(h.columnas)}`, h])).values()]
  const repetidas = (r.hojasUsadas || []).length - usadas.length

  return (
    <div className="flex flex-col gap-4">
      {importantes.map((a) => (
        <p key={a} className="rounded-xl border border-ambar-borde bg-ambar-fondo px-4 py-3 text-[0.95rem] text-ambar-texto">{a}</p>
      ))}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <div className="rounded-2xl border border-border bg-card p-4"><strong className="font-display text-[1.8rem] tabular-nums">{numero(r.resumen.productos)}</strong><span className="block text-sm text-muted-foreground">productos</span></div>
        <div className="rounded-2xl border border-rojo-borde bg-rojo-fondo p-4"><strong className="font-display text-[1.8rem] text-rojo tabular-nums">{numero(r.resumen.seAgotan)}</strong><span className="block text-sm text-rojo-texto">se agotan en menos de {u.seAgota} semanas</span></div>
        <div className="rounded-2xl border border-azul-borde bg-azul-fondo p-4"><strong className="font-display text-[1.8rem] text-azul tabular-nums">{numero(r.resumen.sobran)}</strong><span className="block text-sm text-azul-texto">sobran: más de {u.sobra} semanas o sin ventas</span></div>
      </div>

      <details className="rounded-xl border border-border bg-card px-4 py-3">
        <summary className="cursor-pointer font-semibold text-primary">¿De dónde sale el número?</summary>
        <p className="mt-2"><strong>Semanas de inventario = existencias ÷ ventas por semana.</strong>{e ? ` Por ejemplo, ${e.codigo} vende ${ventasSemana(e.promedioSemanal)} por semana y tienes ${numero(e.existencias)}: te alcanza para ${semanas(e.semanasInventario)} semanas.` : ''}</p>
        <p className="mt-1 text-[0.93rem] text-muted-foreground">
          {conAjustes
            ? 'Las ventas por semana salen de tu archivo: lo de los últimos 3 meses cuenta doble, un mes fuera de lo normal no infla el promedio y un producto nuevo se mide desde su primera venta.'
            : `Las ventas por semana son todo lo vendido en tu archivo dividido entre sus ${semanas(r.periodo.semanas)} semanas.`}
        </p>
      </details>

      {!compacto && (r.hojasUsadas?.length || r.avisos?.length) ? (
        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer font-semibold">Qué leímos de tu archivo{r.avisos?.length ? ' (hay notas para revisar)' : ''}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.93rem]">
            <li>{plural(r.resumen.filasVenta, 'fila de ventas', 'filas de ventas')} y {plural(r.resumen.productos, 'producto', 'productos')}{r.archivos?.length ? ` (${r.archivos.join(', ')})` : ''}.</li>
            {usadas.map((h, i) => (
              <li key={i}>{h.uso === 'ventas' ? 'Ventas' : h.uso === 'existencias' ? 'Existencias' : 'Ventas y existencias'}{repetidas ? ' (igual en todos los archivos)' : h.hoja ? ` — hoja "${h.hoja}"` : ''}{h.porMes ? ' (una columna por mes)' : ''}: {Object.entries(h.columnas).map(([k, v]) => `${NOMBRE_CAMPO[k] || k} en ${v}`).join('; ')}.</li>
            ))}
            {(r.avisos || []).filter((a) => !AVISO_IMPORTANTE.test(a)).map((a, i) => <li key={`a${i}`}>{a}</li>)}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar por código o nombre</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(claseEntrada, 'pl-10')} type="search" placeholder="Buscar por código o nombre" value={q} onChange={(ev) => { setQ(ev.target.value); setMostrar(POR_PAGINA) }} />
        </label>
        <Pildoras<Filtro>
          etiqueta="Filtrar productos"
          valor={filtro}
          onCambio={(v) => { setFiltro(v); setMostrar(POR_PAGINA) }}
          opciones={[
            { id: 'todos', texto: 'Todos' },
            { id: 'agota', texto: `Se agotan (menos de ${u.seAgota} semanas)` },
            { id: 'sobra', texto: 'Sobran' },
          ]}
        />
      </div>

      <div className={cn('overflow-auto rounded-2xl border border-border bg-card', compacto && 'max-h-[28rem]')}>
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-left text-[0.82rem] text-muted-foreground">
              <th scope="col" className="border-b border-border px-3 py-2.5 font-semibold">Código</th>
              <th scope="col" className="border-b border-border px-3 py-2.5 font-semibold">Producto</th>
              <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Ventas/semana</th>
              <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Existencias</th>
              <th scope="col" className="border-b border-border px-3 py-2.5 text-right font-semibold">Semanas de inventario</th>
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, mostrar).map((f) => {
              const est = estadoDeFila(f)
              return (
                <tr key={f.codigo} className={cn(est === 'agota' && 'bg-rojo-fondo/60', f.sobra && 'bg-azul-fondo/50')}>
                  <td className="border-b border-[#f0f1ee] px-3 py-2.5 text-[0.9rem] text-muted-foreground">{f.codigo}</td>
                  <td className="border-b border-[#f0f1ee] px-3 py-2.5">
                    {f.nombre || <span className="text-muted-foreground">Sin nombre en el archivo</span>}
                    {f.senales.map((s) => <span key={s} className="block text-[0.82rem] text-muted-foreground">{(SENALES[s] || (() => s))(f)}</span>)}
                  </td>
                  <td className="border-b border-[#f0f1ee] px-3 py-2.5 text-right tabular-nums" title={f.promedioSimple !== undefined && f.estado !== 'sin_ventas' ? `Sin ajustes: ${ventasSemana(f.promedioSimple)} por semana` : undefined}>
                    {f.estado === 'sin_ventas' ? '0' : ventasSemana(f.promedioSemanal)}
                  </td>
                  <td className="border-b border-[#f0f1ee] px-3 py-2.5 text-right tabular-nums">{numero(f.existencias)}</td>
                  <td className="border-b border-[#f0f1ee] px-3 py-2.5 text-right whitespace-nowrap">
                    {f.semanasInventario === null ? <span className="text-muted-foreground">Sin ventas en el periodo</span> : <strong className={cn('font-display text-lg tabular-nums', ESTADOS[est].numero)}>{semanas(f.semanasInventario)}</strong>}
                    {(est === 'agota' || f.sobra) && <span className="ml-2 align-middle"><ChipEstado estado={est === 'sin_ventas' ? 'sobra' : est} /></span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!lista.length && <p className="px-3 py-8 text-center text-muted-foreground">No hay productos con ese filtro.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{lista.length !== r.filas.length ? `Mostrando ${numero(lista.length)} de ${numero(r.filas.length)} productos.` : ''}</span>
        {lista.length > mostrar && <Boton tamano="chico" onClick={() => setMostrar((m) => m + POR_PAGINA)}>Mostrar {Math.min(POR_PAGINA, lista.length - mostrar)} más (quedan {numero(lista.length - mostrar)})</Boton>}
      </div>
    </div>
  )
}
