import { BarChart3, ClipboardList, Clock, FileSpreadsheet } from 'lucide-react'
import { CtaEnLinea } from './cta-en-linea'
import { SectionHeading } from './section-heading'

// Tres pasos (comentario de los monitores: con cinco había demasiada fricción). En la aplicación
// el tercero se reparte en ver el reporte, ajustar la lista y contar por qué.
const steps = [
  {
    icon: ClipboardList,
    title: 'Anota lo que ibas a pedir',
    body: 'Escribe tu pedido como lo harías hoy, o pégalo desde Excel.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Sube tu archivo',
    body: 'Las ventas del último año y lo que tienes hoy, tal como salen de tu programa contable.',
  },
  {
    icon: BarChart3,
    title: 'Decide y envía',
    body: 'Ves qué se agota y qué sobra, y cuánto sugiere pedir SINESC. Tú decides la cantidad final y la envías en PDF, Excel o WhatsApp.',
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
        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
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
                Unos cinco minutos si tienes el archivo a mano. Si te toca parar, el borrador se guarda solo y sigues
                después.
              </p>
            </div>
          </li>
        </ol>
        <CtaEnLinea className="mt-10" texto="Tu próximo pedido es un buen momento para probarlo." />
      </div>
    </section>
  )
}
