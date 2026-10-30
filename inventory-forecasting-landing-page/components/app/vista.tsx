'use client'

// Cómo ve cada persona la app: analista u operador, y el tiempo en días, semanas o meses con el
// horizonte del pronóstico. No cambia ningún cálculo (docs/modelo-rotacion.md, "Unidades al mostrar").

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { HORIZONTES, NOMBRE_UNIDAD, horizonteTexto, type Unidad } from '@/lib/formato'
import type { Perfil } from '@/lib/tipos'
import { useInventario } from './contexto'
import { Pildoras } from './ui'

export const TEXTO_PERFIL: Record<Perfil, { titulo: string; corto: string }> = {
  analista: { titulo: 'Analista', corto: 'Para ver el detalle: pronóstico, riesgo, cuánto pedir y dinero quieto.' },
  operador: { titulo: 'Operador', corto: 'Para registrar entradas y salidas y ver lo que se agota.' },
}

export function SelectorPerfil({ className }: { className?: string }) {
  const { perfil, cambiarPerfil } = useInventario()
  const [cambiando, setCambiando] = useState(false)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div role="radiogroup" aria-label="Cómo usa SINESC" className="grid grid-cols-2 rounded-xl border border-border bg-muted p-1">
        {(['analista', 'operador'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={perfil === p}
            disabled={cambiando}
            onClick={async () => {
              if (p === perfil) return
              setCambiando(true)
              try {
                await cambiarPerfil(p)
              } finally {
                setCambiando(false)
              }
            }}
            className={cn('presionable min-h-9 rounded-lg px-2 text-sm font-semibold transition-colors duration-150', perfil === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {TEXTO_PERFIL[p].titulo}
          </button>
        ))}
      </div>
      <p className="px-1 text-nota leading-snug text-muted-foreground">{TEXTO_PERFIL[perfil].corto}</p>
    </div>
  )
}

const cerca = (a: number, b: number) => Math.abs(a - b) < 0.05

export function SelectorTiempo({ conHorizonte = false, className }: { conHorizonte?: boolean; className?: string }) {
  const { unidad, horizonte, cambiarTiempo } = useInventario()
  const opciones = HORIZONTES[unidad]
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <Pildoras<Unidad>
        etiqueta="Ver el tiempo en"
        valor={unidad}
        onCambio={(u) => {
          // El horizonte se acomoda a una opción de la nueva unidad (la más cercana).
          const h = HORIZONTES[u].reduce((m, x) => (Math.abs(x - horizonte) < Math.abs(m - horizonte) ? x : m), HORIZONTES[u][0])
          cambiarTiempo({ unidad: u, ...(conHorizonte ? { horizonte: Math.round(h * 100) / 100 } : {}) })
        }}
        opciones={(['dias', 'semanas', 'meses'] as const).map((u) => ({ id: u, texto: NOMBRE_UNIDAD[u] }))}
      />
      {conHorizonte && (
        <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          Pronóstico a
          <select
            className="min-h-9 rounded-lg border border-input bg-card px-2 text-sm font-semibold text-foreground"
            value={String(opciones.find((x) => cerca(x, horizonte)) ?? horizonte)}
            onChange={(e) => cambiarTiempo({ horizonte: Math.round(Number(e.target.value) * 100) / 100 })}
          >
            {!opciones.some((x) => cerca(x, horizonte)) && <option value={String(horizonte)}>{horizonteTexto(horizonte)}</option>}
            {opciones.map((x) => <option key={x} value={String(x)}>{horizonteTexto(x)}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
