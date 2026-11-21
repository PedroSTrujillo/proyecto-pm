'use client'

// El marco de la aplicación: menú lateral (en celular, una barra arriba con menú desplegable),
// el aviso de datos de ejemplo en la demo y el contenido.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'
import { ArrowLeftRight, Boxes, Building2, ClipboardList, Database, FlaskConical, LayoutDashboard, LogOut, Menu, Package, ShieldCheck, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInventario, useSesion } from './contexto'
import { reportarError } from './pantalla-error'
import { clasesBoton } from './ui'
import { INICIO, SelectorPerfil, SelectorVistaGerente, type VistaGerente } from './vista'
import type { Perfil, RolEmpresa } from '@/lib/tipos'

function Monograma({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M22 9.5h-8.5a3.25 3.25 0 0 0 0 6.5h5a3.25 3.25 0 0 1 0 6.5H10" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Marca({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg px-1 text-foreground" aria-label="SINESC, página principal">
      <Monograma />
      <span className="font-display text-xl font-extrabold tracking-tight">SINESC</span>
    </Link>
  )
}

// Al aprobar o devolver un pedido, el contador del menú se vuelve a pedir sin cambiar de pantalla.
export const EVENTO_POR_APROBAR = 'sinesc:por-aprobar'
const CLAVE_VISTA_GERENTE = 'sinesc-vista-gerente'

type Item = { href: string; texto: string; icono: ReactNode; exacto?: boolean; cuenta?: number }

function Navegacion({ items, alElegir }: { items: Item[]; alElegir?: () => void }) {
  const ruta = usePathname()!
  return (
    <nav aria-label="Secciones" className="flex flex-col gap-1">
      {items.map((it) => {
        const activo = it.exacto ? ruta === it.href : ruta === it.href || ruta.startsWith(`${it.href}/`)
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={alElegir}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 text-cuerpo font-semibold transition-colors duration-150',
              activo ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted hover:text-foreground',
            )}
          >
            <span className="[&_svg]:size-5">{it.icono}</span>
            {it.texto}
            {Boolean(it.cuenta) && (
              <span className={cn('ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-nota font-bold tabular-nums', activo ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground')}>
                {it.cuenta}<span className="sr-only"> por aprobar</span>
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

// Cada rol ve lo suyo (T3 de docs/PLAN_CAMBIOS_SINESC.md). La demo, sin cuenta, sigue el perfil que elige quien la prueba.
function itemsDe(demo: boolean, rutas: ReturnType<typeof useInventario>['rutas'], equipo: boolean, perfil: Perfil, rol: RolEmpresa | undefined, vista: VistaGerente): Item[] {
  const panel: Item = { href: rutas.panel, texto: perfil === 'operador' ? 'Resumen' : 'Panel', icono: <LayoutDashboard />, exacto: true }
  const diario: Item[] = demo ? [] : [
    { href: '/movimientos', texto: 'Movimientos', icono: <ArrowLeftRight /> },
    { href: '/existencias', texto: 'Existencias', icono: <Boxes /> },
  ]
  const resto: Item[] = [
    { href: rutas.productos, texto: 'Productos', icono: <Package /> },
    { href: rutas.pedido, texto: demo ? 'Preparar pedido' : 'Pedidos', icono: <ClipboardList /> },
    { href: rutas.datos, texto: 'Datos', icono: <Database /> },
  ]
  const [productos, pedidos, datos] = resto
  const [movimientos, existencias] = diario
  const empresa: Item = { href: '/empresa', texto: 'Mi empresa', icono: <Building2 /> }
  let base: Item[]
  if (demo) base = perfil === 'operador' ? [panel, ...resto] : [panel, productos, pedidos, datos]
  else if (rol === 'operador') base = [productos, movimientos, existencias, datos]
  else if (rol === 'gerente' && vista === 'principal') base = [panel, productos, pedidos, empresa]
  else base = [panel, productos, pedidos, movimientos, existencias, datos, empresa]
  if (!demo && equipo) base.push({ href: '/ejemplos', texto: 'Ejemplos', icono: <FlaskConical /> }, { href: '/cuentas', texto: 'Cuentas', icono: <ShieldCheck /> })
  if (!demo) base.push({ href: '/cuenta', texto: 'Mi cuenta', icono: <UserRound /> })
  return base
}

function Iniciales({ nombre }: { nombre: string }) {
  const ini = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
  return <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground">{ini || '·'}</span>
}

export function Marco({ children }: { children: ReactNode }) {
  const { fuente, rutas, inventario, perfil } = useInventario()
  const { usuario, salir } = useSesion()
  const demo = fuente.tipo === 'demo'
  const [porAprobar, setPorAprobar] = useState(0)
  // shortcut: la vista del gerente se guarda en este navegador y no se sincroniza entre dispositivos; subirla al servidor si lo piden.
  const [vistaGerente, setVistaGerente] = useState<VistaGerente>('principal')
  useEffect(() => {
    try { if (localStorage.getItem(CLAVE_VISTA_GERENTE) === 'maestro') setVistaGerente('maestro') } catch {}
  }, [])
  function elegirVista(v: VistaGerente) {
    setVistaGerente(v)
    try { localStorage.setItem(CLAVE_VISTA_GERENTE, v) } catch {}
  }
  const items = itemsDe(demo, rutas, usuario?.rol === 'equipo', perfil, usuario?.rolEmpresa, vistaGerente).map((it) => (it.href === '/pedidos' ? { ...it, cuenta: porAprobar } : it))
  const [abierto, setAbierto] = useState(false)
  const ruta = usePathname()!
  const aprueba = !demo && Boolean(usuario?.aprueba) && usuario?.rolEmpresa !== 'operador'

  useEffect(() => setAbierto(false), [ruta])
  // Cuántos pedidos esperan aprobación (D11): se vuelve a contar al cambiar de pantalla.
  useEffect(() => {
    if (!aprueba) return setPorAprobar(0)
    const contar = () => { api<{ pedidos: unknown[] }>('GET', '/pedidos/por-aprobar').then((r) => setPorAprobar(r.pedidos.length)).catch(() => {}) }
    contar()
    window.addEventListener(EVENTO_POR_APROBAR, contar)
    return () => window.removeEventListener(EVENTO_POR_APROBAR, contar)
  }, [aprueba, ruta])

  // Errores que no rompen la pantalla (por ejemplo, en un botón) también se le avisan al equipo.
  useEffect(() => {
    const alError = (e: ErrorEvent) => reportarError(e.error || e.message)
    const alRechazo = (e: PromiseRejectionEvent) => reportarError(e.reason)
    window.addEventListener('error', alError)
    window.addEventListener('unhandledrejection', alRechazo)
    return () => {
      window.removeEventListener('error', alError)
      window.removeEventListener('unhandledrejection', alRechazo)
    }
  }, [])

  const inicio = demo ? '/' : INICIO[usuario?.rolEmpresa ?? 'administrador']
  const persona = demo ? inventario?.fuente.persona || 'Datos de ejemplo' : usuario?.nombre || ''
  const empresa = demo ? inventario?.fuente.empresa || '' : usuario?.empresa && !usuario.empresa.vacia ? usuario.empresa.nombre : usuario?.email || ''

  const pie = (
    <div className="flex flex-col gap-2">
      {demo && <SelectorPerfil />}
      {usuario?.rolEmpresa === 'gerente' && <SelectorVistaGerente vista={vistaGerente} cambiar={elegirVista} />}
      <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
        <Iniciales nombre={persona} />
        <span className="flex min-w-0 flex-col">
          <strong className="truncate text-sm">{persona}</strong>
          <span className="truncate text-nota text-muted-foreground">{empresa}</span>
        </span>
      </div>
      {demo ? (
        <Link href="/demo" className="rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-muted">Ver otro negocio de ejemplo</Link>
      ) : (
        <button type="button" onClick={salir} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
          <LogOut className="size-4" /> Salir
        </button>
      )}
    </div>
  )

  return (
    <div className="tema-app min-h-dvh bg-background lg:flex lg:bg-[linear-gradient(to_right,var(--card)_calc(16rem-1px),var(--border)_calc(16rem-1px),var(--border)_16rem,transparent_16rem)]">
      {/* Menú lateral (escritorio). El fondo del contenedor sigue su franja hasta el final de una página larga. */}
      <aside className="no-imprimir hidden w-64 shrink-0 flex-col gap-7 border-r border-border bg-card px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <Marca href={inicio} />
        <Navegacion items={items} />
        <div className="mt-auto">{pie}</div>
      </aside>

      {/* Barra superior (celular y tableta) */}
      <div className="no-imprimir sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Marca href={inicio} />
        <button type="button" className={clasesBoton('fantasma', 'chico')} aria-expanded={abierto} aria-controls="menu-movil" onClick={() => setAbierto((v) => !v)}>
          {abierto ? <X className="size-5" /> : <Menu className="size-5" />}
          <span className="sr-only">{abierto ? 'Cerrar el menú' : 'Abrir el menú'}</span>
        </button>
      </div>
      {abierto && (
        <div className="fixed inset-0 z-20 lg:hidden">
          <button type="button" aria-label="Cerrar el menú" className="velo absolute inset-0 bg-foreground/30" onClick={() => setAbierto(false)} />
          <div id="menu-movil" className="aparecer absolute inset-x-0 top-[61px] flex flex-col gap-5 border-b border-border bg-card px-4 pt-3 pb-5 shadow-lg">
            <Navegacion items={items} alElegir={() => setAbierto(false)} />
            {pie}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {demo && <AvisoDemo />}
        <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-4 py-7 sm:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  )
}

function AvisoDemo() {
  const { inventario } = useInventario()
  return (
    <div className="no-imprimir border-b border-[#cfe5e1] bg-secondary">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 text-chico sm:px-8">
        <p className="text-[#0b3f3b]">
          <strong>Datos de ejemplo.</strong> <span className="hidden sm:inline">{inventario ? `${inventario.fuente.empresa} es un negocio inventado (${(inventario.fuente.sector || "").toLowerCase()}), armado con lo que nos contaron en las entrevistas.` : 'Un negocio inventado, armado con lo que nos contaron en las entrevistas.'}</span><span className="sm:hidden">Un negocio inventado.</span>
        </p>
        <div className="flex gap-2">
          <Link href="/demo" className={clasesBoton('secundario', 'chico')}>Otro negocio</Link>
          <Link href="/crear-cuenta" className={clasesBoton('primario', 'chico')}>Probar con mis datos</Link>
        </div>
      </div>
    </div>
  )
}
