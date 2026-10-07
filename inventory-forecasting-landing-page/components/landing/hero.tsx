import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { OrderPreview } from './order-preview'

const reassurances = ['Funciona con su Excel o CSV', 'Sin integraciones complicadas', 'Piloto gratis de 4 semanas']

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 md:px-6 md:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-highlight" aria-hidden="true" />
            Pronóstico de inventario para pymes y distribuidoras
          </p>
          <h1
            id="hero-title"
            className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl"
          >
            El producto propone. <span className="text-primary">Usted decide.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Cada semana, antes de armar su pedido, recibe una cantidad sugerida por producto calculada con sus propias
            ventas. Le mostramos de dónde sale cada número para que pida con tranquilidad: sin quedarse corto y sin
            mercancía parada.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="#piloto" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5 text-base')}>
              Empezar el piloto gratis
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
            <Link
              href="#como-funciona"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 px-5 text-base')}
            >
              Ver cómo funciona
            </Link>
          </div>
          <ul className="mt-8 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
            {reassurances.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <OrderPreview />
      </div>
    </section>
  )
}
