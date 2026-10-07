import { SectionHeading } from './section-heading'
import { DiscountCalculator } from './discount-calculator'

export function DiscountSection() {
  return (
    <section id="descuentos" aria-labelledby="descuentos-title" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <SectionHeading
            id="descuentos-title"
            eyebrow="Calculadora de descuento"
            title="¿Le conviene llevar más por el descuento?"
            description="Si pide la cantidad que exige el proveedor para el descuento, ¿cuántas semanas le dura? ¿Se le vence antes? Pruebe con sus números."
          />
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            Dentro de la aplicación, la demanda semanal sale automáticamente de su historial de ventas.
          </p>
        </div>
        <DiscountCalculator />
      </div>
    </section>
  )
}
