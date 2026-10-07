import { PackageMinus, PackagePlus } from 'lucide-react'
import { SectionHeading } from './section-heading'

const costs = [
  {
    icon: PackageMinus,
    title: 'Quedarse corto',
    body: 'El pedido falla cada mes y se parcha con pedidos extra, llamadas urgentes y clientes que se van sin su producto.',
  },
  {
    icon: PackagePlus,
    title: 'Comprar de más',
    body: 'El proveedor ofrece descuento por volumen, pero nadie sabe si vale la pena llevar más, sobre todo en productos que no rotan igual.',
  },
]

export function ProblemSection() {
  return (
    <section aria-labelledby="problema-title" className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-2 lg:gap-16">
        <SectionHeading
          id="problema-title"
          eyebrow="El problema"
          title="Los datos para pedir mejor ya existen. Solo llegan tarde."
          description="Sus ventas están en el POS, en el software contable o en las facturas electrónicas. Pero nadie las convierte a tiempo en un número para decidir, y el pedido se sigue armando con experiencia, conteos a mano e informes que llegan cuando ya pasó la semana."
        />
        <div className="flex flex-col gap-4">
          {costs.map((cost) => (
            <div key={cost.title} className="flex gap-4 rounded-xl border border-border bg-background p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <cost.icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold">{cost.title}</h3>
                <p className="mt-1 leading-relaxed text-muted-foreground">{cost.body}</p>
              </div>
            </div>
          ))}
          <blockquote className="rounded-xl border-l-4 border-highlight bg-highlight/15 p-5">
            <p className="text-pretty leading-relaxed">
              {
                '"La tocineta no va en todas las hamburguesas, así que no sabemos cuánta vamos a usar ni si nos conviene el descuento."'
              }
            </p>
            <footer className="mt-3 text-sm text-muted-foreground">Dueño de una cadena de hamburguesas</footer>
          </blockquote>
        </div>
      </div>
    </section>
  )
}
