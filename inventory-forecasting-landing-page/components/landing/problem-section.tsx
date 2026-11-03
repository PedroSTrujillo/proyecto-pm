import { PackageMinus, PackagePlus } from 'lucide-react'
import { SectionHeading } from './section-heading'

const costs = [
  {
    icon: PackageMinus,
    title: 'Quedarse corto',
    body: 'La empresa se entera de que algo se acabó cuando un cliente lo pide, y lo resuelve con pedidos de urgencia.',
  },
  {
    icon: PackagePlus,
    title: 'Comprar de más',
    body: 'Se repite el pedido anterior y la bodega se llena de lo que casi no se vende. Es dinero quieto, y aparece en el siguiente inventario.',
  },
]

export function ProblemSection() {
  return (
    <section aria-labelledby="problema-title" className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-2 lg:gap-16">
        <SectionHeading
          id="problema-title"
          eyebrow="El problema"
          title="El pedido se arma a ojo, aunque los datos ya están en su programa contable."
          description="Convertir ventas y existencias en un pedido toma horas de Excel. Por eso, en catálogos grandes, la mayoría de los productos se pide igual que la vez anterior."
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
          <blockquote className="rounded-xl border-l-4 border-primary bg-secondary p-5">
            <p className="text-pretty leading-relaxed">
              La información sale del software contable, se exporta a Excel y depende de que una persona la revise,
              la filtre y la analice a mano. Lo que más se necesita son alertas a tiempo, en lugar de informes que
              alguien tenga que descargar.
            </p>
            <footer className="mt-3 text-sm text-muted-foreground">
              Asesora de reabastecimiento de pequeñas empresas, en una de nuestras entrevistas
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  )
}
