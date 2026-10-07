'use client'

import { useId, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

type Values = {
  weeklyDemand: number
  onHand: number
  bulkQty: number
  unitPrice: number
  discountPct: number
  shelfLifeWeeks: number
}

const initialValues: Values = {
  weeklyDemand: 28,
  onHand: 6,
  bulkQty: 120,
  unitPrice: 24000,
  discountPct: 8,
  shelfLifeWeeks: 4,
}

const fields: { key: keyof Values; label: string; suffix: string; step?: number }[] = [
  { key: 'weeklyDemand', label: 'Demanda semanal promedio', suffix: 'kg' },
  { key: 'onHand', label: 'Inventario actual', suffix: 'kg' },
  { key: 'bulkQty', label: 'Cantidad mínima para el descuento', suffix: 'kg' },
  { key: 'unitPrice', label: 'Precio por unidad', suffix: 'COP', step: 500 },
  { key: 'discountPct', label: 'Descuento ofrecido', suffix: '%', step: 0.5 },
  { key: 'shelfLifeWeeks', label: 'Vida útil', suffix: 'semanas' },
]

export function DiscountCalculator() {
  const [values, setValues] = useState<Values>(initialValues)
  const baseId = useId()

  const coverageWeeks = values.weeklyDemand > 0 ? (values.onHand + values.bulkQty) / values.weeklyDemand : 0
  const savings = values.bulkQty * values.unitPrice * (values.discountPct / 100)
  const hasShelfLife = values.shelfLifeWeeks > 0
  const exceedsShelfLife = hasShelfLife && coverageWeeks > values.shelfLifeWeeks
  const unitsAtRisk = exceedsShelfLife
    ? Math.max(0, values.onHand + values.bulkQty - values.weeklyDemand * values.shelfLifeWeeks)
    : 0
  const lossAtRisk = unitsAtRisk * values.unitPrice * (1 - values.discountPct / 100)
  const netBenefit = savings - lossAtRisk
  const barMax = Math.max(coverageWeeks, values.shelfLifeWeeks, 1) * 1.1

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} aria-label="Calculadora de descuento por volumen">
        {fields.map((field) => {
          const inputId = `${baseId}-${field.key}`
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-sm font-medium">
                {field.label}
              </label>
              <div className="flex items-center rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
                <input
                  id={inputId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={field.step ?? 1}
                  value={Number.isNaN(values[field.key]) ? '' : values[field.key]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.valueAsNumber }))}
                  className="h-10 w-full min-w-0 bg-transparent px-3 font-mono text-sm outline-none"
                />
                <span className="pr-3 text-xs text-muted-foreground">{field.suffix}</span>
              </div>
            </div>
          )
        })}
      </form>

      <div className="mt-8 border-t border-border pt-6" aria-live="polite">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Le dura" value={`${num.format(safe(coverageWeeks))} semanas`} />
          <Stat label="Ahorro por descuento" value={cop.format(safe(savings))} />
        </div>

        <div className="mt-6" aria-hidden="true">
          <div className="relative h-3 rounded-full bg-muted">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${exceedsShelfLife ? 'bg-destructive/70' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, (safe(coverageWeeks) / barMax) * 100)}%` }}
            />
            {hasShelfLife ? (
              <div
                className="absolute -top-1 h-5 w-0.5 bg-foreground"
                style={{ left: `${Math.min(100, (values.shelfLifeWeeks / barMax) * 100)}%` }}
              />
            ) : null}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Hoy</span>
            {hasShelfLife ? <span>Vida útil: {num.format(values.shelfLifeWeeks)} semanas</span> : null}
          </div>
        </div>

        {exceedsShelfLife ? (
          <div className="mt-6 flex gap-3 rounded-xl bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="leading-relaxed">
              Cuidado: al ritmo actual se le vencerían cerca de{' '}
              <strong className="font-mono">{num.format(unitsAtRisk)} kg</strong> ({cop.format(lossAtRisk)}).{' '}
              {netBenefit > 0
                ? `Aun así, el descuento le deja un beneficio neto de ${cop.format(netBenefit)}.`
                : `El descuento no compensa la pérdida: saldría perdiendo ${cop.format(Math.abs(netBenefit))}.`}
            </p>
          </div>
        ) : (
          <div className="mt-6 flex gap-3 rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              El pedido se consume antes de su vida útil. El descuento le ahorra{' '}
              <strong className="font-mono">{cop.format(safe(savings))}</strong> sin riesgo de vencimiento.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function safe(n: number) {
  return Number.isFinite(n) ? n : 0
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
