import { FileSpreadsheet, FileText, MessageCircle, Pencil } from 'lucide-react'
import { REPORTE_EJEMPLO, type ProductoEjemplo } from '@/lib/ejemplo'
import { numero } from '@/lib/rotacion'
import { cn } from '@/lib/utils'

// Lo que se ve al preparar un pedido desde lo sugerido (components/app/pedido-preparar.tsx): las
// líneas de un proveedor, para cuántos días alcanza cada producto, lo que sugiere SINESC y la
// cantidad final que decide la persona. Los datos son los de la ferretería de ejemplo
// (lib/ejemplo.ts); el sugerido es una versión simple del de la aplicación (cubrir 1 semana de
// entrega y 4 hasta el siguiente pedido, con margen), sin lo que sobra.
const CUBRIR = 5
const MARGEN = 1.3
const PROVEEDOR = 'Tornillería Central'
const CODIGOS = ['CIN-0003', 'TOR-0610', 'LIJ-0120', 'PVC-0250', 'MAN-1215']
// La persona ajustó una línea: la cinta la sube a cajas completas de 20.
const AJUSTES: Record<string, number> = { 'CIN-0003': 200 }

function sugerido(p: ProductoEjemplo) {
  if (p.sobra || p.promedioSemanal === 0) return 0
  return Math.max(0, Math.ceil(p.promedioSemanal * CUBRIR * MARGEN - p.existencias))
}

function alcanzaDias(p: ProductoEjemplo) {
  if (p.semanasInventario === null) return 'sin ventas'
  if (p.existencias <= 0) return 'agotado'
  return `${numero(Math.round(p.semanasInventario * 7))} días`
}

export function PedidoPreview() {
  const filas = REPORTE_EJEMPLO.filter((p) => CODIGOS.includes(p.codigo)).map((p) => {
    const s = sugerido(p)
    return { p, s, final: AJUSTES[p.codigo] ?? s }
  })
  const ajustadas = filas.filter((f) => f.final !== f.s).length
  const unidades = filas.reduce((t, f) => t + f.final, 0)
  const productos = filas.filter((f) => f.final > 0).length

  return (
    <figure className="relative min-w-0">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-secondary/80 [mask-image:radial-gradient(closest-side,black,transparent)]"
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_-30px_rgb(16_24_40/0.35)]">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Pedido 3 · {PROVEEDOR}</p>
            <p className="truncate text-xs text-muted-foreground">Preparado desde lo sugerido · entrega en 3 días hábiles</p>
          </div>
          <span className="shrink-0 rounded-full bg-ambar-fondo px-2.5 py-1 text-[0.7rem] font-semibold text-ambar-texto">Por aprobar</span>
        </div>

        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Ejemplo de pedido; deslice para ver todas las columnas">
          <table className="w-full text-sm sm:min-w-[460px]">
            <caption className="sr-only">Pedido de ejemplo con lo que sugiere SINESC y la cantidad final de cada producto</caption>
            <thead>
              <tr className="bg-muted text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 pl-5 pr-2 font-semibold">Producto</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Alcanza para</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">SINESC sugiere</th>
                <th scope="col" className="bg-primary px-3 py-2 text-right font-semibold text-primary-foreground">
                  <span className="inline-flex items-center gap-1"><Pencil className="size-3" aria-hidden="true" /> Cantidad<span className="hidden sm:inline"> final</span></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(({ p, s, final }) => {
                const seAgota = p.estado === 'se_agota'
                const tono = seAgota ? 'text-rojo' : p.sobra ? 'text-azul' : 'text-muted-foreground'
                return (
                  <tr key={p.codigo} className={cn(final !== s && 'bg-ambar-fondo/50')}>
                    <td className="py-2.5 pl-5 pr-2">
                      <span className="block font-mono text-[0.68rem] text-muted-foreground">{p.codigo}</span>
                      <span className="block max-w-36 truncate font-medium sm:max-w-48" title={p.nombre}>{p.nombre}</span>
                      <span className={cn('block text-[0.68rem] sm:hidden', tono)}>{alcanzaDias(p)}{seAgota ? ' · se agota' : p.sobra ? ' · sobra' : ''}</span>
                    </td>
                    <td className="hidden px-2 py-2.5 text-right leading-tight whitespace-nowrap sm:table-cell">
                      <span className={cn('tabular-nums font-semibold', seAgota && 'text-rojo', p.sobra && 'text-azul')}>{alcanzaDias(p)}</span>
                      {(seAgota || p.sobra) && <span className={cn('block text-[0.68rem]', tono)}>{seAgota ? 'se agota' : 'sobra'}</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="tabular-nums font-bold text-primary underline decoration-dotted underline-offset-4">{numero(s)}</span>
                      {s === 0 && <span className="block text-[0.68rem] whitespace-nowrap text-muted-foreground">alcanza</span>}
                    </td>
                    <td className="bg-secondary/60 px-3 py-2.5 text-right">
                      <span className="tabular-nums font-bold">{numero(final)}</span>
                      {final !== s && <span className="block text-[0.68rem] font-semibold text-ambar-texto">ajustada</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{numero(productos)} productos · {numero(unidades)} unidades</strong> · {ajustadas === 1 ? '1 línea ajustada' : `${ajustadas} líneas ajustadas`}
          </p>
          <div className="flex gap-1.5" aria-label="Orden de compra">
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
        Ejemplo de un pedido preparado desde lo sugerido: para cada producto, para cuántos días alcanza, lo que sugiere
        SINESC y la cantidad final que decide la persona. Al terminar, la orden de compra sale en PDF, Excel o WhatsApp.
      </figcaption>
    </figure>
  )
}
