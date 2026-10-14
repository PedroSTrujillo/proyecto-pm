import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { URL_CREAR_CUENTA, URL_DEMO } from '@/lib/app'
import { cn } from '@/lib/utils'

// La misma llamada a la acción del encabezado, repetida a mitad de la página (comentario de los
// monitores: solo estaba al principio y al final).
export function CtaEnLinea({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <p className="text-pretty text-lg font-semibold">{texto}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <a href={URL_CREAR_CUENTA} className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5 text-base')}>
          Crear mi cuenta
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </a>
        <Link href={URL_DEMO} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 px-5 text-base')}>
          Ver un negocio de ejemplo
        </Link>
      </div>
    </div>
  )
}
