import { SectionHeading } from './section-heading'
import { WeeksCalculator } from './weeks-calculator'

export function CalculatorSection() {
  return (
    <section id="calculadora" aria-labelledby="calculadora-title" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <SectionHeading
            id="calculadora-title"
            eyebrow="Pruébelo con un producto"
            title="¿Para cuántas semanas le alcanza?"
            description="Piense en un producto que conozca bien: cuánto vendió en un periodo y cuánto tiene hoy. Es el cálculo básico de SINESC. La aplicación lo hace con todos sus productos a la vez y con los ajustes."
          />
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            En la aplicación no tiene que escribir nada de esto: los números salen de su archivo.
          </p>
        </div>
        <WeeksCalculator />
      </div>
    </section>
  )
}
