'use client'

// Gráficos hechos a mano en SVG: livianos, sin librerías y con los colores de la marca.

import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { fechaCorta, mesCorto, numero, sumarDias } from '@/lib/formato'

export function Sparkline({ valores, className, color = 'var(--primary)' }: { valores: number[]; className?: string; color?: string }) {
  if (!valores.length) return <svg className={className} aria-hidden="true" />
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const d = valores
    .map((v, i) => `${i ? 'L' : 'M'}${((i * 100) / Math.max(valores.length - 1, 1)).toFixed(1)} ${(27 - ((v - min) / (max - min || 1)) * 24).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn('h-7 w-24', className)} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function techo(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

type Punto = { inicio: string; valor: number; extra?: number }
type PuntoPronostico = { inicio: string; media: number; bajo: number; alto: number }

/**
 * Ventas por semana (línea), pronóstico (línea punteada) y su rango probable (banda).
 * marcas: semanas resaltadas (por ejemplo, las de un proyecto que no cuenta en el promedio).
 */
export function GraficoVentas({
  historia,
  pronostico,
  marcas = [],
  unidad = 'unidades',
  className,
  alto = 240,
  descripcion,
}: {
  historia: Punto[]
  pronostico: PuntoPronostico[]
  marcas?: number[]
  unidad?: string
  className?: string
  alto?: number
  descripcion: string
}) {
  const id = useId()
  const [foco, setFoco] = useState<number | null>(null)
  const ancho = 800
  const izq = 46
  const der = 14
  const arriba = 18
  const abajo = 30
  const n = historia.length + pronostico.length
  const geo = useMemo(() => {
    const max = techo(Math.max(1, ...historia.map((p) => p.valor), ...pronostico.map((p) => p.alto)) * 1.05)
    const x = (i: number) => izq + (i * (ancho - izq - der)) / Math.max(n - 1, 1)
    const y = (v: number) => alto - abajo - (Math.max(v, 0) / max) * (alto - arriba - abajo)
    const linea = (pts: [number, number][]) => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    const h0 = historia.length - 1
    const ultimo = historia[h0]?.valor ?? 0
    const pronosticoPts: [number, number][] = [[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.media] as [number, number])]
    const arribaPts = [[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.alto])] as [number, number][]
    const abajoPts = ([[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.bajo])] as [number, number][]).reverse()
    const banda = [...arribaPts, ...abajoPts].map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    // Etiquetas de mes: la primera semana de cada mes, espaciadas para que no se monten.
    const todas = [...historia.map((p) => p.inicio), ...pronostico.map((p) => p.inicio)]
    const meses: { i: number; texto: string }[] = []
    let ultimoMes = ''
    todas.forEach((t, i) => {
      if (!t) return
      const m = t.slice(0, 7)
      if (m !== ultimoMes) {
        ultimoMes = m
        if (!meses.length || i - meses[meses.length - 1].i >= Math.max(3, Math.round(n / 9))) meses.push({ i, texto: mesCorto(sumarDias(t, 3)) })
      }
    })
    return { max, x, y, historia: linea(historia.map((p, i) => [i, p.valor])), pronostico: linea(pronosticoPts), banda, meses, h0 }
  }, [historia, pronostico, n, alto])

  const puntoFoco = foco === null ? null : foco < historia.length ? { tipo: 'h' as const, p: historia[foco] } : { tipo: 'p' as const, p: pronostico[foco - historia.length] }

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * ancho
    const i = Math.round(((px - izq) / (ancho - izq - der)) * (n - 1))
    setFoco(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="block h-auto w-full touch-pan-y"
        role="img"
        aria-label={descripcion}
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
      >
        <defs>
          <clipPath id={`${id}-area`}>
            <rect x={izq} y={0} width={ancho - izq - der} height={alto - abajo} />
          </clipPath>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={izq} x2={ancho - der} y1={geo.y(geo.max * f)} y2={geo.y(geo.max * f)} stroke={f === 0 ? '#e5e7eb' : '#f0f1ee'} />
            <text x={izq - 8} y={geo.y(geo.max * f) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{numero(geo.max * f)}</text>
          </g>
        ))}
        {marcas.map((i) => (
          <rect key={i} x={geo.x(i) - 5} y={arriba} width={10} height={alto - arriba - abajo} fill="var(--ambar-fondo)" />
        ))}
        <g clipPath={`url(#${id}-area)`}>
          {pronostico.length > 0 && <polygon points={geo.banda} fill="var(--primary)" fillOpacity={0.13} />}
          <path d={geo.historia} fill="none" stroke="var(--primary)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {pronostico.length > 0 && <path d={geo.pronostico} fill="none" stroke="var(--primary)" strokeWidth={2.4} strokeDasharray="6 6" strokeLinecap="round" />}
        </g>
        {pronostico.length > 0 && (
          <g>
            <line x1={geo.x(geo.h0)} x2={geo.x(geo.h0)} y1={arriba - 6} y2={alto - abajo} stroke="#9ca3af" strokeDasharray="3 4" />
            <text x={geo.x(geo.h0)} y={arriba - 8} textAnchor="middle" fontSize={11} fill="#4b5563">hoy</text>
          </g>
        )}
        {geo.meses.map((m) => (
          <text key={m.i} x={geo.x(m.i)} y={alto - 9} textAnchor="middle" fontSize={11} fill="#6b7280">{m.texto}</text>
        ))}
        {foco !== null && puntoFoco && (
          <g pointerEvents="none">
            <line x1={geo.x(foco)} x2={geo.x(foco)} y1={arriba} y2={alto - abajo} stroke="#111827" strokeOpacity={0.18} />
            <circle cx={geo.x(foco)} cy={geo.y(puntoFoco.tipo === 'h' ? puntoFoco.p.valor : puntoFoco.p.media)} r={4.5} fill="#fff" stroke="var(--primary)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {foco !== null && puntoFoco && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-[0.8rem] leading-snug text-background shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, (geo.x(foco) / ancho) * 100))}%` }}
        >
          <span className="block text-background/70">Semana del {fechaCorta(puntoFoco.p.inicio)}</span>
          {puntoFoco.tipo === 'h' ? (
            <span className="font-semibold tabular-nums">
              {numero(puntoFoco.p.valor)} {unidad}
              {puntoFoco.p.extra ? <span className="block font-normal text-[#fcd9a8]">{numero(puntoFoco.p.extra)} de un proyecto</span> : null}
            </span>
          ) : (
            <span className="font-semibold tabular-nums">
              Entre {numero(puntoFoco.p.bajo)} y {numero(puntoFoco.p.alto)}
              <span className="block font-normal text-background/70">lo más probable: {numero(puntoFoco.p.media)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function LeyendaVentas({ conProyecto = false }: { conProyecto?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--primary)" strokeWidth="2.5" /></svg>Vendido</span>
      <span className="inline-flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="5 4" /></svg>Pronóstico</span>
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-primary/20" />Rango probable: 8 de cada 10 semanas caen aquí</span>
      {conProyecto && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-ambar-fondo ring-1 ring-ambar-borde" />Venta de un proyecto</span>}
    </div>
  )
}

// Barra de probabilidad (0 a 1).
export function BarraRiesgo({ valor, className }: { valor: number | null; className?: string }) {
  if (valor === null) return <span className="text-muted-foreground">—</span>
  const pct = Math.round(valor * 100)
  const color = pct >= 70 ? 'bg-rojo' : pct >= 30 ? 'bg-ambar' : 'bg-primary'
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-2 rounded-full', color)} style={{ width: `${Math.max(pct, 2)}%` }} />
      </span>
      <span className="w-11 text-right text-sm font-bold tabular-nums">{pct} %</span>
    </span>
  )
}
