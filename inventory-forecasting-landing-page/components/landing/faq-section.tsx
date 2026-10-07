import { ChevronDown } from 'lucide-react'
import { SectionHeading } from './section-heading'

const faqs = [
  {
    q: '¿Qué datos necesito para empezar?',
    a: 'Un Excel o CSV con sus ventas de las últimas 12 semanas por producto, sacado de su POS o software contable, y su conteo de inventario más reciente. Con eso basta para una primera sugerencia útil.',
  },
  {
    q: '¿Tengo que conectar Siigo, Alegra o mi POS?',
    a: 'No. Por ahora trabajamos con el archivo que usted ya puede exportar. Usted indica qué columna es la fecha, cuál el producto y cuál la cantidad, y nosotros hacemos el resto.',
  },
  {
    q: '¿La herramienta hace los pedidos por mí?',
    a: 'Nunca. El producto propone y usted decide. Puede cambiar cualquier cantidad con un clic y dejar la razón. Luego exporta el pedido como texto para WhatsApp o PDF y lo envía como siempre.',
  },
  {
    q: '¿Qué pasa si mis datos están desordenados?',
    a: 'Le avisamos qué se ve raro: semanas vacías, cantidades negativas o productos duplicados. Por eso trabajamos con ventas, que suelen ser el dato más limpio, y con su conteo físico en lugar del inventario del sistema.',
  },
  {
    q: '¿Cómo sé si la sugerencia está bien?',
    a: 'Cada semana comparamos lo sugerido, lo que usted pidió y lo que realmente vendió, producto por producto. Así ve con sus propios datos si el número le ayuda.',
  },
  {
    q: '¿Quién puede ver mi información?',
    a: 'Solo su negocio. Cada cuenta está aislada con reglas de acceso en la base de datos, y sus archivos se almacenan de forma privada.',
  },
]

export function FaqSection() {
  return (
    <section id="preguntas" aria-labelledby="preguntas-title" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
        <SectionHeading
          id="preguntas-title"
          eyebrow="Preguntas frecuentes"
          title="Lo que suelen preguntarnos."
        />
        <div className="divide-y divide-border border-y border-border">
          {faqs.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {faq.q}
                <ChevronDown
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 pr-8 leading-relaxed text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
