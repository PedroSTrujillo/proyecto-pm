import { Check, Minus } from 'lucide-react'
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

const noHace = [
  'No se conecta directamente a su software contable: usted sube el archivo.',
  'No envía pedidos por su cuenta: el pedido lo envía usted al proveedor.',
  'No usa inteligencia artificial: cada número sale de un cálculo que usted puede revisar.',
]

export function PricingSection() {
  return (
    <section id="precio" aria-labelledby="precio-title" className="scroll-mt-20 border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="precio-title"
          eyebrow="Precio"
          title="Por ahora, sin costo."
          description="SINESC está en etapa piloto con un grupo de distribuidoras. Úselo en sus próximos pedidos y cuéntenos qué le sirvió y qué no. No se pide tarjeta ni se firma contrato."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-primary bg-primary p-6 text-primary-foreground md:p-8">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Versión piloto</h3>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                Abierta
              </span>
            </div>
            <p className="mt-6">
              <span className="text-4xl font-bold tracking-tight">Gratis</span>{' '}
              <span className="text-sm text-primary-foreground/95">durante el piloto</span>
            </p>
            <p className="mt-3 leading-relaxed text-primary-foreground">
              Sin límite de pedidos, productos o personas.
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
            <h3 className="font-semibold">Lo que no hace, por decisión de diseño</h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Quedó por fuera para que usted sepa de dónde sale cada número y la decisión del pedido siga siendo suya.
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
              Lo sugerido es un punto de partida, y cada línea se puede aceptar o cambiar. Usted conoce qué cliente grande
              viene en camino o qué producto va a dejar de trabajar.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
