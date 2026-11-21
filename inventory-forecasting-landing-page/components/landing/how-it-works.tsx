import { ArrowLeftRight, ClipboardList, Clock, FileSpreadsheet } from 'lucide-react'
import { CtaEnLinea } from './cta-en-linea'
import { SectionHeading } from './section-heading'

// Tres pasos (comentario de los monitores: con cinco había demasiada fricción). Son los de Alpha
// 0.2: el inventario se sube una vez, se mantiene al día con los movimientos y el pedido arranca de
// lo sugerido (D9 de docs/PLAN_ALPHA_02.md).
const steps = [
  {
    icon: FileSpreadsheet,
    title: 'Suba su inventario',
    body: 'Las ventas del último año y las existencias de hoy, tal como salen de su programa contable. Se hace una sola vez.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Registre lo que entra y sale',
    body: 'Cada día, a mano o con el archivo de su programa. El panel y las existencias se actualizan con cada movimiento.',
  },
  {
    icon: ClipboardList,
    title: 'Prepare y envíe el pedido',
    body: 'SINESC sugiere cuánto pedirle a cada proveedor y explica por qué. Usted ajusta las cantidades, lo envía a aprobación si su empresa lo requiere y comparte la orden en PDF, Excel o WhatsApp.',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="como-funciona-title"
          eyebrow="Cómo funciona"
          title="Del archivo que ya tiene al pedido listo para el proveedor."
          description="Siga con su programa contable. Suba su información, mantenga el inventario al día y prepare cada pedido con una sugerencia que puede revisar línea por línea."
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
                Unos cinco minutos para ver el primer panel, si tiene el archivo a mano. Si debe interrumpir un pedido,
                lo que lleva queda guardado.
              </p>
            </div>
          </li>
        </ol>
        <CtaEnLinea className="mt-10" texto="Su próximo pedido es un buen momento para probarlo." />
      </div>
    </section>
  )
}
