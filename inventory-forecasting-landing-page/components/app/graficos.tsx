'use client'

// Gráficos hechos a mano en SVG: livianos, sin librerías y con los colores de la marca.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
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

// Un tope redondo para el eje (1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 o 10 por una potencia de 10).
function techo(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

type Punto = { inicio: string; valor: number; extra?: number }
type PuntoPronostico = { inicio: string; media: number; bajo: number; alto: number }

// Ancho real del contenedor: el SVG se dibuja a escala 1:1 para que el texto se lea igual en un
// computador que en un celular (si se encoge con el dibujo, queda de 5 a 7 px).
function useAncho(inicial = 640) {
  const [ancho, setAncho] = useState(inicial)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAncho(Math.max(260, Math.round(el.getBoundingClientRect().width)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}

/**
 * Ventas por semana (línea), pronóstico (línea punteada) y su rango probable (banda), con el
 * número del pronóstico escrito arriba. marcas: semanas resaltadas (por ejemplo, las de un
 * proyecto que no cuenta en el promedio).
 */
export function GraficoVentas({
  historia,
  pronostico,
  marcas = [],
  unidad = 'unidades',
  className,
  alto = 260,
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
  const { ref, ancho } = useAncho()
  const [foco, setFoco] = useState<number | null>(null)
  const n = historia.length + pronostico.length
  const geo = useMemo(() => {
    const max = techo(Math.max(1, ...historia.map((p) => p.valor), ...pronostico.map((p) => p.alto)) * 1.05)
    const marcasY = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f)
    const izq = 14 + 7.5 * Math.max(...marcasY.map((v) => numero(v).length))
    const der = 16
    const arriba = pronostico.length ? 46 : 16
    const abajo = 30
    const x = (i: number) => izq + (i * (ancho - izq - der)) / Math.max(n - 1, 1)
    const y = (v: number) => alto - abajo - (Math.max(v, 0) / max) * (alto - arriba - abajo)
    const linea = (pts: [number, number][]) => pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    const h0 = historia.length - 1
    const ultimo = historia[h0]?.valor ?? 0
    const pronosticoPts: [number, number][] = [[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.media] as [number, number])]
    const arribaPts = [[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.alto])] as [number, number][]
    const abajoPts = ([[h0, ultimo], ...pronostico.map((p, k) => [h0 + 1 + k, p.bajo])] as [number, number][]).reverse()
    const banda = [...arribaPts, ...abajoPts].map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    // Etiquetas de mes: la primera semana de cada mes, con al menos 56 px entre una y otra.
    const todas = [...historia.map((p) => p.inicio), ...pronostico.map((p) => p.inicio)]
    const meses: { i: number; texto: string }[] = []
    let ultimoMes = ''
    todas.forEach((t, i) => {
      if (!t) return
      const m = t.slice(0, 7)
      if (m !== ultimoMes) {
        ultimoMes = m
        if (!meses.length || x(i) - x(meses[meses.length - 1].i) >= 56) meses.push({ i, texto: mesCorto(sumarDias(t, 3)) })
      }
    })
    const mediaPronostico = pronostico.length ? pronostico.reduce((s, p) => s + p.media, 0) / pronostico.length : null
    return { marcasY, izq, der, arriba, abajo, x, y, historia: linea(historia.map((p, i) => [i, p.valor])), pronostico: linea(pronosticoPts), banda, meses, h0, mediaPronostico }
  }, [historia, pronostico, n, alto, ancho])

  const puntoFoco = foco === null ? null : foco < historia.length ? { tipo: 'h' as const, p: historia[foco] } : { tipo: 'p' as const, p: pronostico[foco - historia.length] }

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - geo.izq) / (ancho - geo.izq - geo.der)) * (n - 1))
    setFoco(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <svg
        width={ancho}
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        className="block max-w-full touch-pan-y"
        role="img"
        aria-label={descripcion}
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
      >
        <defs>
          <clipPath id={`${id}-area`}>
            <rect x={geo.izq} y={0} width={ancho - geo.izq - geo.der} height={alto - geo.abajo} />
          </clipPath>
        </defs>
        {geo.marcasY.map((v, k) => (
          <g key={k}>
            <line x1={geo.izq} x2={ancho - geo.der} y1={geo.y(v)} y2={geo.y(v)} stroke={k === 0 ? '#d1d5db' : '#eceee9'} />
            <text x={geo.izq - 8} y={geo.y(v) + 4} textAnchor="end" fontSize={12} fill="#4b5563">{numero(v)}</text>
          </g>
        ))}
        {marcas.map((i) => (
          <rect key={i} x={geo.x(i) - 4} y={geo.arriba} width={8} height={alto - geo.arriba - geo.abajo} fill="var(--ambar-fondo)" />
        ))}
        <g clipPath={`url(#${id}-area)`}>
          {pronostico.length > 0 && <polygon points={geo.banda} fill="var(--primary)" fillOpacity={0.14} />}
          <path d={geo.historia} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pronostico.length > 0 && <path d={geo.pronostico} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" />}
        </g>
        {pronostico.length > 0 && (
          <g>
            <line x1={geo.x(geo.h0)} x2={geo.x(geo.h0)} y1={geo.arriba - 4} y2={alto - geo.abajo} stroke="#9ca3af" strokeDasharray="3 4" />
            <text x={geo.x(geo.h0) - 6} y={geo.arriba - 10} textAnchor="end" fontSize={12} fill="#4b5563">hoy</text>
            {geo.mediaPronostico !== null && (
              <text x={ancho - geo.der} y={geo.arriba - 28} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--secondary-foreground)">
                ~{numero(geo.mediaPronostico > 100 ? Math.round(geo.mediaPronostico / 10) * 10 : Math.round(geo.mediaPronostico))} por semana
              </text>
            )}
          </g>
        )}
        {geo.meses.map((m) => (
          <text key={m.i} x={geo.x(m.i)} y={alto - 9} textAnchor="middle" fontSize={12} fill="#4b5563">{m.texto}</text>
        ))}
        {foco !== null && puntoFoco && (
          <g pointerEvents="none">
            <line x1={geo.x(foco)} x2={geo.x(foco)} y1={geo.arriba} y2={alto - geo.abajo} stroke="#111827" strokeOpacity={0.2} />
            <circle cx={geo.x(foco)} cy={geo.y(puntoFoco.tipo === 'h' ? puntoFoco.p.valor : puntoFoco.p.media)} r={5} fill="#fff" stroke="var(--primary)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {foco !== null && puntoFoco && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-[0.85rem] leading-snug text-background shadow-lg"
          style={{ left: `${Math.min(85, Math.max(15, (geo.x(foco) / ancho) * 100))}%` }}
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

export function LeyendaVentas({ conProyecto = false, conPronostico = true }: { conProyecto?: boolean; conPronostico?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--primary)" strokeWidth="2.5" /></svg>Vendido</span>
      {conPronostico && <span className="inline-flex items-center gap-2"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="5 4" /></svg>Pronóstico</span>}
      {conPronostico && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-sm bg-primary/20" />Rango probable: 8 de cada 10 semanas caen aquí</span>}
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
