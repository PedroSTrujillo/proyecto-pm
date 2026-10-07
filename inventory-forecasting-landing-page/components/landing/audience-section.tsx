import { Repeat, Receipt, Scale } from 'lucide-react'
import { SectionHeading } from './section-heading'

const traits = [
  {
    icon: Repeat,
    title: 'Compra seguido a los mismos proveedores',
    body: 'Pedidos semanales o quincenales, con productos que se repiten.',
  },
  {
    icon: Receipt,
    title: 'Sus ventas ya quedan registradas',
    body: 'En el POS, la facturación electrónica o un software contable del que puede sacar un Excel.',
  },
  {
    icon: Scale,
    title: 'Decide la cantidad sin un número calculado',
    body: 'Con experiencia, conteos o informes de los puntos, y lo corrige con pedidos extra.',
  },
]

const principles = [
  'Explicamos cada concepto sin jerga financiera.',
  'Trabajamos en pasos pequeños y claros.',
  'Usamos su conteo físico, no el inventario del sistema.',
  'Nunca hacemos pedidos por usted.',
]

export function AudienceSection() {
  return (
    <section aria-labelledby="para-quien-title">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="para-quien-title"
          eyebrow="Para quién es"
          title="Hecho para distribuidoras y comercializadoras de 10 a 50 empleados."
          description="Para el encargado de inventario o administrador que proyecta la rotación y coordina el reabastecimiento. Si se reconoce en estas tres cosas, es para usted."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {traits.map((trait) => (
            <div key={trait.title} className="rounded-2xl border border-border bg-card p-6">
              <trait.icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-5 font-semibold">{trait.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{trait.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-secondary p-6 md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-secondary-foreground">Su experiencia no se reemplaza. Se apoya.</p>
          <ul className="flex flex-wrap gap-2">
            {principles.map((p) => (
              <li key={p} className="rounded-full bg-card px-3 py-1.5 text-sm text-foreground">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
