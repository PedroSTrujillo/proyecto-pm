import { Check, FileSpreadsheet, FileText, MessageCircle, Pencil } from 'lucide-react'
import { REPORTE_EJEMPLO, SEMANAS_EJEMPLO, type ProductoEjemplo } from '@/lib/ejemplo'
import { numero, semanas } from '@/lib/rotacion'
import { cn } from '@/lib/utils'

// Lo que se ve en el paso 4 de la aplicación (components/app/pedido-flujo.tsx): cuánto te alcanza,
// lo que ibas a pedir, lo que sugiere SINESC y la cantidad final que decides. Los datos son los de la
// ferretería de ejemplo (lib/ejemplo.ts); el sugerido es una versión simple del de la aplicación
// (cubrir 1 semana de entrega y 4 hasta el siguiente pedido, con margen), sin lo que sobra.
const CUBRIR = 5
const MARGEN = 1.3

// Lo que "iba a pedir" el usuario de ejemplo y con cuánto se quedó.
const LISTA: Record<string, { ibas: number; final: number }> = {
  'CIN-0003': { ibas: 60, final: 170 },
  'TOR-0610': { ibas: 40, final: 60 },
  'LIJ-0120': { ibas: 100, final: 100 },
  'PVC-0250': { ibas: 20, final: 0 },
  'MAN-1215': { ibas: 20, final: 0 },
}

function sugerido(p: ProductoEjemplo) {
  if (p.sobra || p.promedioSemanal === 0) return 0
  return Math.max(0, Math.ceil(p.promedioSemanal * CUBRIR * MARGEN - p.existencias))
}

export function PedidoPreview() {
  const filas = REPORTE_EJEMPLO.filter((p) => LISTA[p.codigo])
  const cambiadas = filas.filter((p) => LISTA[p.codigo].final !== LISTA[p.codigo].ibas).length
  const unidades = filas.reduce((t, p) => t + LISTA[p.codigo].final, 0)
  const productos = filas.filter((p) => LISTA[p.codigo].final > 0).length

  return (
    <figure className="relative min-w-0">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-secondary/80 [mask-image:radial-gradient(closest-side,black,transparent)]"
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_-30px_rgb(16_24_40/0.35)]">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Pedido 3 · Tu lista final</p>
            <p className="truncate text-xs text-muted-foreground">ventas-y-existencias.xlsx · {SEMANAS_EJEMPLO} semanas de ventas</p>
          </div>
          <ol className="flex shrink-0 items-center gap-1" aria-label="Paso 4 de 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <li
                key={n}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-[0.68rem] font-bold',
                  n < 4 && 'bg-secondary text-primary',
                  n === 4 && 'bg-primary text-primary-foreground',
                  n > 4 && 'bg-muted text-muted-foreground',
                )}
              >
                {n < 4 ? <Check className="size-3.5" aria-hidden="true" /> : n}
              </li>
            ))}
          </ol>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[520px]">
            <caption className="sr-only">Lista final de ejemplo con lo que sugiere SINESC al lado de cada producto</caption>
            <thead>
              <tr className="bg-muted text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pl-5 pr-2 font-semibold">Producto</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Te alcanza</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Ibas a pedir</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">SINESC sugiere</th>
                <th scope="col" className="bg-primary px-3 py-2 text-right font-semibold text-primary-foreground">
                  <span className="inline-flex items-center gap-1"><Pencil className="size-3" aria-hidden="true" /> Tu cantidad<span className="hidden sm:inline"> final</span></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((p) => {
                const { ibas, final } = LISTA[p.codigo]
                const s = sugerido(p)
                const seAgota = p.estado === 'se_agota'
                return (
                  <tr key={p.codigo} className={cn(final !== ibas && 'bg-ambar-fondo/50')}>
                    <td className="py-2.5 pl-5 pr-2">
                      <span className="block font-mono text-[0.68rem] text-muted-foreground">{p.codigo}</span>
                      <span className="block max-w-32 truncate font-medium sm:max-w-44" title={p.nombre}>{p.nombre}</span>
                      <span className={cn('block text-[0.68rem] sm:hidden', seAgota ? 'text-rojo' : p.sobra ? 'text-azul' : 'text-muted-foreground')}>Te alcanza {semanas(p.semanasInventario)} sem{seAgota ? ' · se agota' : p.sobra ? ' · sobra' : ''}</span>
                    </td>
                    <td className="hidden px-2 py-2.5 text-right leading-tight whitespace-nowrap sm:table-cell">
                      <span className={cn('tabular-nums font-semibold', seAgota && 'text-rojo', p.sobra && 'text-azul')}>{semanas(p.semanasInventario)} sem</span>
                      {(seAgota || p.sobra) && <span className={cn('block text-[0.68rem]', seAgota ? 'text-rojo' : 'text-azul')}>{seAgota ? 'se agota' : 'sobra'}</span>}
                    </td>
                    <td className="hidden px-2 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">{numero(ibas)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="tabular-nums font-bold text-primary underline decoration-dotted underline-offset-4">{numero(s)}</span>
                      {s === 0 && <span className="block text-[0.68rem] whitespace-nowrap text-muted-foreground">te alcanza</span>}
                    </td>
                    <td className="bg-secondary/60 px-3 py-2.5 text-right">
                      <span className="tabular-nums font-bold">{numero(final)}</span>
                      {final !== ibas && <span className="block text-[0.68rem] font-semibold text-ambar-texto">{final > ibas ? `+${numero(final - ibas)}` : numero(final - ibas)}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{numero(productos)} productos · {numero(unidades)} unidades</strong> · {cambiadas} líneas cambiadas
          </p>
          <div className="flex gap-1.5" aria-label="Tu orden de compra">
            {[
              { icono: FileText, texto: 'PDF' },
              { icono: FileSpreadsheet, texto: 'Excel' },
              { icono: MessageCircle, texto: 'WhatsApp' },
            ].map(({ icono: Icono, texto }) => (
              <span key={texto} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.7rem] font-semibold">
                <Icono className="size-3" aria-hidden="true" /> {texto}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        Ejemplo del paso 4: para cada producto, cuánto te alcanza, lo que ibas a pedir, lo que sugiere SINESC y la
        cantidad final que decides. Al terminar, la orden de compra sale en PDF, Excel o WhatsApp.
      </figcaption>
    </figure>
  )
}
