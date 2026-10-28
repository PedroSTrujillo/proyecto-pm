import { ChevronDown } from 'lucide-react'
import { URL_PLANTILLA_INVENTARIO } from '@/lib/app'
import { SectionHeading } from './section-heading'

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: '¿Qué archivo necesito?',
    a: (
      <>
        Lo que sacas de tu programa contable: las ventas del último año, con la fecha de cada venta o el total del
        periodo, y las existencias de hoy. Uno o varios archivos, en Excel o CSV, tal como salen. Al elegir tu
        programa te mostramos dónde está cada informe. Si llevas el inventario en Excel, descarga la{' '}
        <a href={URL_PLANTILLA_INVENTARIO} className="text-primary underline underline-offset-2 hover:text-primary-hover">
          plantilla
        </a>{' '}
        y llénala.
      </>
    ),
  },
  {
    q: '¿Tengo que conectar Siigo, SAP o mi POS?',
    a: 'No. Subes el archivo tal como sale y reconocemos las columnas. Si alguna no la reconocemos, o si el informe mezcla compras y ventas, te preguntamos una sola vez y la próxima vez lo leemos sin preguntar.',
  },
  {
    q: '¿La herramienta me dice cuánto pedir?',
    a: 'Te sugiere una cantidad para cada producto, con el tiempo de entrega de tu proveedor y hasta tu siguiente pedido, y te muestra por qué. Tú decides la cantidad final y el pedido se lo sigues mandando tú al proveedor.',
  },
  {
    q: '¿Por qué tengo que anotar mi pedido antes de ver el reporte?',
    a: 'Para poder comparar. Tu primera lista queda fija cuando la guardas, y la final la cambias todo lo que quieras. Al terminar ves, línea por línea, qué cambió después de mirar la rotación.',
  },
  {
    q: '¿Tiene que ser un pedido de verdad?',
    a: 'No. Puedes marcarlo como simulado y armarlo como si fueras a pedir hoy. Igual ves el reporte completo con tus datos.',
  },
  {
    q: '¿Qué pasa si mi archivo tiene errores?',
    a: 'Te lo decimos. Si algo no se puede leer, te indicamos la fila y la columna. En el reporte también te avisamos si hay productos que no aparecen en las ventas o en las existencias, existencias negativas o menos de seis meses de ventas.',
  },
  {
    q: '¿Quién puede ver mi información?',
    a: 'Tus pedidos solo los ves tú; el inventario lo ven las personas de tu empresa. El equipo de SINESC puede revisar cómo se usa la herramienta, por ejemplo qué cambias en tus pedidos, para mejorarla. No compartimos tus datos con nadie. Si quieres que los borremos, escríbenos y los borramos.',
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
