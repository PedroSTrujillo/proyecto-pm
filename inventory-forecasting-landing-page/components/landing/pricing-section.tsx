import { Check, Minus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { URL_CREAR_CUENTA } from '@/lib/app'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'

const incluye = [
  'Reporte de rotación de cada producto',
  'Cantidad sugerida de cada producto desde el primer día, con el tiempo de entrega de cada proveedor y la temporada',
  'Orden de compra en PDF, Excel o WhatsApp',
  'Excel o CSV, en uno o en varios archivos',
  'Tu lista de antes y la de después, comparadas',
  'Pedidos reales o simulados',
  'Plantilla para quien lleva el inventario en Excel',
  'Recordatorio en tu calendario antes de que un producto se agote, si lo pides',
]

const noHace = [
  'No se conecta a tu software contable: tú subes el archivo.',
  'No hace pedidos por ti: el pedido lo mandas tú.',
  'No usa inteligencia artificial: cada número sale de una cuenta que puedes revisar.',
]

export function PricingSection() {
  return (
    <section id="precio" aria-labelledby="precio-title" className="scroll-mt-20 border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="precio-title"
          eyebrow="Precio"
          title="Por ahora no cuesta nada."
          description="Estamos probando la herramienta con un grupo pequeño de distribuidoras. Úsala en tus próximos pedidos y cuéntanos qué te sirvió y qué no. No pedimos tarjeta ni hay nada que firmar."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-primary bg-primary p-6 text-primary-foreground md:p-8">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Versión de prueba</h3>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                Abierta
              </span>
            </div>
            <p className="mt-6">
              <span className="text-4xl font-bold tracking-tight">Gratis</span>{' '}
              <span className="text-sm text-primary-foreground/95">mientras dure la prueba</span>
            </p>
            <p className="mt-3 leading-relaxed text-primary-foreground">
              Sin límite de pedidos ni de productos.
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm">
              {incluye.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={URL_CREAR_CUENTA}
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'mt-8 h-11 w-full text-base')}
            >
              Crear mi cuenta
            </a>
          </div>

          <div className="flex flex-col rounded-2xl border border-border bg-background p-6 md:p-8">
            <h3 className="font-semibold">Lo que no hace, a propósito</h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Lo dejamos por fuera para que sepas de dónde sale cada número y el pedido siga siendo tuyo.
            </p>
            <ul className="mt-6 mb-8 flex flex-col gap-3 text-sm">
              {noHace.map((item) => (
                <li key={item} className="flex gap-2">
                  <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-auto rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
              Lo sugerido es un punto de partida. Tú sabes qué cliente grande viene en camino o qué producto vas a dejar
              de trabajar.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
