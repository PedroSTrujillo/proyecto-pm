import { Info, MessageCircle } from 'lucide-react'

const items = [
  {
    product: 'Tocineta ahumada',
    unit: 'kg',
    suggested: 34,
    min: 28,
    max: 40,
    adjusted: 30,
    reason: 'Vendió en promedio 28 kg/semana en las últimas 8 semanas; fin de mes sube 15 %; le quedan 6 kg.',
  },
  {
    product: 'Pan brioche x12',
    unit: 'paq',
    suggested: 60,
    min: 52,
    max: 66,
    reason: 'Promedio de 54 paquetes/semana, ventas estables; le quedan 8 paquetes.',
  },
  {
    product: 'Queso cheddar',
    unit: 'cajas',
    suggested: 9,
    min: 7,
    max: 12,
    reason: 'Rotación variable (±22 %), colchón mayor; proveedor entrega en 2 días.',
  },
]

export function OrderPreview() {
  return (
    <figure className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-secondary/70 [mask-image:radial-gradient(closest-side,black,transparent)]"
      />
      <div className="rounded-2xl border border-border bg-card shadow-[0_20px_60px_-30px_oklch(0.3_0.05_165/0.35)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Pedido sugerido · Viernes</p>
            <p className="text-xs text-muted-foreground">Proveedor: Cárnicos del Valle · Semana 39</p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
            Listo para revisar
          </span>
        </div>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.product} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{item.product}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    Rango {item.min}–{item.max} {item.unit}
                  </p>
                </div>
                <div className="text-right">
                  {item.adjusted ? (
                    <p className="font-mono text-lg font-semibold">
                      <span className="mr-2 text-sm font-normal text-muted-foreground line-through">
                        {item.suggested}
                      </span>
                      {item.adjusted}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span>
                    </p>
                  ) : (
                    <p className="font-mono text-lg font-semibold">
                      {item.suggested}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span>
                    </p>
                  )}
                </div>
              </div>
              <RangeBar min={item.min} max={item.max} value={item.adjusted ?? item.suggested} suggested={item.suggested} />
              <p className="mt-3 flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{item.reason}</span>
              </p>
              {item.adjusted ? (
                <p className="mt-2 rounded-md bg-highlight/25 px-2.5 py-1.5 text-xs text-highlight-foreground">
                  Ajustado por usted: {'"'}Esta semana cerramos el domingo por inventario.{'"'}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-xs text-muted-foreground">3 productos · 1 ajuste</p>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            Enviar por WhatsApp
          </span>
        </div>
      </div>
      <figcaption className="sr-only">
        Ejemplo de un pedido sugerido con cantidades, rangos y la explicación de cada número.
      </figcaption>
    </figure>
  )
}

function RangeBar({ min, max, value, suggested }: { min: number; max: number; value: number; suggested: number }) {
  const span = max - min
  const pad = span * 0.35
  const lo = min - pad
  const hi = max + pad
  const pct = (n: number) => `${((n - lo) / (hi - lo)) * 100}%`

  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-muted" aria-hidden="true">
      <div
        className="absolute inset-y-0 rounded-full bg-primary/25"
        style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }}
      />
      <div
        className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-muted-foreground/50"
        style={{ left: pct(suggested) }}
      />
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
        style={{ left: pct(value) }}
      />
    </div>
  )
}
