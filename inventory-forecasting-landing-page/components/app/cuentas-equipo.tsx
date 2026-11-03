'use client'

// Cuentas, para el equipo (server/cuentas-equipo.js): cómo va cada cuenta que usa la app y, cuando
// la persona lo pide, borrar su cuenta con sus datos. Borrar pide el correo exacto de la cuenta y
// la contraseña de quien borra; la ventana muestra antes qué se va y qué se queda.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, LogOut, RefreshCw, Search, Trash2 } from 'lucide-react'
import { api, textoErrores } from '@/lib/api'
import { fecha, fechaHora, numero } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { useSesion } from './contexto'
import { useConfirmar } from './confirmar'
import { Aviso, Boton, Cargando, ErrorLista, Pildoras, Tarjeta, Titulo, claseEntrada, diasDesde } from './ui'

type EstadoCuenta = 'activa' | 'en_riesgo' | 'inactiva' | 'sin_datos' | 'equipo'
type Cuenta = {
  id: number
  nombre: string
  email: string
  rol: 'usuario' | 'equipo'
  perfil: 'analista' | 'operador'
  cargo: string
  sistema: string | null
  creadoEn: string
  boletin: boolean
  empresa: { id: number; nombre: string; vacia: boolean; miembros: number; admin: boolean; aprueba: boolean; invitaciones: { creadas: number; aceptadas: number } } | null
  ultimoIngreso: string | null
  ultimaActividad: string | null
  ingresos: number
  diasActivos: number
  pedidos: number
  pedidosCerrados: number
  archivos: number
  movimientos: number
  ultimoArchivo: string | null
  sesionesAbiertas: number
  estado: EstadoCuenta
}
type Resumen = Record<EstadoCuenta | 'total', number> & {
  loop: { creadas: number; aceptadas: number; empresasQueInvitaron: number; porCuentaActiva: number | null }
}
type Detalle = {
  miembros: { id: number; nombre: string; email: string; perfil: string; admin: boolean; aprueba: boolean; esEsta: boolean }[]
  pedidos: { id: number; numero: number | null; modo: 'lista' | 'sugerido'; creadoEn: string; terminadoEn: string | null; lineas: number; estado: 'abierto' | 'por_aprobar' | 'cerrado' | 'anulado' | 'borrado' }[]
  actividad: { tipo: string; en: string; como: string | null }[]
}
type Previa = {
  cuenta: { id: number; nombre: string; email: string }
  pedidos: number
  archivos: number
  archivosQuedan: number
  eventos: number
  empresa: { nombre: string; sigue: boolean; otros: number; productos: number; movimientos: number; recibe: string | null; nuevoAdmin: boolean } | null
  impedimento: string | null
}

const ESTADO: Record<EstadoCuenta, { texto: string; chip: string; descripcion: string }> = {
  activa: { texto: 'Activa', chip: 'bg-verde-fondo text-[#14532d] border-verde-borde', descripcion: 'Hizo algo en los últimos 7 días' },
  en_riesgo: { texto: 'Sin volver', chip: 'bg-ambar-fondo text-ambar-texto border-ambar-borde', descripcion: 'Su última actividad fue hace 8 a 30 días' },
  inactiva: { texto: 'Inactiva', chip: 'bg-rojo-fondo text-rojo-texto border-rojo-borde', descripcion: 'Lleva más de 30 días sin entrar' },
  sin_datos: { texto: 'Sin datos', chip: 'bg-muted text-foreground/75 border-border', descripcion: 'Creó la cuenta, pero no ha subido archivos, pedidos ni movimientos' },
  equipo: { texto: 'Equipo', chip: 'bg-azul-fondo text-azul-texto border-azul-borde', descripcion: 'Cuenta del equipo: no cuenta en los resultados' },
}

const EVENTOS: Record<string, string> = {
  cuenta_creada: 'Creó la cuenta',
  ingreso: 'Entró',
  salida: 'Cerró sesión',
  archivo_subido: 'Subió un archivo',
  export_reusado: 'Usó el último archivo',
  pedido_iniciado: 'Empezó un pedido',
  lista_inicial_guardada: 'Guardó la lista inicial',
  reporte_visto: 'Vio el reporte',
  lista_final_guardada: 'Guardó la lista final',
  pedido_terminado: 'Terminó un pedido',
  pedido_enviado: 'Envió un pedido a aprobación',
  pedido_aprobado: 'Aprobó un pedido',
  pedido_devuelto: 'Devolvió un pedido',
  pedido_recibido: 'Registró la llegada de un pedido',
  pedido_borrado: 'Borró un pedido',
  pedido_anulado: 'Se anuló un pedido',
  pedido_reactivado: 'Se reactivó un pedido',
  movimientos_registrados: 'Registró movimientos',
  movimiento_anulado: 'Anuló un movimiento',
  producto_creado: 'Creó un producto',
  producto_editado: 'Editó un producto',
  catalogo_editado: 'Editó el catálogo',
  perfil_cambiado: 'Cambió de perfil',
  boletin_activado: 'Activó el boletín',
  boletin_desactivado: 'Desactivó el boletín',
  boletin_enviado: 'Recibió el boletín',
  invitacion_creada: 'Invitó a alguien a su empresa',
  miembro_editado: 'Cambió los permisos de alguien',
  miembro_retirado: 'Retiró a alguien de su empresa',
  empresa_actualizada: 'Editó los datos de su empresa',
  logo_subido: 'Subió el logo',
  logo_quitado: 'Quitó el logo',
  clave_cambiada: 'Cambió su contraseña',
  clave_restablecida: 'Restableció su contraseña',
  recordatorio_respondido: 'Respondió el recordatorio',
  recordatorio_enviado: 'Recibió el recordatorio',
  calendario_descargado: 'Descargó el recordatorio',
  umbral_elegido: 'Cambió el umbral de “se agota”',
  cuenta_borrada: 'Borró una cuenta',
  sesiones_cerradas: 'Cerró las sesiones de una cuenta',
}
const COMO: Record<string, string> = {
  inicio_sesion: 'con su contraseña',
  volvio_con_sesion_abierta: 'con la sesión abierta',
  boletin: 'desde el boletín',
  cuenta_nueva: 'al crear la cuenta',
  invitacion: 'con una invitación',
  empresa_nueva: 'con una empresa nueva',
}
const PEDIDO: Record<Detalle['pedidos'][number]['estado'], string> = {
  abierto: 'Abierto',
  por_aprobar: 'Por aprobar',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
  borrado: 'Borrado',
}

function hace(v: string | null) {
  if (!v) return 'Nunca'
  const d = diasDesde(v)
  return d === 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${numero(d)} días`
}

function ChipCuenta({ estado }: { estado: EstadoCuenta }) {
  const e = ESTADO[estado]
  return <span title={e.descripcion} className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-nota font-semibold whitespace-nowrap', e.chip)}>{e.texto}</span>
}

type Filtro = 'todas' | EstadoCuenta

export function CuentasEquipo() {
  const { usuario } = useSesion()
  const [datos, setDatos] = useState<{ cuentas: Cuenta[]; resumen: Resumen; generadoEn: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [borrando, setBorrando] = useState<Cuenta | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [cargando, setCargando] = useState(false)
  const { ventana, preguntar } = useConfirmar()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setDatos(await api('GET', '/equipo/cuentas'))
      setError(null)
    } catch (e) {
      setError(textoErrores(e).mensaje)
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    if (!datos) return []
    const q = busca.trim().toLowerCase()
    return datos.cuentas
      .filter((c) => filtro === 'todas' || c.estado === filtro)
      .filter((c) => !q || [c.nombre, c.email, c.empresa?.nombre || ''].some((t) => t.toLowerCase().includes(q)))
  }, [datos, filtro, busca])

  async function cerrarSesiones(c: Cuenta) {
    const si = await preguntar(
      `¿Cerrar las sesiones de ${c.nombre}?`,
      <p>Tendrá que volver a entrar con su contraseña en cada equipo donde tenga SINESC abierto. Sus datos se quedan como están.</p>,
      'Sí, cerrar sesiones',
      true,
    )
    if (!si) return
    try {
      const r = await api<{ cerradas: number }>('POST', `/equipo/cuentas/${c.id}/cerrar-sesiones`)
      setAviso({ ok: true, texto: r.cerradas ? `Se cerraron ${r.cerradas} sesión(es) de ${c.nombre}.` : `${c.nombre} no tenía sesiones abiertas.` })
      cargar()
    } catch (e) {
      setAviso({ ok: false, texto: textoErrores(e).mensaje })
    }
  }

  if (error && !datos) return <ErrorLista mensaje={error} />
  if (!datos) return <Cargando texto="Cargando las cuentas…" />

  const r = datos.resumen
  const opciones: { id: Filtro; texto: string; cuenta: number }[] = [
    { id: 'todas', texto: 'Todas', cuenta: datos.cuentas.length },
    { id: 'activa', texto: 'Activas', cuenta: r.activa },
    { id: 'en_riesgo', texto: 'Sin volver', cuenta: r.en_riesgo },
    { id: 'inactiva', texto: 'Inactivas', cuenta: r.inactiva },
    { id: 'sin_datos', texto: 'Sin datos', cuenta: r.sin_datos },
    { id: 'equipo', texto: 'Equipo', cuenta: r.equipo },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Titulo
        sub="Solo lo ve el equipo. Muestra actividad y conteos de cada cuenta, nunca su inventario."
        acciones={<Boton tamano="chico" onClick={cargar} disabled={cargando}><RefreshCw className={cn(cargando && 'animate-spin')} /> Actualizar</Boton>}
      >
        Cuentas
      </Titulo>

      {aviso && <Aviso tono={aviso.ok ? 'ok' : 'error'} titulo={aviso.texto} />}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['Cuentas de clientes', r.total, 'Sin contar al equipo'],
          ['Activas', r.activa, ESTADO.activa.descripcion],
          ['Sin volver', r.en_riesgo, ESTADO.en_riesgo.descripcion],
          ['Inactivas o sin datos', r.inactiva + r.sin_datos, 'Más de 30 días sin entrar, o nada subido'],
        ] as const).map(([t, n, d]) => (
          <div key={t} className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
            <dt className="text-sm font-semibold text-muted-foreground">{t}</dt>
            <dd className="font-display text-3xl font-extrabold tabular-nums">{numero(n)}</dd>
            <dd className="text-nota text-muted-foreground">{d}</dd>
          </div>
        ))}
      </dl>

      <Tarjeta className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex flex-col gap-0.5 sm:w-56 sm:shrink-0">
          <h2 className="font-bold">Invitaciones a su equipo</h2>
          <p className="text-nota text-muted-foreground">El growth loop: una persona invita a otra de su empresa desde “Mi empresa”.</p>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['Enviadas', numero(r.loop.creadas)],
            ['Aceptadas', numero(r.loop.aceptadas)],
            ['Empresas que invitaron', numero(r.loop.empresasQueInvitaron)],
            ['Aceptadas por cuenta activa', r.loop.porCuentaActiva === null ? '—' : numero(r.loop.porCuentaActiva, 2)],
          ] as const).map(([t, v]) => (
            <div key={t}><dt className="text-nota text-muted-foreground">{t}</dt><dd className="font-display text-2xl font-extrabold tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </Tarjeta>

      <div className="flex flex-col gap-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Buscar por nombre, correo o empresa</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" className={cn(claseEntrada, 'w-full pl-10')} placeholder="Buscar por nombre, correo o empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <Pildoras etiqueta="Filtrar por estado" opciones={opciones} valor={filtro} onCambio={setFiltro} />
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">No hay cuentas que coincidan con la búsqueda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibles.map((c) => (
            <FilaCuenta
              key={c.id}
              c={c}
              esYo={c.id === usuario?.id}
              abierta={abierta === c.id}
              alAbrir={() => setAbierta(abierta === c.id ? null : c.id)}
              alBorrar={() => { setAviso(null); setBorrando(c) }}
              alCerrarSesiones={() => cerrarSesiones(c)}
            />
          ))}
        </ul>
      )}
      <p className="text-nota text-muted-foreground">Actualizado {fechaHora(datos.generadoEn)}.</p>

      {borrando && (
        <VentanaBorrar
          c={borrando}
          alCerrar={() => setBorrando(null)}
          alBorrar={(texto) => {
            setBorrando(null)
            setAbierta(null)
            setAviso({ ok: true, texto })
            cargar()
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )}
      {ventana}
    </div>
  )
}

function FilaCuenta({ c, esYo, abierta, alAbrir, alBorrar, alCerrarSesiones }: { c: Cuenta; esYo: boolean; abierta: boolean; alAbrir: () => void; alBorrar: () => void; alCerrarSesiones: () => void }) {
  const idDetalle = `cuenta-${c.id}`
  return (
    <li>
      <Tarjeta className="overflow-hidden">
        <button type="button" onClick={alAbrir} aria-expanded={abierta} aria-controls={idDetalle} className="flex w-full flex-col gap-3 p-4 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{c.nombre}</span>
              <ChipCuenta estado={c.estado} />
              {esYo && <span className="text-nota text-muted-foreground">(usted)</span>}
            </div>
            <span className="truncate text-sm text-muted-foreground">{c.email}</span>
            <span className="text-sm text-foreground/80">
              {c.empresa?.nombre || <em className="text-muted-foreground">Empresa sin nombre</em>}
              {c.empresa && c.empresa.miembros > 1 && <span className="text-muted-foreground"> · {c.empresa.miembros} personas</span>}
              {c.empresa?.admin && <span className="text-muted-foreground"> · administra</span>}
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-sm sm:w-[25rem] sm:shrink-0">
            <div><dt className="text-nota text-muted-foreground">Último ingreso</dt><dd className="font-semibold">{hace(c.ultimoIngreso)}</dd></div>
            <div><dt className="text-nota text-muted-foreground">Pedidos</dt><dd className="font-semibold tabular-nums">{numero(c.pedidosCerrados)} de {numero(c.pedidos)}</dd></div>
            <div><dt className="text-nota text-muted-foreground">Movimientos</dt><dd className="font-semibold tabular-nums">{numero(c.movimientos)}</dd></div>
          </dl>
          <ChevronDown aria-hidden="true" className={cn('hidden size-5 shrink-0 text-muted-foreground transition-transform duration-200 sm:block', abierta && 'rotate-180')} />
        </button>
        {abierta && <DetalleCuenta id={idDetalle} c={c} esYo={esYo} alBorrar={alBorrar} alCerrarSesiones={alCerrarSesiones} />}
      </Tarjeta>
    </li>
  )
}

function DetalleCuenta({ id, c, esYo, alBorrar, alCerrarSesiones }: { id: string; c: Cuenta; esYo: boolean; alBorrar: () => void; alCerrarSesiones: () => void }) {
  const [d, setD] = useState<Detalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<Detalle>('GET', `/equipo/cuentas/${c.id}`).then(setD).catch((e) => setError(textoErrores(e).mensaje))
  }, [c.id])

  const datos: [string, string][] = [
    ['Cuenta creada', fecha(c.creadoEn)],
    ['Perfil', `${c.perfil === 'operador' ? 'Operador' : 'Analista'}${c.cargo ? ` · ${c.cargo}` : ''}`],
    ['Programa contable', c.sistema || 'No lo eligió'],
    ['Ingresos', `${numero(c.ingresos)} en ${numero(c.diasActivos)} día(s) con actividad`],
    ['Último archivo de la empresa', c.ultimoArchivo ? fecha(c.ultimoArchivo) : 'Ninguno'],
    ['Archivos que subió', numero(c.archivos)],
    ['Boletín diario', c.boletin ? 'Activado' : 'Desactivado'],
    ['Invitaciones de su empresa', c.empresa ? `${numero(c.empresa.invitaciones.aceptadas)} aceptada(s) de ${numero(c.empresa.invitaciones.creadas)}` : '—'],
    ['Sesiones abiertas', numero(c.sesionesAbiertas)],
  ]

  return (
    <div id={id} className="aparecer flex flex-col gap-5 border-t border-border bg-superficie p-4 sm:p-5">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {datos.map(([t, v]) => (
          <div key={t}><dt className="text-nota text-muted-foreground">{t}</dt><dd className="font-semibold">{v}</dd></div>
        ))}
      </dl>

      {error && <Aviso tono="error" titulo={error} />}
      {!d && !error && <p className="text-sm text-muted-foreground">Cargando el detalle…</p>}
      {d && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section aria-label="Personas de la empresa" className="flex flex-col gap-2">
            <h3 className="font-bold">Su empresa</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {d.miembros.map((m) => (
                <li key={m.id} className={cn('rounded-lg px-2.5 py-1.5', m.esEsta ? 'bg-card font-semibold' : '')}>
                  {m.nombre} <span className="text-muted-foreground">· {m.email}</span>
                  <span className="block text-nota text-muted-foreground">
                    {m.perfil === 'operador' ? 'Operador' : 'Analista'}{m.admin ? ' · administra' : ''}{m.aprueba ? ' · aprueba pedidos' : ''}
                  </span>
                </li>
              ))}
              {d.miembros.length === 0 && <li className="text-muted-foreground">Sin empresa.</li>}
            </ul>
          </section>
          <section aria-label="Pedidos" className="flex flex-col gap-2">
            <h3 className="font-bold">Pedidos</h3>
            {d.pedidos.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no ha hecho pedidos.</p> : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {d.pedidos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span><span className="font-semibold">{p.numero ? `Pedido ${p.numero}` : 'Pedido borrado'}</span> <span className="text-muted-foreground">· {p.modo === 'sugerido' ? 'desde lo sugerido' : 'con su lista'} · {numero(p.lineas)} línea(s)</span></span>
                    <span className="text-nota text-muted-foreground">{PEDIDO[p.estado]} · {fecha(p.terminadoEn || p.creadoEn)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Actividad reciente" className="flex flex-col gap-2">
            <h3 className="font-bold">Lo último que hizo</h3>
            {d.actividad.length === 0 ? <p className="text-sm text-muted-foreground">Sin actividad.</p> : (
              <ol className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1 text-sm">
                {d.actividad.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>{EVENTOS[e.tipo] || e.tipo.replace(/_/g, ' ')}{e.como && COMO[e.como] ? <span className="text-muted-foreground"> {COMO[e.como]}</span> : null}</span>
                    <span className="text-nota text-muted-foreground tabular-nums">{fechaHora(e.en)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {c.rol !== 'equipo' && !esYo && (
        <div className="flex flex-wrap gap-2.5 border-t border-border pt-4">
          <Boton tamano="chico" onClick={alCerrarSesiones} disabled={!c.sesionesAbiertas}><LogOut /> Cerrar sus sesiones</Boton>
          <Boton tamano="chico" variante="peligro" onClick={alBorrar}><Trash2 /> Borrar cuenta y datos</Boton>
        </div>
      )}
    </div>
  )
}

function VentanaBorrar({ c, alCerrar, alBorrar }: { c: Cuenta; alCerrar: () => void; alBorrar: (texto: string) => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<Previa>('GET', `/equipo/cuentas/${c.id}/borrar`).then(setPrevia).catch((e) => setError(textoErrores(e).mensaje))
  }, [c.id])
  useEffect(() => {
    if (previa && !previa.impedimento) campo.current?.focus()
  }, [previa])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) alCerrar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [alCerrar, enviando])

  const coincide = correo.trim().toLowerCase() === c.email.toLowerCase()
  const listo = Boolean(previa && !previa.impedimento && coincide && clave.length > 0 && !enviando)

  async function borrar(e: FormEvent) {
    e.preventDefault()
    if (!listo) return
    setEnviando(true)
    setError(null)
    try {
      const r = await api<{ borrada: string; pedidos: number; archivos: number; archivosQuedan: number }>('POST', `/equipo/cuentas/${c.id}/borrar`, { confirmacion: correo, clave })
      alBorrar(`Se borró la cuenta ${r.borrada}: ${r.pedidos} pedido(s) y ${r.archivos} archivo(s)${r.archivosQuedan ? `; ${r.archivosQuedan} archivo(s) quedaron en su empresa` : ''}.`)
    } catch (err) {
      setError(textoErrores(err).mensaje)
      setClave('')
      setEnviando(false)
    }
  }

  const e = previa?.empresa
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="borrar-titulo">
      <button type="button" aria-label="Cancelar" className="velo absolute inset-0 bg-foreground/40" onClick={() => !enviando && alCerrar()} />
      <form onSubmit={borrar} className="aparecer relative flex max-h-[92vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl">
        <h2 id="borrar-titulo" className="text-xl font-bold">¿Borrar la cuenta de {c.nombre}?</h2>
        {!previa && !error && <p className="text-muted-foreground">Revisando qué se borraría…</p>}
        {previa?.impedimento && <Aviso tono="cuidado" titulo={previa.impedimento} />}
        {previa && !previa.impedimento && (
          <>
            <Aviso tono="error" titulo="Esto no se puede deshacer.">
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>La cuenta {c.email} y sus sesiones.</li>
                <li>{numero(previa.pedidos)} pedido(s) y {numero(previa.eventos)} registro(s) de actividad.</li>
                {previa.archivos > 0 && <li>{numero(previa.archivos)} archivo(s) subido(s).</li>}
                {e && !e.sigue && <li>Su empresa{e.nombre ? `, ${e.nombre},` : ''} con {numero(e.productos)} producto(s) y {numero(e.movimientos)} movimiento(s).</li>}
              </ul>
            </Aviso>
            {e?.sigue && (
              <Aviso tono="info" titulo={`${e.nombre || 'Su empresa'} sigue con ${e.otros} persona(s).`}>
                El inventario es de la empresa y se queda.
                {previa.archivosQuedan > 0 && ` Los ${previa.archivosQuedan} archivo(s) que subió pasan a ${e.recibe}.`}
                {e.nuevoAdmin && ` ${e.recibe} pasa a administrar la empresa.`}
              </Aviso>
            )}
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Escriba el correo de la cuenta para confirmar
              <span className="font-normal text-muted-foreground select-all">{c.email}</span>
              <input ref={campo} type="email" autoComplete="off" spellCheck={false} className={claseEntrada} value={correo} onChange={(ev) => setCorreo(ev.target.value)} aria-invalid={correo.length > 0 && !coincide} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Su contraseña
              <input type="password" autoComplete="current-password" className={claseEntrada} value={clave} onChange={(ev) => setClave(ev.target.value)} />
            </label>
          </>
        )}
        {error && <Aviso tono="error" titulo={error} />}
        <div className="flex flex-wrap gap-2.5">
          {!previa?.impedimento && (
            <Boton type="submit" variante="peligro" disabled={!listo} className="disabled:opacity-40">
              <Trash2 /> {enviando ? 'Borrando…' : 'Borrar la cuenta'}
            </Boton>
          )}
          <Boton onClick={alCerrar} disabled={enviando}>{previa?.impedimento ? 'Entendido' : 'No, dejarla'}</Boton>
        </div>
      </form>
    </div>
  )
}
