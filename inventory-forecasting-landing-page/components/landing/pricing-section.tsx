import { Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { URL_CREAR_CUENTA } from '@/lib/app'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'

const incluye = [
  'Panel con lo que se agota, lo que conviene pedir ya y el dinero quieto',
  'Cantidad sugerida por producto, con el tiempo de entrega de cada proveedor, la temporada, los mínimos y los múltiplos de empaque',
  'Pedido por proveedor en PDF o Excel con el logo de su empresa, o por WhatsApp',
  'Registro diario de entradas, ventas y conteos',
  'Varias personas por empresa, con aprobación de pedidos',
  'Boletín por correo con los avisos que cada persona elija',
  'Lectura de Excel o CSV de Siigo, Helisa, World Office y otros programas',
]

const planes = [
  { nombre: 'Una persona', para: 'Gerente o administrador', precio: '$82.500', destacado: false },
  { nombre: 'Con un operador', para: 'Gerente o administrador, y un operador', precio: '$90.000', destacado: true },
  { nombre: 'Cada persona adicional', para: 'Sin importar su rol', precio: '+$10.000', destacado: false },
]

export function PricingSection() {
  return (
    <section id="precio" aria-labelledby="precio-title" className="scroll-mt-20 border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="precio-title"
          eyebrow="Precio"
          title="Un precio simple, por equipo."
          description="Pague por las personas que usan SINESC. Todas las funciones van incluidas, sin límite de pedidos ni de productos."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {planes.map((p) => (
            <div
              key={p.nombre}
              className={cn(
                'flex flex-col rounded-2xl border p-6 md:p-8',
                p.destacado ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
              )}
            >
              <h3 className="font-semibold">{p.nombre}</h3>
              <p className={cn('mt-1 text-sm', p.destacado ? 'text-primary-foreground' : 'text-muted-foreground')}>{p.para}</p>
              <p className="mt-6">
                <span className="text-4xl font-bold tracking-tight">{p.precio}</span>{' '}
                <span className={cn('text-sm', p.destacado ? 'text-primary-foreground/95' : 'text-muted-foreground')}>COP al mes</span>
              </p>
              {p.destacado && (
                <a
                  href={URL_CREAR_CUENTA}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'mt-8 h-11 w-full text-base')}
                >
                  Crear mi cuenta
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-background p-6 md:p-8">
          <h3 className="font-semibold">Todos los planes incluyen</h3>
          <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            {incluye.map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-8 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
            Para crear cada cuenta se necesita un código de acceso de un solo uso, que le entrega el equipo de SINESC.
            Cada persona lleva el suyo.
          </p>
        </div>
      </div>
    </section>
  )
}
