import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CtaSection() {
  return (
    <section id="piloto" aria-labelledby="piloto-title" className="scroll-mt-20 px-4 pb-20 md:px-6 md:pb-28">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-foreground px-6 py-14 text-background md:px-14 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-highlight">Piloto gratis</p>
            <h2 id="piloto-title" className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-5xl">
              Mándenos su Excel. Le devolvemos el pedido de la próxima semana.
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-background/75">
              Durante cuatro semanas calculamos la sugerencia de sus productos más difíciles y se la enviamos el día
              antes de su pedido. Si no le sirve, no paga nada.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="mailto:hola@pedidosugerido.co?subject=Quiero%20el%20piloto%20gratis"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-12 bg-highlight px-6 text-base text-highlight-foreground hover:bg-highlight/90',
              )}
            >
              Solicitar mi piloto
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
            <p className="text-center text-sm text-background/60">Respondemos en menos de 24 horas hábiles.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
