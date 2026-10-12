import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { URL_CREAR_CUENTA, URL_ENTRAR } from '@/lib/app'
import { cn } from '@/lib/utils'

export function CtaSection() {
  return (
    <section id="empezar" aria-labelledby="empezar-title" className="scroll-mt-20 px-4 pb-20 md:px-6 md:pb-28">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-foreground px-6 py-14 text-background md:px-14 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-highlight">Versión de prueba</p>
            <h2 id="empezar-title" className="mt-3 text-balance text-3xl font-bold tracking-tight md:text-5xl">
              Trae tu archivo de ventas. En cinco minutos ves qué se te está acabando.
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-background/75">
              Crea tu cuenta, anota tu próximo pedido y sube el archivo. Si algo no se lee bien, te decimos qué falta y
              dónde.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <a
              href={URL_CREAR_CUENTA}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-12 bg-highlight px-6 text-base text-foreground hover:bg-highlight/90',
              )}
            >
              Crear mi cuenta
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </a>
            <p className="text-center text-sm text-background/65">
              ¿Ya tienes cuenta?{' '}
              <a href={URL_ENTRAR} className="font-medium text-background underline underline-offset-2">
                Entra aquí
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
