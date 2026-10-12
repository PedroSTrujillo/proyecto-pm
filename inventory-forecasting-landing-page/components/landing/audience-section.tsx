import { Repeat, Receipt, Scale } from 'lucide-react'
import { SectionHeading } from './section-heading'

const traits = [
  {
    icon: Repeat,
    title: 'Le compras seguido a los mismos proveedores',
    body: 'Pedidos cada semana o cada quince días, con productos que se repiten.',
  },
  {
    icon: Receipt,
    title: 'Tus ventas ya quedan en el sistema',
    body: 'En Siigo, Alegra, World Office, Helisa, SAP o el programa del que sacas tus informes en Excel.',
  },
  {
    icon: Scale,
    title: 'Decides cuánto pedir sin un número a la mano',
    body: 'Con experiencia, conteos o el informe de mínimos, y lo corriges con pedidos extra.',
  },
]

const principles = [
  'Cada número trae su cuenta',
  'Subes tu archivo tal como sale',
  'La última palabra es tuya',
]

export function AudienceSection() {
  return (
    <section aria-labelledby="para-quien-title">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="para-quien-title"
          eyebrow="Para quién es"
          title="Hecho para distribuidoras y comercializadoras de 10 a 50 empleados."
          description="Para quien lleva el inventario o administra el negocio y se encarga de que no falte nada sin llenar la bodega. Si te reconoces en estas tres cosas, es para ti."
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
          <p className="font-semibold text-secondary-foreground">Así trabaja SINESC:</p>
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
