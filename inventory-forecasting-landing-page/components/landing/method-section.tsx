import { SectionHeading } from './section-heading'

const pieces = [
  {
    label: 'Demanda esperada',
    body: 'Promedio ponderado de las últimas 8 semanas, con más peso en las recientes. Con más de un año de historia, se ajusta por estacionalidad del mes.',
    example: '28 kg / semana',
  },
  {
    label: 'Cobertura',
    body: 'La demanda se multiplica por las semanas hasta el siguiente pedido más el tiempo de entrega del proveedor.',
    example: '× 1,3 semanas',
  },
  {
    label: 'Colchón',
    body: 'Un margen según qué tanto varían las ventas. Poco para productos estables, más para los que suben y bajan. En perecederos, se limita por la vida útil.',
    example: '+ 3,6 kg',
  },
  {
    label: 'Pedido sugerido',
    body: 'Cobertura más colchón, menos lo que tiene hoy, redondeado a la presentación en que compra: kilos, cajas o paquetes.',
    example: '− 6 kg = 34 kg',
  },
]

export function MethodSection() {
  return (
    <section
      id="metodo"
      aria-labelledby="metodo-title"
      className="scroll-mt-20 bg-primary text-primary-foreground"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-highlight">El método</p>
            <h2 id="metodo-title" className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Un número que puede explicarle a su jefe.
            </h2>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-primary-foreground/80">
              Combinamos métodos clásicos de pronóstico financiero con aprendizaje automático, pero nunca le
              entregamos una caja negra. Cada cantidad viene con sus supuestos a la vista y un rango de mínimo a
              máximo que le deja espacio a su criterio.
            </p>
            <div className="mt-8 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-5">
              <p className="text-sm text-primary-foreground/70">Medimos la calidad del número</p>
              <p className="mt-2 leading-relaxed">
                Comparamos el error de la sugerencia contra lo que realmente vendió, y contra el error del pedido que
                usted hizo por su cuenta. Así sabe, con datos, si le está sirviendo.
              </p>
            </div>
          </div>
          <ol className="flex flex-col gap-3">
            {pieces.map((piece, index) => (
              <li
                key={piece.label}
                className="grid gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-start sm:gap-5"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-highlight font-mono text-sm font-semibold text-highlight-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{piece.label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-primary-foreground/75">{piece.body}</p>
                </div>
                <span className="font-mono text-sm text-highlight sm:text-right">{piece.example}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
