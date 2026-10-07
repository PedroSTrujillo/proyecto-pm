import { SectionHeading } from './section-heading'

const rows = [
  { product: 'Tocineta ahumada', unit: 'kg', suggested: 34, ordered: 30, sold: 33 },
  { product: 'Pan brioche x12', unit: 'paq', suggested: 60, ordered: 70, sold: 58 },
  { product: 'Queso cheddar', unit: 'cajas', suggested: 9, ordered: 8, sold: 10 },
  { product: 'Salsa de la casa', unit: 'gal', suggested: 14, ordered: 14, sold: 13 },
]

export function ResultsSection() {
  const suggestedError = rows.reduce((acc, r) => acc + Math.abs(r.suggested - r.sold) / r.sold, 0) / rows.length
  const orderedError = rows.reduce((acc, r) => acc + Math.abs(r.ordered - r.sold) / r.sold, 0) / rows.length

  return (
    <section aria-labelledby="resultados-title" className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-[1fr_1.3fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            id="resultados-title"
            eyebrow="Cómo le fue"
            title="Sugerido, pedido y vendido. Producto por producto."
            description="A la semana siguiente le mostramos qué tanto acertó la sugerencia comparada con el pedido que usted hizo. Sin adivinar si el número sirve: lo ve con sus propias ventas."
          />
          <dl className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-background p-4">
              <dt className="text-xs text-muted-foreground">Error de la sugerencia</dt>
              <dd className="mt-1 font-mono text-3xl font-semibold text-primary">
                {Math.round(suggestedError * 100)} %
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <dt className="text-xs text-muted-foreground">Error del pedido manual</dt>
              <dd className="mt-1 font-mono text-3xl font-semibold">{Math.round(orderedError * 100)} %</dd>
            </div>
          </dl>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-background">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">Comparación de cantidades sugeridas, pedidas y vendidas en la semana 39</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">
                  Producto
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  Sugerido
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  Pedido
                </th>
                <th scope="col" className="px-5 py-3 text-right font-medium">
                  Vendido
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const suggestedCloser = Math.abs(row.suggested - row.sold) <= Math.abs(row.ordered - row.sold)
                return (
                  <tr key={row.product}>
                    <th scope="row" className="px-5 py-4 text-left font-medium">
                      {row.product}
                    </th>
                    <td className="px-5 py-4 text-right font-mono">
                      <span className={suggestedCloser ? 'rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground' : ''}>
                        {row.suggested}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono">
                      <span className={!suggestedCloser ? 'rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground' : ''}>
                        {row.ordered}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono font-semibold">
                      {row.sold} <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Resaltado: la cantidad más cercana a lo vendido. Datos de ejemplo.
          </p>
        </div>
      </div>
    </section>
  )
}
