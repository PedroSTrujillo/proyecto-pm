'use client'

// Estado compartido por las pantallas de la aplicación: de dónde salen los datos (la cuenta del
// usuario o un negocio de ejemplo), el inventario ya calculado y el pedido que se va armando.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { fijarUnidad, type Unidad } from '@/lib/formato'
import type { Inventario, Perfil, RespuestaInventario, Usuario } from '@/lib/tipos'

export type Fuente = { tipo: 'demo'; sector: string } | { tipo: 'cuenta' }

export function rutasDe(fuente: Fuente) {
  if (fuente.tipo === 'demo') {
    const b = `/demo/${fuente.sector}`
    return { panel: b, productos: `${b}/productos`, pedido: `${b}/pedido`, datos: `${b}/datos` }
  }
  return { panel: '/panel', productos: '/productos', pedido: '/pedidos', datos: '/datos' }
}

// --- Sesión ---------------------------------------------------------------------------------

type Sesion = { usuario: Usuario | null; cargando: boolean; fijar: (u: Usuario | null) => void; salir: () => Promise<void> }
const SesionCtx = createContext<Sesion>({ usuario: null, cargando: true, fijar: () => {}, salir: async () => {} })

export function SesionProvider({ children, exigir = false }: { children: ReactNode; exigir?: boolean }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const router = useRouter()
  const ruta = usePathname()!

  useEffect(() => {
    let vivo = true
    api<{ usuario: Usuario | null }>('GET', '/cuenta/yo')
      .then((r) => vivo && setUsuario(r.usuario))
      .catch(() => vivo && setUsuario(null))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (exigir && !cargando && !usuario) router.replace(`/entrar?volver=${encodeURIComponent(ruta)}`)
  }, [exigir, cargando, usuario, router, ruta])

  // Las sesiones de PostHog quedan atadas al número de cuenta y al rol, sin el correo ni el nombre.
  // window.posthog solo existe si PostHog está activo (instrumentation-client.ts).
  useEffect(() => {
    const ph = (window as unknown as { posthog?: { identify: (id: string, p: object) => void; reset: () => void } }).posthog
    if (!ph) return
    if (usuario) ph.identify(`u${usuario.id}`, { rol: usuario.rol, perfil: usuario.perfil, empresa: usuario.empresa ? `e${usuario.empresa.id}` : null })
    else if (!cargando) ph.reset()
  }, [usuario, cargando])

  useEffect(() => {
    const cerrada = () => setUsuario(null)
    window.addEventListener('sesion-cerrada', cerrada)
    return () => window.removeEventListener('sesion-cerrada', cerrada)
  }, [])

  const salir = useCallback(async () => {
    await api('POST', '/cuenta/salir').catch(() => {})
    setUsuario(null)
    router.replace('/entrar')
  }, [router])

  return <SesionCtx.Provider value={{ usuario, cargando, fijar: setUsuario, salir }}>{children}</SesionCtx.Provider>
}

export function useSesion() {
  return useContext(SesionCtx)
}

// --- Inventario --------------------------------------------------------------------------------

type EstadoInventario = {
  fuente: Fuente
  rutas: ReturnType<typeof rutasDe>
  respuesta: RespuestaInventario | null
  inventario: Inventario | null
  cargando: boolean
  error: string | null
  recargar: () => void
  // Lo que va en el pedido: código → cantidad. En la demo vive en este navegador; en una cuenta es
  // el pedido desde lo sugerido que está abierto (server/pedidos.js, /borrador).
  pedido: Record<string, number>
  ponerEnPedido: (codigo: string, cantidad: number) => void
  vaciarPedido: () => void
  // Tiempos de entrega y cada cuánto pide. En la demo se guardan en este navegador.
  guardarAjustes: (a: Ajustes) => Promise<void>
  // Analista u operador, la unidad de tiempo y el horizonte del pronóstico. En la cuenta se
  // guardan en el servidor; en la demo, en este navegador.
  perfil: Perfil
  unidad: Unidad
  horizonte: number
  cambiarPerfil: (p: Perfil) => Promise<void>
  cambiarTiempo: (t: { unidad?: Unidad; horizonte?: number }) => Promise<void>
}

export type Ajustes = Partial<{ entregas: Record<string, number>; entregasDias: Record<string, number>; entregaPorDefecto: number; entregaPorDefectoDias: number | null; cadaCuanto: number; semanasAgota: number; asignaciones: Record<string, string>; prefijos: { prefijo: string; proveedor: string }[] }>

const InventarioCtx = createContext<EstadoInventario | null>(null)

function leerGuardado<T = Record<string, number>>(llave: string): T | null {
  try {
    const t = window.localStorage.getItem(llave)
    return t ? JSON.parse(t) : null
  } catch {
    return null
  }
}

type Vista = { perfil: Perfil; unidad: Unidad; horizonte: number }
const VISTA_INICIAL: Vista = { perfil: 'analista', unidad: 'semanas', horizonte: 4 }

export function InventarioProvider({ fuente, children }: { fuente: Fuente; children: ReactNode }) {
  const { usuario, fijar } = useSesion()
  const llaveVista = fuente.tipo === 'demo' ? 'sinesc-vista-demo' : ''
  const [vistaDemo, setVistaDemo] = useState<Vista>(VISTA_INICIAL)
  useEffect(() => {
    if (llaveVista) setVistaDemo({ ...VISTA_INICIAL, ...(leerGuardado<Partial<Vista>>(llaveVista) || {}) })
  }, [llaveVista])
  const vista: Vista = fuente.tipo === 'cuenta' && usuario
    ? { perfil: usuario.perfil, unidad: usuario.preferencias.unidad, horizonte: usuario.preferencias.horizonte }
    : vistaDemo
  // Las funciones de lib/formato.ts dicen las duraciones en esta unidad.
  fijarUnidad(vista.unidad)

  const [respuesta, setRespuesta] = useState<RespuestaInventario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [pedido, setPedido] = useState<Record<string, number>>({})
  const cargadoPara = useRef<string | null>(null)
  const llave = fuente.tipo === 'demo' ? `sinesc-pedido-demo-${fuente.sector}` : ''
  const llaveAjustes = fuente.tipo === 'demo' ? `sinesc-ajustes-demo-${fuente.sector}` : ''
  const clave = `${fuente.tipo === 'demo' ? fuente.sector : 'cuenta'}|${vista.perfil}|${vista.horizonte}`
  const negocio = fuente.tipo === 'demo' ? fuente.sector : 'cuenta'
  const rutaDemo = (ajustes: Ajustes | null) => {
    const q = new URLSearchParams({ horizonte: String(vista.horizonte), ...(vista.perfil === 'operador' ? { perfil: 'operador' } : {}), ...(ajustes ? { ajustes: JSON.stringify(ajustes) } : {}) })
    return fuente.tipo === 'demo' ? `/demo/${fuente.sector}?${q}` : ''
  }

  useEffect(() => {
    let vivo = true
    // Otro negocio u otra cuenta: se muestra el esqueleto; si solo se recalcula (otro perfil u
    // horizonte, o datos nuevos), se deja lo que hay.
    if (cargadoPara.current !== negocio) {
      setRespuesta(null)
      setCargando(true)
    }
    setError(null)
    const ajustesDemo = llaveAjustes ? leerGuardado<Ajustes>(llaveAjustes) : null
    const ruta = fuente.tipo === 'demo' ? rutaDemo(ajustesDemo) : `/inventario?horizonte=${vista.horizonte}`
    api<RespuestaInventario | { inventario: Inventario }>('GET', ruta)
      .then((r) => {
        if (!vivo) return
        cargadoPara.current = negocio
        const resp: RespuestaInventario = 'puedeSubir' in r ? r : { inventario: r.inventario, puedeSubir: false, sugerencias: true, finPrueba: null }
        setRespuesta(resp)
        if (fuente.tipo === 'cuenta') {
          // Un operador no abre los pedidos (el servidor responde 403): no hay borrador que pedir.
          if (resp.inventario && usuario?.rolEmpresa !== 'operador') {
            api<{ pedido: { lineas: { codigo: string; cantidad: number | string }[] } | null }>('GET', '/pedidos/borrador')
              .then((b) => vivo && setPedido(Object.fromEntries((b.pedido?.lineas || []).map((l) => [l.codigo, Number(l.cantidad) || 0]))))
              .catch(() => {})
          }
          return
        }
        // En la demo, el pedido arranca con lo sugerido de lo que se agota o hay que pedir ya.
        const guardado = leerGuardado(llave)
        if (guardado) setPedido(guardado)
        else if (resp.inventario && resp.inventario.sugerencias) {
          const inicial: Record<string, number> = {}
          for (const p of resp.inventario.productos) if ((p.estado === 'agota' || p.estado === 'pide') && p.sugerido) inicial[p.codigo] = p.sugerido
          setPedido(inicial)
        }
      })
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, vuelta])

  const guardar = useCallback(
    (p: Record<string, number>) => {
      try {
        window.localStorage.setItem(llave, JSON.stringify(p))
      } catch {
        // sin almacenamiento: el pedido vive mientras la página esté abierta
      }
    },
    [llave],
  )

  const valor = useMemo<EstadoInventario>(
    () => ({
      fuente,
      rutas: rutasDe(fuente),
      respuesta,
      inventario: respuesta?.inventario ?? null,
      cargando,
      error,
      recargar: () => setVuelta((v) => v + 1),
      pedido,
      ponerEnPedido: (codigo, cantidad) => {
        setPedido((prev) => {
          const sig = { ...prev }
          if (cantidad > 0) sig[codigo] = Math.round(cantidad)
          else delete sig[codigo]
          if (fuente.tipo === 'demo') guardar(sig)
          return sig
        })
        if (fuente.tipo === 'cuenta') {
          const p = respuesta?.inventario?.productos.find((x) => x.codigo === codigo)
          api('POST', '/pedidos/borrador/linea', { codigo, cantidad: Math.max(0, Math.round(cantidad)), nombre: p?.nombre, proveedor: p && p.proveedor !== 'Sin proveedor' ? p.proveedor : undefined })
            .catch((e) => setError(e.message))
        }
      },
      vaciarPedido: () => {
        setPedido({})
        guardar({})
      },
      guardarAjustes: async (parcial) => {
        // Se manda lo que cambió junto con lo que ya había, para no borrar nada.
        const actuales = respuesta?.inventario?.ajustes
        const a: Ajustes = { ...(actuales ? { entregas: actuales.entregas, entregasDias: actuales.entregasDias, entregaPorDefecto: actuales.entregaPorDefecto, entregaPorDefectoDias: actuales.entregaPorDefectoDias, cadaCuanto: actuales.cadaCuanto, semanasAgota: actuales.semanasAgota, asignaciones: actuales.asignaciones, prefijos: actuales.prefijos } : {}), ...parcial }
        if (fuente.tipo === 'demo') {
          try {
            window.localStorage.setItem(llaveAjustes, JSON.stringify(a))
          } catch {
            // sin almacenamiento no se recuerdan, pero el cálculo de abajo sí los usa
          }
          const r = await api<{ inventario: Inventario }>('GET', rutaDemo(a))
          setRespuesta((prev) => (prev ? { ...prev, inventario: r.inventario } : prev))
          return
        }
        await api('PUT', '/inventario/ajustes', a)
        setVuelta((v) => v + 1)
      },
      ...vista,
      cambiarPerfil: async (perfil) => {
        // Solo la demo: en una cuenta el rol lo da la invitación y no se cambia a sí mismo.
        if (fuente.tipo === 'demo') guardarVistaDemo({ perfil })
      },
      cambiarTiempo: async (t) => {
        if (fuente.tipo === 'demo') return guardarVistaDemo(t)
        const r = await api<{ usuario: Usuario }>('PUT', '/cuenta/preferencias', t)
        fijar(r.usuario)
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fuente, respuesta, cargando, error, pedido, guardar, llaveAjustes, vista.perfil, vista.unidad, vista.horizonte, fijar],
  )

  function guardarVistaDemo(cambio: Partial<Vista>) {
    setVistaDemo((prev) => {
      const sig = { ...prev, ...cambio }
      try {
        window.localStorage.setItem(llaveVista, JSON.stringify(sig))
      } catch {
        // sin almacenamiento la elección dura mientras la página esté abierta
      }
      return sig
    })
  }

  return <InventarioCtx.Provider value={valor}>{children}</InventarioCtx.Provider>
}

export function useInventario() {
  const c = useContext(InventarioCtx)
  if (!c) throw new Error('useInventario fuera de InventarioProvider')
  return c
}
