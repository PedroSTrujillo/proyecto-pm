'use client'

import { useId, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, PackagePlus } from 'lucide-react'
import { productoEjemplo, SEMANAS_EJEMPLO } from '@/lib/ejemplo'
import {
  calcularRotacion,
  numero,
  semanas,
  ventasSemana,
  SEMANAS_HISTORICO_MINIMO,
  SEMANAS_SE_AGOTA,
  SEMANAS_SOBRA,
  type Rotacion,
} from '@/lib/rotacion'
import { cn } from '@/lib/utils'

type Values = {
  vendido: number
  semanasPeriodo: number
  existencias: number
}

const ejemplo = productoEjemplo('TOR-0610')

const initialValues: Values = {
  vendido: ejemplo.vendido,
  semanasPeriodo: SEMANAS_EJEMPLO,
  existencias: ejemplo.existencias,
}

const fields: { key: keyof Values; label: string; suffix: string }[] = [
  { key: 'vendido', label: 'Vendido en el periodo', suffix: 'unidades' },
  { key: 'semanasPeriodo', label: 'Semanas del periodo', suffix: 'semanas' },
  { key: 'existencias', label: 'Existencias hoy', suffix: 'unidades' },
]

export function WeeksCalculator() {
  const [values, setValues] = useState<Values>(initialValues)
  const baseId = useId()

  const vendido = safe(values.vendido)
  const semanasPeriodo = safe(values.semanasPeriodo)
  const existencias = safe(values.existencias)
  const r = calcularRotacion(vendido, semanasPeriodo, existencias)
  const alcanza = r.semanasInventario

  const barMax = Math.max(SEMANAS_SOBRA * 1.3, Math.min(alcanza ?? 0, 30) * 1.1)
  const pct = (n: number) => `${Math.min(100, (n / barMax) * 100)}%`

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_3px_rgb(16_24_40/0.08)] md:p-8">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Calculadora de semanas de inventario"
      >
        {fields.map((field) => {
          const inputId = `${baseId}-${field.key}`
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-sm font-semibold">
                {field.label}
              </label>
              <div className="flex items-center rounded-lg border border-input bg-background focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/50">
                <input
                  id={inputId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={1}
                  value={Number.isNaN(values[field.key]) ? '' : values[field.key]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.valueAsNumber }))}
                  className="h-10 w-full min-w-0 bg-transparent px-3 text-sm tabular-nums outline-none"
                />
                <span className="pr-3 text-xs text-muted-foreground">{field.suffix}</span>
              </div>
            </div>
          )
        })}
      </form>

      <div className="mt-8 border-t border-border pt-6" aria-live="polite">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat label="Ventas/semana" value={semanasPeriodo > 0 ? ventasSemana(r.promedioSemanal) : '—'} />
          <Stat
            label="Le alcanza para"
            value={!(semanasPeriodo > 0) ? '—' : alcanza === null ? 'Sin ventas' : `${semanas(alcanza)} semanas`}
            tono={r.estado === 'se_agota' ? 'rojo' : r.sobra ? 'azul' : undefined}
          />
        </div>

        <div className="mt-6" aria-hidden="true">
          <div className="relative h-3 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 bg-rojo-fondo" style={{ width: pct(SEMANAS_SE_AGOTA) }} />
            <div className="absolute inset-y-0 right-0 bg-azul-fondo" style={{ left: pct(SEMANAS_SOBRA) }} />
            {alcanza !== null ? (
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full',
                  r.estado === 'se_agota' ? 'bg-rojo' : r.sobra ? 'bg-azul' : 'bg-primary',
                )}
                style={{ width: alcanza === 0 ? '0.75rem' : pct(alcanza) }}
              />
            ) : null}
          </div>
          <div className="relative mt-2 h-4 text-xs text-muted-foreground">
            <span className="absolute left-0">0</span>
            <span className="absolute -translate-x-1/2" style={{ left: pct(SEMANAS_SE_AGOTA) }}>
              {SEMANAS_SE_AGOTA}
            </span>
            <span className="absolute -translate-x-1/2" style={{ left: pct(SEMANAS_SOBRA) }}>
              {SEMANAS_SOBRA}
            </span>
            <span className="absolute right-0">semanas</span>
          </div>
        </div>

        <Resultado r={r} semanasPeriodo={semanasPeriodo} existencias={existencias} />

        {semanasPeriodo > 0 && semanasPeriodo < SEMANAS_HISTORICO_MINIMO ? (
          <p className="mt-3 text-sm text-ambar">
            Con menos de {SEMANAS_HISTORICO_MINIMO} semanas de ventas el número es menos confiable. Lo ideal es uno o
            dos años.
          </p>
        ) : null}
        {existencias < 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Las existencias negativas se cuentan como 0.</p>
        ) : null}
      </div>
    </div>
  )
}

function Resultado({ r, semanasPeriodo, existencias }: { r: Rotacion; semanasPeriodo: number; existencias: number }) {
  if (!(semanasPeriodo > 0)) {
    return <Mensaje icono={Info}>Escriba cuántas semanas cubren esas ventas.</Mensaje>
  }
  const alcanza = r.semanasInventario

  if (alcanza === null) {
    return existencias > 0 ? (
      <Mensaje icono={PackagePlus} tono="azul">
        No se vendió nada en el periodo y tiene <strong>{numero(existencias)}</strong> en existencias. En SINESC
        aparecería al final, marcado como sobrante.
      </Mensaje>
    ) : (
      <Mensaje icono={Info}>Sin ventas y sin existencias: aquí no hay nada que calcular.</Mensaje>
    )
  }
  if (r.estado === 'se_agota') {
    return (
      <Mensaje icono={AlertTriangle} tono="rojo">
        {alcanza === 0
          ? 'No tiene existencias y el producto sí se vende. En SINESC aparecería de primero, en rojo.'
          : `Se agota: al ritmo actual de ventas no alcanza para ${SEMANAS_SE_AGOTA} semanas. En SINESC aparecería arriba, en rojo.`}
      </Mensaje>
    )
  }
  if (r.sobra) {
    const meses = Math.round((alcanza * 12) / 52)
    return (
      <Mensaje icono={PackagePlus} tono="azul">
        Sobra: tiene para <strong>{semanas(alcanza)} semanas</strong>,{' '}
        {meses < 24 ? `unos ${meses} meses` : 'más de dos años'}. En SINESC aparecería marcado en azul.
      </Mensaje>
    )
  }
  return (
    <Mensaje icono={CheckCircle2} tono="verde">
      Le alcanza para <strong>{semanas(alcanza)} semanas</strong>. Está entre {SEMANAS_SE_AGOTA} y {SEMANAS_SOBRA}, así
      que en SINESC aparecería sin resaltar.
    </Mensaje>
  )
}

function Mensaje({
  icono: Icono,
  tono,
  children,
}: {
  icono: typeof Info
  tono?: 'rojo' | 'azul' | 'verde'
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'mt-6 flex gap-3 rounded-xl border p-4 text-sm',
        tono === 'rojo' && 'border-rojo-borde bg-rojo-fondo text-[#7a1a12]',
        tono === 'azul' && 'border-azul-borde bg-azul-fondo text-[#163f80]',
        tono === 'verde' && 'border-primary/20 bg-secondary text-secondary-foreground',
        !tono && 'border-border bg-muted text-muted-foreground',
      )}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="leading-relaxed">{children}</p>
    </div>
  )
}

function safe(n: number) {
  return Number.isFinite(n) ? n : 0
}

function Stat({ label, value, tono }: { label: string; value: string; tono?: 'rojo' | 'azul' }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        tono === 'rojo' && 'border-rojo-borde bg-rojo-fondo',
        tono === 'azul' && 'border-azul-borde bg-azul-fondo',
        !tono && 'border-border bg-muted',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tracking-tight tabular-nums',
          tono === 'rojo' && 'text-rojo',
          tono === 'azul' && 'text-azul',
        )}
      >
        {value}
      </p>
    </div>
  )
}
