import { productoEjemplo } from '@/lib/ejemplo'
import { numero, semanas } from '@/lib/rotacion'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'

// Lista inicial: la de la plantilla de pedido de la aplicación. Lista final: después de ver el reporte.
const lineas = [
  { codigo: 'CIN-0003', antes: 100, despues: 150 },
  { codigo: 'TOR-0610', antes: 60, despues: 80 },
  { codigo: 'LIJ-0120', antes: 100, despues: 100 },
  { codigo: 'PVC-0250', antes: 12, despues: 12 },
  { codigo: 'MAN-1215', antes: 10, despues: null },
  { codigo: 'BRO-0002', antes: null, despues: 12 },
]

type Cambio = 'agregada' | 'quitada' | 'cambiada' | 'igual'

const filas = lineas.map((l) => {
  const cambio: Cambio =
    l.antes === null ? 'agregada' : l.despues === null ? 'quitada' : l.antes !== l.despues ? 'cambiada' : 'igual'
  return { ...l, cambio, producto: productoEjemplo(l.codigo) }
})

const ETIQUETAS: Record<Cambio, { texto: string; clase: string }> = {
  agregada: { texto: 'Agregada', clase: 'bg-verde-fondo text-verde' },
  quitada: { texto: 'Quitada', clase: 'bg-rojo-fondo text-rojo' },
  cambiada: { texto: 'Cantidad distinta', clase: 'bg-ambar-fondo text-ambar' },
  igual: { texto: 'Igual', clase: 'bg-muted text-muted-foreground' },
}

export function ComparisonSection() {
  const cuenta = (c: Cambio) => filas.filter((f) => f.cambio === c).length
  const agregadas = cuenta('agregada')
  const quitadas = cuenta('quitada')
  const cambiadas = cuenta('cambiada')
  const total = agregadas + quitadas + cambiadas

  return (
    <section aria-labelledby="comparacion-title" className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-[1fr_1.3fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            id="comparacion-title"
            eyebrow="Al terminar el pedido"
            title="Tu lista de antes y la de después, línea por línea."
            description="Al final ves qué agregaste, qué quitaste y qué cantidades moviste después de mirar la rotación. Y te preguntamos por qué. Esa respuesta nos dice si el reporte te está sirviendo."
          />
          <dl className="mt-8 grid grid-cols-2 gap-4">
            <Cifra valor={agregadas} texto={agregadas === 1 ? 'línea agregada' : 'líneas agregadas'} />
            <Cifra valor={quitadas} texto={quitadas === 1 ? 'línea quitada' : 'líneas quitadas'} />
            <Cifra valor={cambiadas} texto="con cantidad distinta" />
            <Cifra valor={total} texto="líneas cambiadas en total" destacada />
          </dl>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Comparación de la lista inicial y la final; desliza para ver todas las columnas">
            <table className="w-full text-sm sm:min-w-[560px]">
              <caption className="sr-only">
                Comparación entre la lista inicial y la lista final de un pedido de ejemplo
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-3 pl-4 pr-2 font-semibold sm:px-5">
                    Producto
                  </th>
                  <th scope="col" className="px-2 py-3 text-right font-semibold sm:px-3">
                    <span className="sm:hidden">Semanas</span>
                    <span className="hidden sm:inline">Semanas de inventario</span>
                  </th>
                  <th scope="col" className="px-2 py-3 text-right font-semibold sm:px-3">
                    Ibas a pedir
                  </th>
                  <th scope="col" className="py-3 pl-2 pr-4 text-right font-semibold sm:px-3">
                    Vas a pedir
                  </th>
                  <th scope="col" className="hidden px-5 py-3 font-semibold sm:table-cell">
                    Cambio
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => {
                  const p = f.producto
                  return (
                    <tr key={f.codigo}>
                      <th scope="row" className="py-3 pl-4 pr-2 text-left font-medium sm:px-5">
                        <span className="block font-mono text-[0.7rem] font-normal text-muted-foreground">
                          {f.codigo}
                        </span>
                        {p.nombre}
                        <EtiquetaCambio cambio={f.cambio} className="mt-1.5 block w-fit sm:hidden" />
                      </th>
                      <td
                        className={cn(
                          'px-2 py-3 text-right tabular-nums sm:px-3',
                          p.estado === 'se_agota' && 'font-bold text-rojo',
                          p.sobra && 'text-azul',
                        )}
                      >
                        {p.semanasInventario === null ? 'sin ventas' : semanas(p.semanasInventario)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-muted-foreground sm:px-3">
                        {f.antes === null ? 'nuevo' : numero(f.antes)}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right font-semibold tabular-nums sm:px-3">
                        {f.despues === null ? '—' : numero(f.despues)}
                      </td>
                      <td className="hidden px-5 py-3 sm:table-cell">
                        <EtiquetaCambio cambio={f.cambio} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-card px-5 py-4">
            <p className="text-sm font-semibold">¿Por qué cambiaste lo que cambiaste?</p>
            <p className="mt-2 rounded-lg border-l-4 border-primary bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
              {
                '"Subí la cinta y los tornillos porque no me alcanzaban ni para dos semanas. Quité la manguera, que tengo para más de nueve meses. Las brochas las agregué porque en diciembre se pinta mucho."'
              }
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Datos de ejemplo.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function EtiquetaCambio({ cambio, className }: { cambio: Cambio; className?: string }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold',
        ETIQUETAS[cambio].clase,
        className,
      )}
    >
      {ETIQUETAS[cambio].texto}
    </span>
  )
}

function Cifra({ valor, texto, destacada }: { valor: number; texto: string; destacada?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse rounded-xl border p-4',
        destacada ? 'border-[#b7e2c8] bg-verde-fondo' : 'border-border bg-background',
      )}
    >
      <dt className="text-xs text-muted-foreground">{texto}</dt>
      <dd className={cn('text-3xl font-bold tabular-nums', destacada && 'text-verde')}>{valor}</dd>
    </div>
  )
}
