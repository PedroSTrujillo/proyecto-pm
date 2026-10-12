import { BarChart3, ClipboardList, Clock, FileSpreadsheet, MessageCircle, SlidersHorizontal } from 'lucide-react'
import { SectionHeading } from './section-heading'

// Los mismos 5 pasos de la aplicación, con los mismos nombres.
const steps = [
  {
    icon: ClipboardList,
    title: 'Anota lo que ibas a pedir',
    body: 'Antes de ver el reporte, escribe tu pedido como lo harías hoy. Puedes pegar filas desde Excel o importar tu archivo de pedido.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Sube el export de ventas y existencias',
    body: 'El último año de ventas y lo que tienes hoy, tal como sale de Siigo, Alegra, World Office, Helisa u otro programa. Si llevas el inventario en Excel, usas nuestra plantilla.',
  },
  {
    icon: BarChart3,
    title: 'Mira la rotación',
    body: 'Cada producto con sus semanas de inventario. Lo que se agota en menos de dos semanas sale en rojo; lo que sobra, en azul.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Ajusta tu lista',
    body: 'Arrancas con una copia de tu lista y la cambias con el reporte al lado, hasta que quede lo que vas a pedir.',
  },
  {
    icon: MessageCircle,
    title: 'Cuéntanos por qué',
    body: 'Ves qué agregaste, qué quitaste y qué cantidades cambiaste, y nos cuentas por qué. Si no cambiaste nada, también nos sirve saberlo.',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="como-funciona-title"
          eyebrow="Cómo funciona"
          title="Empieza por el pedido que ya ibas a hacer."
          description="No cambias tu forma de trabajar. Anotas tu pedido como siempre, miras la rotación y decides si algo cambia."
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
          <li className="flex flex-col gap-4 bg-secondary p-6 text-secondary-foreground">
            <span className="flex size-10 items-center justify-center rounded-lg bg-card text-primary">
              <Clock className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-semibold">¿Cuánto toma?</h3>
              <p className="mt-2 leading-relaxed">
                Unos cinco minutos si tienes el export a mano. Si te toca parar, el borrador se guarda solo y sigues
                después.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  )
}
