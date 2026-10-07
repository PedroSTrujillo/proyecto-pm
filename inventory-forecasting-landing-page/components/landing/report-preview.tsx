import { Info } from 'lucide-react'
import { REPORTE_EJEMPLO, SEMANAS_EJEMPLO, productoEjemplo, type ProductoEjemplo } from '@/lib/ejemplo'
import { numero, semanas, ventasSemana } from '@/lib/rotacion'
import { cn } from '@/lib/utils'

export function ReportPreview() {
  const seAgotan = REPORTE_EJEMPLO.filter((p) => p.estado === 'se_agota').length
  const sobran = REPORTE_EJEMPLO.filter((p) => p.sobra).length
  const ejemplo = productoEjemplo('TOR-0610')

  return (
    <figure className="relative min-w-0">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-secondary/80 [mask-image:radial-gradient(closest-side,black,transparent)]"
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_-30px_rgb(16_24_40/0.35)]">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Tu reporte de rotación</p>
            <p className="truncate text-xs text-muted-foreground">
              ventas-y-existencias.xlsx · {SEMANAS_EJEMPLO} semanas de ventas
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            Paso 3 de 5
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 py-4">
          <Cifra valor={REPORTE_EJEMPLO.length} texto="productos" />
          <Cifra valor={seAgotan} texto="se agotan" tono="rojo" />
          <Cifra valor={sobran} texto="sobran" tono="azul" />
        </div>

        <table className="w-full table-fixed border-t border-border text-sm">
          <caption className="sr-only">Productos de ejemplo ordenados por semanas de inventario</caption>
          <thead>
            <tr className="bg-muted text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pl-5 pr-2 font-semibold">
                Producto
              </th>
              <th scope="col" className="hidden w-20 whitespace-nowrap px-2 py-2 text-right font-semibold sm:table-cell">
                Por semana
              </th>
              <th scope="col" className="hidden w-[5.25rem] px-2 py-2 text-right font-semibold sm:table-cell">
                Existencias
              </th>
              <th scope="col" className="w-32 py-2 pl-2 pr-5 text-right font-semibold">
                Semanas
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {REPORTE_EJEMPLO.map((p) => (
              <Fila key={p.codigo} p={p} />
            ))}
          </tbody>
        </table>

        <div className="border-t border-border px-5 py-4">
          <p className="flex gap-2 rounded-lg border border-primary/20 bg-secondary px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold">¿De dónde sale el número?</strong> {ejemplo.codigo} vendió{' '}
              {numero(ejemplo.vendido)} cajas en {SEMANAS_EJEMPLO} semanas: {ventasSemana(ejemplo.promedioSemanal)} por
              semana. Con {numero(ejemplo.existencias)} en existencias, te alcanza para{' '}
              {semanas(ejemplo.semanasInventario)} semanas.
            </span>
          </p>
        </div>
      </div>
      <figcaption className="sr-only">
        Ejemplo de un reporte de rotación: los productos van de menos a más semanas de inventario, con lo que se agota
        en rojo y lo que sobra en azul.
      </figcaption>
    </figure>
  )
}

function Fila({ p }: { p: ProductoEjemplo }) {
  const seAgota = p.estado === 'se_agota'
  return (
    <tr className={cn(seAgota && 'bg-rojo-fondo', p.sobra && 'bg-azul-fondo')}>
      <td className="py-2.5 pl-5 pr-2">
        <span className="block font-mono text-[0.7rem] text-muted-foreground">{p.codigo}</span>
        <span className="block truncate font-medium" title={p.nombre}>
          {p.nombre}
        </span>
      </td>
      <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{ventasSemana(p.promedioSemanal)}</td>
      <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{numero(p.existencias)}</td>
      <td className="py-2.5 pl-2 pr-5 text-right">
        <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
          {p.semanasInventario === null ? (
            <span className="text-xs italic text-muted-foreground">Sin ventas</span>
          ) : (
            <span className={cn('tabular-nums', seAgota && 'font-bold text-rojo', p.sobra && 'text-azul')}>
              {semanas(p.semanasInventario)}
            </span>
          )}
          {seAgota ? <Etiqueta tono="rojo">Se agota</Etiqueta> : null}
          {p.sobra ? <Etiqueta tono="azul">Sobra</Etiqueta> : null}
        </span>
      </td>
    </tr>
  )
}

function Etiqueta({ tono, children }: { tono: 'rojo' | 'azul'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-px text-[0.7rem] font-bold text-white',
        tono === 'rojo' ? 'bg-rojo' : 'bg-azul',
      )}
    >
      {children}
    </span>
  )
}

function Cifra({ valor, texto, tono }: { valor: number; texto: string; tono?: 'rojo' | 'azul' }) {
  return (
    <p
      className={cn(
        'rounded-lg border px-3 py-2',
        tono === 'rojo' && 'border-rojo-borde bg-rojo-fondo',
        tono === 'azul' && 'border-azul-borde bg-azul-fondo',
        !tono && 'border-border bg-card',
      )}
    >
      <strong
        className={cn(
          'block text-xl font-bold leading-tight tabular-nums',
          tono === 'rojo' && 'text-rojo',
          tono === 'azul' && 'text-azul',
        )}
      >
        {valor}
      </strong>
      <span className="text-xs text-muted-foreground">{texto}</span>
    </p>
  )
}
