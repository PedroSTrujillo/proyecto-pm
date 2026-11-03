import { ChevronDown } from 'lucide-react'
import { URL_PLANTILLA_INVENTARIO } from '@/lib/app'
import { SectionHeading } from './section-heading'

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: '¿Qué archivo necesito?',
    a: (
      <>
        El que saca de su programa contable: las ventas del último año, con la fecha de cada venta o el total del
        periodo, y las existencias de hoy. Puede ser uno o varios archivos, en Excel o CSV, tal como salen. Al elegir su
        programa, la aplicación le indica dónde está cada informe. Si lleva el inventario en Excel, descargue la{' '}
        <a href={URL_PLANTILLA_INVENTARIO} className="text-primary underline underline-offset-2 hover:text-primary-hover">
          plantilla
        </a>{' '}
        y llénela.
      </>
    ),
  },
  {
    q: '¿Tengo que conectar Siigo, SAP o mi POS?',
    a: 'No. Usted sube el archivo tal como sale y SINESC reconoce las columnas. Si alguna no se reconoce, o si el informe mezcla compras y ventas, se le pregunta una sola vez y las cargas siguientes se leen sin preguntar.',
  },
  {
    q: '¿Tengo que subir el archivo cada semana?',
    a: 'No. Se sube una vez y después se registra lo que entra y sale, a mano o importando el archivo del día. Cuando cierre un periodo contable, puede subir de nuevo el informe completo y SINESC lo combina con lo registrado.',
  },
  {
    q: '¿La herramienta me dice cuánto pedir?',
    a: 'Sugiere una cantidad para cada producto con el tiempo de entrega de su proveedor, la temporada y lo que ya viene en camino, y muestra cómo la calculó. Usted puede aceptar o modificar cada línea antes de enviar el pedido al proveedor.',
  },
  {
    q: '¿Pueden usarlo varias personas de mi empresa?',
    a: 'Sí. Quien administra la cuenta invita a las demás personas con un enlace. Las personas invitadas trabajan sobre el mismo inventario, cada una con su propia cuenta, y quien administra decide quién aprueba los pedidos.',
  },
  {
    q: '¿Qué pasa si mi archivo tiene errores?',
    a: 'SINESC se lo indica con la fila y la columna. También avisa si hay productos que no aparecen en las ventas o en las existencias, existencias negativas o menos de seis meses de ventas.',
  },
  {
    q: '¿Quién puede ver mi información?',
    a: 'Sus pedidos los ve usted y, si su empresa usa aprobación, quien los aprueba. El inventario lo ven las personas de su empresa. El equipo de SINESC revisa cómo se usa la herramienta para mejorarla. No compartimos sus datos con terceros, y si desea que los borremos, escríbanos y los borramos.',
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
