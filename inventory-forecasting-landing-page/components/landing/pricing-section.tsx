import Link from 'next/link'
import { Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'

const plans = [
  {
    name: 'Piloto',
    price: 'Gratis',
    period: '4 semanas',
    description: 'Le acompañamos con sus productos más difíciles antes de que pague un peso.',
    features: [
      'Análisis de 12 semanas de ventas',
      'De 5 a 10 productos críticos',
      'Sugerencia semanal por WhatsApp o correo',
      'Comparación sugerido vs. vendido',
    ],
    cta: 'Empezar el piloto',
    featured: true,
  },
  {
    name: 'Esencial',
    price: '$150.000',
    period: 'COP / mes',
    description: 'Para negocios con un punto de venta y un día de pedido fijo.',
    features: [
      'Carga de Excel o CSV ilimitada',
      'Pedido sugerido con rango y explicación',
      'Exportación a WhatsApp y PDF',
      'Alertas de datos sucios',
    ],
    cta: 'Hablar con nosotros',
  },
  {
    name: 'Crecimiento',
    price: '$300.000',
    period: 'COP / mes',
    description: 'Para distribuidoras con más referencias y varios proveedores.',
    features: [
      'Todo lo de Esencial',
      'Calculadora de descuento por volumen',
      'Ajuste por estacionalidad anual',
      'Enlace para compartir con su equipo',
    ],
    cta: 'Hablar con nosotros',
  },
]

export function PricingSection() {
  return (
    <section id="precio" aria-labelledby="precio-title" className="scroll-mt-20 border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="precio-title"
          eyebrow="Precio"
          title="Primero pruébelo con sus datos. Después decide."
          description="Una suscripción mensual por negocio, sin contratos de permanencia ni costos de implementación."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'flex flex-col rounded-2xl border p-6 md:p-8',
                plan.featured ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{plan.name}</h3>
                {plan.featured ? (
                  <span className="rounded-full bg-highlight px-2.5 py-1 text-xs font-medium text-highlight-foreground">
                    Recomendado
                  </span>
                ) : null}
              </div>
              <p className="mt-6">
                <span className="font-mono text-4xl font-semibold tracking-tight">{plan.price}</span>{' '}
                <span className={cn('text-sm', plan.featured ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {plan.period}
                </span>
              </p>
              <p
                className={cn(
                  'mt-3 leading-relaxed',
                  plan.featured ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {plan.description}
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check
                      className={cn('mt-0.5 size-4 shrink-0', plan.featured ? 'text-highlight' : 'text-primary')}
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="#piloto"
                className={cn(
                  buttonVariants({ variant: plan.featured ? 'secondary' : 'outline', size: 'lg' }),
                  'mt-8 h-11 w-full text-base',
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
