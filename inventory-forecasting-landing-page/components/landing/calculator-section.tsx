import { SectionHeading } from './section-heading'
import { WeeksCalculator } from './weeks-calculator'

export function CalculatorSection() {
  return (
    <section id="calculadora" aria-labelledby="calculadora-title" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <SectionHeading
            id="calculadora-title"
            eyebrow="Pruébalo con un producto"
            title="¿Para cuántas semanas te alcanza?"
            description="Piensa en un producto que conozcas bien: cuánto vendiste en un periodo y cuánto tienes hoy. Es la cuenta básica del reporte. Allá se hace con todos tus productos a la vez y con los ajustes."
          />
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            En la aplicación no tienes que escribir nada de esto: los números salen de tu export.
          </p>
        </div>
        <WeeksCalculator />
      </div>
    </section>
  )
}
