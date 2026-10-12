'use client'

// Piezas pequeñas de la aplicación: botones, tarjetas, etiquetas de estado y mensajes.

import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Estado } from '@/lib/tipos'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'
type Tamano = 'normal' | 'chico'

const variantes: Record<Variante, string> = {
  primario: 'bg-primary text-primary-foreground border-primary hover:bg-primary-hover hover:border-primary-hover',
  secundario: 'bg-card text-foreground border-input hover:bg-muted',
  fantasma: 'bg-transparent text-foreground border-transparent hover:bg-muted',
  peligro: 'bg-card text-rojo-texto border-rojo-borde hover:bg-rojo-fondo',
}
const tamanos: Record<Tamano, string> = {
  normal: 'min-h-11 px-4 text-[0.95rem] gap-2 rounded-xl',
  chico: 'min-h-9 px-3 text-sm gap-1.5 rounded-lg',
}

export function clasesBoton(variante: Variante = 'secundario', tamano: Tamano = 'normal', extra?: string) {
  return cn(
    'presionable inline-flex select-none items-center justify-center border font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-[1.1em] [&_svg]:shrink-0',
    variantes[variante],
    tamanos[tamano],
    extra,
  )
}

export function Boton({ variante = 'secundario', tamano = 'normal', className, ...props }: ComponentProps<'button'> & { variante?: Variante; tamano?: Tamano }) {
  return <button type="button" className={clasesBoton(variante, tamano, className)} {...props} />
}

export function BotonEnlace({ variante = 'secundario', tamano = 'normal', className, ...props }: ComponentProps<typeof Link> & { variante?: Variante; tamano?: Tamano }) {
  return <Link className={clasesBoton(variante, tamano, className)} {...props} />
}

export function Tarjeta({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-2xl border border-border bg-card', className)} {...props} />
}

export function Titulo({ children, sub, acciones, etiqueta }: { children: ReactNode; sub?: ReactNode; acciones?: ReactNode; etiqueta?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {etiqueta}
        <h1 className="text-[1.9rem] leading-tight font-extrabold sm:text-[2.1rem]">{children}</h1>
        {sub && <p className="text-muted-foreground">{sub}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2.5">{acciones}</div>}
    </header>
  )
}

export const ESTADOS: Record<Estado, { texto: string; chip: string; numero: string; barra: string; descripcion: string }> = {
  agota: { texto: 'Se agota', chip: 'bg-rojo-fondo text-rojo-texto', numero: 'text-rojo', barra: 'bg-rojo', descripcion: 'Te alcanza para menos de 2 semanas.' },
  pide: { texto: 'Pide ya', chip: 'bg-ambar-fondo text-ambar-texto', numero: 'text-ambar', barra: 'bg-ambar', descripcion: 'Te alcanza para menos de lo que tarda en llegar un pedido.' },
  normal: { texto: 'Normal', chip: 'bg-muted text-foreground/80', numero: 'text-foreground', barra: 'bg-primary', descripcion: 'Bien surtido.' },
  sobra: { texto: 'Sobra', chip: 'bg-azul-fondo text-azul-texto', numero: 'text-azul', barra: 'bg-azul', descripcion: 'Tienes para más de 12 semanas.' },
  sin_ventas: { texto: 'Sin ventas', chip: 'bg-azul-fondo text-azul-texto', numero: 'text-muted-foreground', barra: 'bg-muted-foreground', descripcion: 'No se vendió en el periodo del archivo.' },
}

export function ChipEstado({ estado, className, texto }: { estado: Estado; className?: string; texto?: string }) {
  const e = ESTADOS[estado]
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', e.chip, className)}>{texto || e.texto}</span>
}

type TonoAviso = 'info' | 'ok' | 'error' | 'cuidado'
const tonos: Record<TonoAviso, string> = {
  info: 'border-[#cfe5e1] bg-secondary text-[#0b3f3b]',
  ok: 'border-verde-borde bg-verde-fondo text-[#14532d]',
  error: 'border-rojo-borde bg-rojo-fondo text-rojo-texto',
  cuidado: 'border-ambar-borde bg-ambar-fondo text-ambar-texto',
}

export function Aviso({ tono = 'info', children, className, titulo }: { tono?: TonoAviso; children?: ReactNode; className?: string; titulo?: ReactNode }) {
  return (
    <div role={tono === 'error' ? 'alert' : 'status'} className={cn('aparecer rounded-xl border px-4 py-3 text-[0.95rem]', tonos[tono], className)}>
      {titulo && <p className="font-bold">{titulo}</p>}
      {children}
    </div>
  )
}

export function ErrorLista({ mensaje, lista }: { mensaje: string; lista?: string[] }) {
  return (
    <Aviso tono="error" titulo={mensaje}>
      {lista && lista.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {lista.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}
          {lista.length > 12 && <li>…y {lista.length - 12} más.</li>}
        </ul>
      )}
    </Aviso>
  )
}

// Botones de opción tipo píldora (filtros, series del gráfico).
export function Pildoras<T extends string>({ opciones, valor, onCambio, etiqueta, className }: { opciones: { id: T; texto: ReactNode; cuenta?: number }[]; valor: T; onCambio: (v: T) => void; etiqueta: string; className?: string }) {
  return (
    <div role="group" aria-label={etiqueta} className={cn('flex flex-wrap gap-2', className)}>
      {opciones.map((o) => {
        const activo = o.id === valor
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(o.id)}
            className={cn(
              'presionable inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold',
              activo ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card text-foreground/80 hover:bg-muted',
            )}
          >
            {o.texto}
            {o.cuenta !== undefined && <span className={cn('tabular-nums', activo ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{o.cuenta}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} />
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{texto}</span>
      <Esqueleto className="h-10 w-72" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-32" />)}
      </div>
      <Esqueleto className="h-80" />
    </div>
  )
}

// El texto aparece debajo, a lo ancho del contenedor más cercano con posición relativa (la tarjeta):
// así no se sale de la pantalla en celular.
export function Ayuda({ texto }: { texto: string }) {
  return (
    <span className="group inline-flex">
      <button type="button" aria-label={texto} className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-[0.8rem] font-bold text-muted-foreground hover:text-foreground">
        ?
      </button>
      <span role="tooltip" className="pointer-events-none absolute inset-x-3 top-12 z-20 rounded-xl bg-foreground px-3 py-2 text-left text-[0.85rem] leading-snug font-normal text-background opacity-0 shadow-lg transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        {texto}
      </span>
    </span>
  )
}

// Campo de formulario con su etiqueta encima.
export function Campo({ etiqueta, nota, children, className }: { etiqueta: ReactNode; nota?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-[0.95rem] font-semibold', className)}>
      <span>
        {etiqueta}
        {nota && <span className="ml-1 font-normal text-muted-foreground">{nota}</span>}
      </span>
      {children}
    </label>
  )
}

export const claseEntrada =
  'min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base font-normal text-foreground placeholder:text-muted-foreground/80 focus:border-primary focus:outline-3 focus:outline-ring disabled:bg-muted'
