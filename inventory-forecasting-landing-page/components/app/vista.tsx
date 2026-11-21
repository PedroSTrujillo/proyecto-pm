'use client'

// Cómo ve cada persona la app: analista u operador, y el tiempo en días, semanas o meses con el
// horizonte del pronóstico. No cambia ningún cálculo (docs/modelo-rotacion.md, "Unidades al mostrar").

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { HORIZONTES, NOMBRE_UNIDAD, horizonteTexto, type Unidad } from '@/lib/formato'
import type { Perfil, RolEmpresa } from '@/lib/tipos'
import { useInventario } from './contexto'
import { Pildoras } from './ui'

export const TEXTO_PERFIL: Record<Perfil, { titulo: string; corto: string }> = {
  analista: { titulo: 'Analista', corto: 'Para ver el detalle: pronóstico, riesgo, cuánto pedir y dinero quieto.' },
  operador: { titulo: 'Operador', corto: 'Para registrar entradas y salidas y ver lo que se agota.' },
}

// Mismo orden que RANGO en server/cuentas.js: solo se actúa sobre alguien de rango menor al propio.
export const RANGO_ROL: Record<RolEmpresa, number> = { operador: 1, administrador: 2, gerente: 3 }

export const TEXTO_ROL: Record<RolEmpresa, { titulo: string; corto: string }> = {
  gerente: { titulo: 'Gerente', corto: 'Quien fundó la empresa. Ve y maneja todo, y su rol no se puede cambiar.' },
  administrador: { titulo: 'Administrador', corto: 'Ve el detalle, maneja proveedores y datos, e invita a operadores.' },
  operador: { titulo: 'Operador', corto: 'Se ocupa de registrar entradas y salidas y de ver lo que se agota.' },
}

// Solo para la demo: quien la prueba elige cómo verla. En una cuenta el rol lo da la invitación.
// Dos botones con una frase debajo: lo usan la demo (analista u operador) y el gerente (su vista).
function Segmentado<T extends string>({ etiqueta, opciones, valor, cambiar, corto, className }: {
  etiqueta: string
  opciones: { id: T; titulo: string }[]
  valor: T
  cambiar: (v: T) => void | Promise<void>
  corto: string
  className?: string
}) {
  const [cambiando, setCambiando] = useState(false)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 rounded-xl border border-border bg-muted p-1">
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            disabled={cambiando}
            onClick={async () => {
              if (o.id === valor) return
              setCambiando(true)
              try {
                await cambiar(o.id)
              } finally {
                setCambiando(false)
              }
            }}
            className={cn('presionable min-h-9 rounded-lg px-2 text-sm font-semibold transition-colors duration-150', valor === o.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {o.titulo}
          </button>
        ))}
      </div>
      <p className="px-1 text-nota leading-snug text-muted-foreground">{corto}</p>
    </div>
  )
}

// Solo para la demo: quien la prueba elige cómo verla. En una cuenta el rol lo da la invitación.
export function SelectorPerfil({ className }: { className?: string }) {
  const { perfil, cambiarPerfil } = useInventario()
  return (
    <Segmentado
      etiqueta="Cómo usa SINESC"
      opciones={(['analista', 'operador'] as const).map((id) => ({ id, titulo: TEXTO_PERFIL[id].titulo }))}
      valor={perfil}
      cambiar={cambiarPerfil}
      corto={TEXTO_PERFIL[perfil].corto}
      className={className}
    />
  )
}

// El gerente alterna entre el resumen de la empresa (principal) y el trabajo diario (maestro).
export type VistaGerente = 'principal' | 'maestro'

const TEXTO_VISTA_GERENTE: Record<VistaGerente, { titulo: string; corto: string }> = {
  principal: { titulo: 'Principal', corto: 'El resumen de la empresa, los pedidos y los reportes.' },
  maestro: { titulo: 'Maestro', corto: 'Todo lo del día a día: movimientos, existencias y datos.' },
}

export function SelectorVistaGerente({ vista, cambiar }: { vista: VistaGerente; cambiar: (v: VistaGerente) => void }) {
  return (
    <Segmentado
      etiqueta="Qué vista usa"
      opciones={(['principal', 'maestro'] as const).map((id) => ({ id, titulo: TEXTO_VISTA_GERENTE[id].titulo }))}
      valor={vista}
      cambiar={cambiar}
      corto={TEXTO_VISTA_GERENTE[vista].corto}
    />
  )
}

// Dónde empieza cada rol: el operador, por lo que registra; los demás, por el panel.
export const INICIO: Record<RolEmpresa, string> = { operador: '/movimientos', administrador: '/panel', gerente: '/panel' }

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
