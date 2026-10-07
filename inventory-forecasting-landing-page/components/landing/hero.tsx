import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { URL_CREAR_CUENTA } from '@/lib/app'
import { cn } from '@/lib/utils'
import { ReportPreview } from './report-preview'

const reassurances = ['Lee tu Excel o CSV tal como sale', 'No hay que conectar ningún sistema', 'Unos 5 minutos por pedido']

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 md:px-6 md:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Rotación de inventario para distribuidoras y comercializadoras
          </p>
          <h1
            id="hero-title"
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl"
          >
            Mira qué se agota y qué sobra. <span className="text-primary">Tú decides cuánto pedir.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Sube el export de tu software contable tal como sale y mira para cuántas semanas te alcanza cada
            producto. Arriba aparece lo que se te acaba primero y, marcado aparte, lo que te sobra. Lo ves antes de
            hacer el pedido, no después.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={URL_CREAR_CUENTA} className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5 text-base')}>
              Crear mi cuenta
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </a>
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
        <ReportPreview />
      </div>
    </section>
  )
}
