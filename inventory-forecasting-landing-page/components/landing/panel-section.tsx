import Link from 'next/link'
import { ArrowRight, BellRing, ClipboardList, LineChart, SlidersHorizontal, Truck } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { URL_DEMO } from '@/lib/app'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'

// Lo que hay además del reporte: el panel, la ficha con pronóstico y el pedido sugerido.
const funciones = [
  { icon: Truck, title: 'Pide ya lo que tarda en llegar', body: 'Le dices cuánto tarda cada proveedor y te avisa qué productos se agotan antes de que llegue un pedido hecho hoy. Pensado para lo importado.' },
  { icon: LineChart, title: 'Pronóstico con la temporada de tu negocio', body: 'Cada producto con sus ventas por semana, lo que viene y un rango honesto. Las ventas para proyectos no inflan el promedio.' },
  { icon: ClipboardList, title: 'Pedido sugerido por proveedor', body: 'Cuánto pedir para cubrir la entrega y llegar al siguiente pedido. Lo cambias y lo mandas en Excel, por WhatsApp o en PDF para que gerencia lo apruebe.' },
  { icon: SlidersHorizontal, title: 'Mínimos y máximos para tu programa', body: 'Calculados con tus ventas, en un Excel listo para cargarlos en Siigo, World Office o el programa que uses.' },
  { icon: BellRing, title: 'Un aviso antes de que se agote', body: 'Un recordatorio en tu calendario tres días antes de que algo llegue a dos semanas de inventario. Sin descargar aplicaciones.' },
]

// Adelanto del panel: cifras y un gráfico de ventas con pronóstico, dibujados a mano.
function Adelanto() {
  const ventas = [52, 48, 55, 61, 58, 66, 63, 70, 68, 74, 71, 78, 75, 82, 79, 84]
  const pron = [84, 86, 90, 93]
  const x = (i: number) => 12 + i * (296 / 19)
  const y = (v: number) => 110 - (v - 40) * 1.6
  const linea = ventas.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const futuro = [[15, ventas[15]], ...pron.map((v, k) => [16 + k, v])].map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const banda = [
    ...[[15, ventas[15]], ...pron.map((v, k) => [16 + k, v + 4 + k * 2])],
    ...[[15, ventas[15]], ...pron.map((v, k) => [16 + k, v - 4 - k * 2])].reverse(),
  ].map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <div className="rounded-2xl border border-border bg-background p-4 shadow-[0_24px_60px_-30px_rgba(17,24,39,0.35)] md:p-5" aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-extrabold">Tu inventario hoy</span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">Datos de ejemplo</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          ['Se agotan', '4', 'text-rojo'],
          ['Pide ya', '3', 'text-ambar'],
          ['Dinero quieto', '$11,9 M', 'text-azul'],
        ].map(([t, v, c]) => (
          <div key={t} className="rounded-xl border border-border bg-card p-3">
            <span className="block text-[0.65rem] font-bold tracking-wide text-muted-foreground uppercase">{t}</span>
            <strong className={cn('font-display text-xl tabular-nums', c)}>{v}</strong>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-3">
        <span className="text-xs font-semibold text-muted-foreground">Ventas por semana y lo que viene</span>
        <svg viewBox="0 0 320 120" className="mt-1 h-auto w-full">
          <polygon points={banda} fill="var(--primary)" fillOpacity={0.13} />
          <path d={linea} fill="none" stroke="var(--primary)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          <path d={futuro} fill="none" stroke="var(--primary)" strokeWidth={2.4} strokeDasharray="5 5" strokeLinecap="round" />
          <line x1={x(15)} x2={x(15)} y1={10} y2={112} stroke="#9ca3af" strokeDasharray="3 4" />
        </svg>
      </div>
      <div className="mt-3 rounded-xl border border-ambar-borde bg-ambar-fondo p-3 text-[0.82rem] text-[#431407]">
        <strong className="block text-[0.65rem] tracking-wide text-ambar-texto uppercase">Pide ya: tarda en llegar</strong>
        El taladro te alcanza para 6 semanas y el importador tarda 10.
      </div>
    </div>
  )
}

export function PanelSection() {
  return (
    <section id="panel" aria-labelledby="panel-title" className="scroll-mt-20 border-y border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <SectionHeading
            id="panel-title"
            eyebrow="Además del reporte"
            title="Tu inventario queda guardado y a la vista."
            description="Lo subes una vez y queda guardado. En tus 14 días de prueba ves el reporte de semanas; al terminar, también todo esto. En la demo lo ves completo."
          />
          <ul className="mt-8 flex flex-col gap-5">
            {funciones.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <strong className="block font-semibold">{f.title}</strong>
                  <span className="mt-1 block leading-relaxed text-muted-foreground">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href={URL_DEMO} className={cn(buttonVariants({ size: 'lg' }), 'mt-8 h-11 px-5 text-base')}>
            Verlo con un negocio de ejemplo
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </div>
        <Adelanto />
      </div>
    </section>
  )
}
