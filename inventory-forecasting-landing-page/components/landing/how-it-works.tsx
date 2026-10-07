import { BarChart3, ClipboardList, FileSpreadsheet, MessageCircle, SlidersHorizontal, Store } from 'lucide-react'
import { SectionHeading } from './section-heading'

const steps = [
  {
    icon: Store,
    title: 'Registre su negocio',
    body: 'Nombre, día de pedido y sus proveedores principales. Nada más.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Suba su Excel o CSV',
    body: 'Indique qué columna es la fecha, el producto y la cantidad. Le avisamos si hay semanas vacías, cantidades negativas o productos duplicados.',
  },
  {
    icon: ClipboardList,
    title: 'Ingrese su conteo',
    body: 'Lo que tiene hoy en bodega para los productos que va a pedir. Su conteo físico, no el inventario del sistema.',
  },
  {
    icon: BarChart3,
    title: 'Vea el pedido sugerido',
    body: 'Cantidad sugerida, un rango de mínimo a máximo y la explicación de cada número en una línea.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Ajuste y confirme',
    body: 'Cambie las cantidades que quiera y, si desea, deje la razón. Su criterio sigue mandando.',
  },
  {
    icon: MessageCircle,
    title: 'Envíelo al proveedor',
    body: 'Exporte el pedido como texto listo para WhatsApp o como PDF para compartir con su jefe o socios.',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="como-funciona-title"
          eyebrow="Cómo funciona"
          title="Se ancla en el pedido que ya iba a hacer. El mismo día, el mismo canal."
          description="No cambia su forma de trabajar: le entrega un número mejor justo antes de decidir."
        />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-4 bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                  <step.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
