'use client'

// Un pedido de la prueba, en 5 pasos: lo que ibas a pedir → tus ventas y existencias → el
// reporte → tu lista final → por qué cambió. Las reglas (la lista inicial queda fija, no hay
// reporte sin lista inicial) se hacen cumplir en el servidor (server/pedidos.js).

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, FileUp, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, prepararArchivo, textoErrores } from '@/lib/api'
import { claveCodigo, dia, fecha, fechaHora, numero, plural, semanas } from '@/lib/formato'
import { useInventario, useSesion } from './contexto'
import { useConfirmar } from './confirmar'
import { Hoja, type Extra, type HojaApi } from './hoja'
import { Reporte, estadoDeFila, type ReporteRotacion } from './reporte'
import { FormularioColumnas, SubirArchivos, type HojaMapeo } from './subir'
import { Aviso, Boton, BotonEnlace, Cargando, Contador, ErrorLista, Tarjeta, claseEntrada } from './ui'

type LineaGuardada = { codigo: string; nombre?: string; cantidad: number | string }
type Conteo = { agregadas: number; quitadas: number; cambiadas: number; total: number }
type Pedido = {
  id: number
  proveedor: string
  tipo: 'real' | 'simulado' | null
  creadoEn: string
  numero: number
  paso: number
  terminado: boolean
  listaInicial: LineaGuardada[]
  inicialGuardadaEn: string | null
  semanasAgota: number
  export: { id: number; subidoEn: string; archivos: { nombre: string }[] } | null
  reporteVistoEn: string | null
  listaFinal: LineaGuardada[] | null
  finalGuardadaEn: string | null
  comparacion: {
    conteo: Conteo
    agregadas: { codigo: string; nombre?: string; cantidad: number }[]
    quitadas: { codigo: string; nombre?: string; cantidad: number }[]
    cambiadas: { codigo: string; nombre?: string; antes: number; despues: number }[]
    iguales: number
  } | null
  porQue: string | null
  terminadoEn: string | null
}

const PASOS = ['Lo que ibas a pedir', 'Ventas y existencias', 'El reporte', 'Tu lista final', '¿Por qué cambió?']

export function PedidoFlujo({ id }: { id: number }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [error, setError] = useState<string | null>(null)
  const params = useSearchParams()!
  const { ventana: ventanaBorrar, preguntar: preguntarBorrar } = useConfirmar()
  const { recargar } = useInventario()
  const router = useRouter()
  const ruta = usePathname()!

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ pedido: Pedido }>('GET', `/pedidos/${id}`)
      setPedido(r.pedido)
    } catch (e) {
      setError(textoErrores(e).mensaje)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  if (error) return <><VolverAPedidos /><ErrorLista mensaje={error} /></>
  if (!pedido) return <Cargando texto="Cargando el pedido…" />

  const alcanzable = Math.min(pedido.paso, 5)
  const pedidoPaso = Number(params.get('paso'))
  const paso = pedidoPaso >= 1 && pedidoPaso <= alcanzable ? pedidoPaso : alcanzable
  async function borrar() {
    const si = await preguntarBorrar(`¿Borrar el Pedido ${pedido!.numero}?`, 'Se borra lo que llevas de este pedido y no se puede deshacer.', 'Sí, borrar', true)
    if (!si) return
    try {
      await api('DELETE', `/pedidos/${id}`)
      recargar() // si el archivo era de este pedido, el panel y Datos ya no lo usan
      router.push('/pedidos')
    } catch (e) {
      setError(textoErrores(e).mensaje)
    }
  }

  const ir = async (n: number) => {
    await cargar()
    router.push(`${ruta}?paso=${n}`, { scroll: true })
  }

  return (
    <>
      <VolverAPedidos />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[1.9rem] font-extrabold">Pedido {pedido.numero}{pedido.proveedor ? ` · ${pedido.proveedor}` : ''}</h1>
        {pedido.tipo && <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', pedido.tipo === 'real' ? 'bg-verde-fondo text-verde' : 'bg-muted text-foreground/70')}>{pedido.tipo === 'real' ? 'Pedido real' : 'Pedido simulado'}</span>}
        {pedido.terminado && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">Terminado</span>}
        {pedido.paso < 5 && (
          <Boton tamano="chico" variante="fantasma" className="ml-auto text-muted-foreground hover:text-rojo-texto" onClick={borrar}>
            <Trash2 /> Borrar pedido
          </Boton>
        )}
      </header>
      {ventanaBorrar}

      <nav aria-label="Pasos del pedido" className="-mx-1 overflow-x-auto px-1">
        <ol className="flex min-w-max gap-1.5 rounded-full border border-border bg-card p-1.5">
          {PASOS.map((nombre, k) => {
            const n = k + 1
            const hecho = n < pedido.paso
            const actual = n === paso
            const habilitado = n <= alcanzable
            const contenido = (
              <>
                <span className={cn('inline-flex size-7 items-center justify-center rounded-full text-sm font-bold tabular-nums', actual ? 'bg-primary text-primary-foreground' : hecho ? 'bg-[#d5ede9] text-secondary-foreground' : 'bg-muted text-muted-foreground')}>
                  {hecho && !actual ? <Check className="size-4" /> : n}
                </span>
                <span className={cn('pr-2', !actual && 'hidden 2xl:inline')}>{nombre}</span>
              </>
            )
            return (
              <li key={n}>
                {habilitado ? (
                  <Link href={`${ruta}?paso=${n}`} aria-current={actual ? 'step' : undefined} className={cn('flex min-h-10 items-center gap-2 rounded-full pl-1.5 text-[0.93rem] font-semibold transition-colors duration-150', actual ? 'bg-secondary text-secondary-foreground' : 'text-foreground/80 hover:bg-muted')}>
                    {contenido}
                  </Link>
                ) : (
                  <span title="Primero termina el paso anterior" className="flex min-h-10 items-center gap-2 rounded-full pl-1.5 text-[0.93rem] font-semibold text-muted-foreground/70">{contenido}</span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {paso === 1 && <Paso1 pedido={pedido} ir={ir} />}
      {paso === 2 && <Paso2 pedido={pedido} ir={ir} alCambiar={setPedido} />}
      {paso === 3 && <Paso3 pedido={pedido} ir={ir} />}
      {paso === 4 && <Paso4 pedido={pedido} ir={ir} />}
      {paso === 5 && <Paso5 pedido={pedido} recargar={cargar} />}
    </>
  )
}

function VolverAPedidos() {
  return <Link href="/pedidos" className="inline-flex items-center gap-1.5 self-start font-semibold text-primary hover:text-primary-hover"><ArrowLeft className="size-4" /> Mis pedidos</Link>
}

// --- Autoguardado del borrador -------------------------------------------------------------

function useAutoguardado(guardar: () => Promise<unknown>) {
  const [estado, setEstado] = useState('')
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendiente = useRef(false)
  const guardarRef = useRef(guardar)
  guardarRef.current = guardar

  const ahora = useCallback(async () => {
    if (reloj.current) clearTimeout(reloj.current)
    reloj.current = null
    if (!pendiente.current) return
    pendiente.current = false
    setEstado('Guardando borrador…')
    try {
      await guardarRef.current()
      setEstado('Borrador guardado. Puedes seguir después.')
    } catch {
      setEstado('No se pudo guardar el borrador. Revisa tu conexión.')
    }
  }, [])

  const cambio = useCallback(() => {
    pendiente.current = true
    setEstado('Cambios sin guardar…')
    if (reloj.current) clearTimeout(reloj.current)
    reloj.current = setTimeout(ahora, 900)
  }, [ahora])

  // Al salir de la pantalla, se guarda lo pendiente.
  useEffect(() => () => { if (pendiente.current) guardarRef.current().catch(() => {}) }, [])

  return { estado, cambio, ahora, cancelar: () => { pendiente.current = false; if (reloj.current) clearTimeout(reloj.current) } }
}

// --- Importar la lista desde un archivo ---------------------------------------------------------

const CAMPOS_LISTA = [
  { campo: 'codigo', nombre: 'Código de producto' },
  { campo: 'pedir', nombre: 'Cantidad a pedir' },
  { campo: 'nombre', nombre: 'Nombre (opcional)' },
]

type RespuestaLista = { ok: boolean; lineas: LineaGuardada[]; columnas: Record<string, string>; archivo: string; hoja?: string; omitidas?: number; errores?: string[]; hojas?: HojaMapeo[]; archivoId: number }

function ImportarLista({ pedidoId, para, hoja, alImportar }: { pedidoId: number; para: 'inicial' | 'final'; hoja: React.RefObject<HojaApi | null>; alImportar: () => void }) {
  const [mensaje, setMensaje] = useState<React.ReactNode>(null)
  const [mapeo, setMapeo] = useState<{ hojas: HojaMapeo[]; archivoId: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function enviar(fd: FormData) {
    setMensaje(<p className="text-sm text-muted-foreground">Leyendo tu archivo…</p>)
    setMapeo(null)
    let r: RespuestaLista
    try {
      r = await api<RespuestaLista>('POST', `/pedidos/${pedidoId}/importar-lista`, undefined, { formulario: fd })
    } catch (e) {
      const t = textoErrores(e)
      return setMensaje(<ErrorLista mensaje={t.mensaje} lista={t.lista} />)
    }
    if (!r.ok) {
      setMensaje(<ErrorLista mensaje="No pudimos leer la lista:" lista={r.errores} />)
      if (r.hojas?.some((h) => h.encabezados.length)) setMapeo({ hojas: r.hojas, archivoId: r.archivoId })
      return
    }
    if (!r.lineas.length) return setMensaje(<Aviso tono="cuidado">El archivo no tiene productos con cantidad a pedir (columna: {r.columnas.pedir}).</Aviso>)
    const hayAlgo = (hoja.current?.lineas() || []).some((l) => l.codigo || l.cantidad)
    if (hayAlgo && !window.confirm(`El archivo trae ${r.lineas.length} productos. ¿Reemplazar lo que hay en la tabla?`)) return setMensaje(null)
    hoja.current?.fijar(r.lineas)
    setMensaje(
      <Aviso tono="ok">
        Importamos {plural(r.lineas.length, 'producto', 'productos')} de &quot;{r.archivo}&quot;{r.hoja ? ` (hoja "${r.hoja}")` : ''}: código en {r.columnas.codigo}, cantidad en {r.columnas.pedir}.
        {r.omitidas ? ` ${plural(r.omitidas, 'producto sin cantidad a pedir no se incluyó', 'productos sin cantidad a pedir no se incluyeron')}.` : ''} Revisa la tabla antes de guardar.
      </Aviso>,
    )
    alImportar()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.93rem] text-muted-foreground">
        <span>Escribe en la tabla o pega filas copiadas de tu Excel (Ctrl+V). También puedes:</span>
        <label className="presionable inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-within:outline-3 focus-within:outline-ring">
          <FileUp className="size-4" /> Importar mi archivo de pedido
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.txt,.tsv,.prn,.xml,.htm,.html"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              if (input.current) input.current.value = ''
              prepararArchivo(f).then((listo) => {
                const fd = new FormData()
                fd.append('para', para)
                fd.append('archivo', listo)
                enviar(fd)
              })
            }}
          />
        </label>
        <a href="/plantillas/lista-pedido.xlsx" download className="font-semibold text-primary hover:text-primary-hover">Descargar plantilla de lista</a>
      </div>
      {mensaje}
      {mapeo && (
        <FormularioColumnas
          hojas={mapeo.hojas}
          campos={CAMPOS_LISTA}
          alEnviar={(m) => {
            const fd = new FormData()
            fd.append('para', para)
            fd.append('archivoId', String(mapeo.archivoId))
            fd.append('mapeo', JSON.stringify(m))
            enviar(fd)
          }}
        />
      )}
    </div>
  )
}

// --- Paso 1 -----------------------------------------------------------------------------------

function Paso1({ pedido, ir }: { pedido: Pedido; ir: (n: number) => void }) {
  const hoja = useRef<HojaApi>(null)
  const [proveedor, setProveedor] = useState(pedido.proveedor || '')
  const [tipo, setTipo] = useState<Pedido['tipo']>(pedido.tipo)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [guardando, setGuardando] = useState(false)
  const { ventana, preguntar } = useConfirmar()
  const datos = useRef({ proveedor, tipo })
  datos.current = { proveedor, tipo }
  const auto = useAutoguardado(() => api('PUT', `/pedidos/${pedido.id}/lista-inicial`, { lineas: hoja.current?.lineas() || [], tipo: datos.current.tipo, proveedor: datos.current.proveedor }))

  if (pedido.inicialGuardadaEn) {
    return (
      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Lo que ibas a pedir</h2>
        <p className="text-muted-foreground">La guardaste el {fechaHora(pedido.inicialGuardadaEn)}. Ya no se puede cambiar: es la base para comparar con tu lista final.</p>
        <Hoja inicial={pedido.listaInicial} soloLectura />
        {pedido.paso === 2 && <BotonEnlace href="?paso=2" variante="primario" className="self-end">Seguir: tus ventas y existencias <ArrowRight /></BotonEnlace>}
      </Tarjeta>
    )
  }

  async function guardar() {
    setError(null)
    if (!tipo) return setError({ mensaje: 'Marca si el pedido es real o simulado.', lista: [] })
    const cuerpo = { lineas: hoja.current?.lineas() || [], tipo, proveedor }
    setGuardando(true)
    try {
      const rev = await api<{ lineas: number; avisos: string[] }>('POST', `/pedidos/${pedido.id}/lista-inicial`, { ...cuerpo, revisar: true })
      const ok = await preguntar(
        '¿Guardar tu lista inicial?',
        <>
          <p>Vas a guardar tu lista inicial con <strong>{plural(rev.lineas, 'producto', 'productos')}</strong>. Una vez guardada queda fija y ya no se puede cambiar.</p>
          {rev.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-[0.93rem] text-ambar-texto">{rev.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
        </>,
      )
      if (!ok) return setGuardando(false)
      auto.cancelar()
      await api('POST', `/pedidos/${pedido.id}/lista-inicial`, cuerpo)
      ir(2)
    } catch (e) {
      setGuardando(false)
      const t = textoErrores(e)
      setError(t)
      const errs = (e as { datos?: { errores?: { fila: number }[] } }).datos?.errores
      if (errs) hoja.current?.marcarErrores(errs.map((x) => x.fila).filter(Boolean))
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
      {ventana}
      <div>
        <h2 className="text-xl font-bold">Lo que ibas a pedir</h2>
        <p className="mt-1 text-muted-foreground">Antes de ver el reporte, anota lo que ibas a pedir hoy, como lo harías normalmente. Al final comparamos esta lista con la que decidas después de ver la rotación.</p>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <label className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1.5 font-semibold">
          <span>Proveedor o nombre del pedido <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <input className={claseEntrada} maxLength={120} placeholder="Ej.: Tornillería Central" value={proveedor} onChange={(e) => { setProveedor(e.target.value); auto.cambio() }} />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 font-semibold">¿Este pedido es real o simulado?</legend>
          <div className="flex gap-2">
            {(['real', 'simulado'] as const).map((t) => (
              <label key={t} className={cn('flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3.5', tipo === t ? 'border-primary bg-secondary' : 'border-input bg-card hover:bg-muted')}>
                <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => { setTipo(t); auto.cambio() }} className="size-4 accent-[var(--primary)]" />
                <span className="flex flex-col leading-tight">
                  <strong className="text-[0.95rem]">{t === 'real' ? 'Real' : 'Simulado'}</strong>
                  <span className="text-[0.8rem] text-muted-foreground">{t === 'real' ? 'Lo voy a hacer en estos días.' : 'Lo armo como si fuera a pedir hoy.'}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <ImportarLista pedidoId={pedido.id} para="inicial" hoja={hoja} alImportar={auto.cambio} />
      <Hoja ref={hoja} inicial={pedido.listaInicial} alCambiar={auto.cambio} />
      <p className="text-sm text-muted-foreground">Cada línea necesita código de producto y cantidad; el nombre es opcional.</p>
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">{auto.estado}</span>
        <Boton variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Revisando…' : 'Guardar lista inicial'}</Boton>
      </div>
    </Tarjeta>
  )
}

// --- Paso 2 -----------------------------------------------------------------------------------

function Paso2({ pedido, ir, alCambiar }: { pedido: Pedido; ir: (n: number) => void; alCambiar: (p: Pedido) => void }) {
  const { usuario, fijar } = useSesion()
  const { inventario, recargar } = useInventario()
  const [usando, setUsando] = useState(false)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)

  if (pedido.terminado) {
    return (
      <Tarjeta className="flex flex-col gap-3 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Tus ventas y existencias</h2>
        {pedido.export && <p>Usaste {pedido.export.archivos.map((a) => `"${a.nombre}"`).join(' y ')}, subidos el {fechaHora(pedido.export.subidoEn)}.</p>}
      </Tarjeta>
    )
  }

  const guardado = inventario && inventario.fuente.exportId && inventario.fuente.exportId !== pedido.export?.id ? inventario : null
  const dias = guardado ? Math.floor((Date.now() - new Date(guardado.fuente.fecha).getTime()) / 86400000) : 0

  async function usarGuardado() {
    setUsando(true)
    setError(null)
    try {
      await api('POST', `/pedidos/${pedido.id}/export/usar-ultimo`)
      ir(3)
    } catch (e) {
      setError(textoErrores(e))
      setUsando(false)
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-bold">Tus ventas y existencias</h2>
        <p className="mt-1 text-muted-foreground">Necesitamos <strong className="text-foreground">lo que vendiste</strong> de cada producto en el último año y <strong className="text-foreground">lo que tienes hoy</strong>. Un archivo o varios, tal como salen de tu programa.</p>
      </div>
      {pedido.export && (
        <Aviso tono="ok">
          Ya subiste {pedido.export.archivos.map((a) => `"${a.nombre}"`).join(' y ')} el {fechaHora(pedido.export.subidoEn)}. <Link href="?paso=3" className="font-semibold underline-offset-2 hover:underline">Ver el reporte</Link>
        </Aviso>
      )}
      {guardado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4">
          <p className="text-[0.97rem] text-[#0b3f3b]">
            Tienes tu inventario guardado del <strong>{fecha(guardado.fuente.fecha)}</strong> ({numero(guardado.resumen.productos)} productos).
            {dias > 7 ? ' Tiene más de una semana: si puedes, sube uno nuevo.' : ' Puedes usarlo sin subir nada.'}
          </p>
          <Boton variante={dias > 7 ? 'secundario' : 'primario'} onClick={usarGuardado} disabled={usando}>{usando ? 'Un momento…' : 'Usar ese inventario'}</Boton>
        </div>
      )}
      {!pedido.reporteVistoEn && <UmbralDelPedido pedido={pedido} alCambiar={alCambiar} />}
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      <SubirArchivos
        base={`/pedidos/${pedido.id}/export`}
        usuario={usuario}
        alGuardarSistema={fijar}
        textoBoton={pedido.export ? 'Subir otro archivo' : undefined}
        alTerminar={() => {
          recargar()
          ir(3)
        }}
      />
    </Tarjeta>
  )
}

// Con cuántas semanas este pedido marca "se agota". Se guarda al tocar − o + y queda fijo al ver
// el reporte; también queda como el número de Datos para los pedidos siguientes.
function UmbralDelPedido({ pedido, alCambiar }: { pedido: Pedido; alCambiar: (p: Pedido) => void }) {
  const { recargar } = useInventario()
  const [valor, setValor] = useState(pedido.semanasAgota)
  const [error, setError] = useState<string | null>(null)
  const ultimo = useRef(0)

  async function mover(d: number) {
    const nuevo = Math.min(11, Math.max(1, valor + d))
    if (nuevo === valor) return
    setValor(nuevo)
    setError(null)
    const vuelta = ++ultimo.current
    try {
      const r = await api<{ pedido: Pedido }>('PUT', `/pedidos/${pedido.id}/semanas-agota`, { semanas: nuevo })
      if (vuelta === ultimo.current) {
        alCambiar(r.pedido)
        recargar()
      }
    } catch (e) {
      if (vuelta === ultimo.current) {
        setValor(pedido.semanasAgota)
        setError(textoErrores(e).mensaje)
      }
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <strong className="block text-[0.97rem]">¿Con cuántas semanas quieres que te marquemos que algo se agota?</strong>
          <span className="text-[0.88rem] text-muted-foreground">Si a un producto le quedan menos semanas que esto, sale como «se agota» en tu reporte. {pedido.semanasAgota === 2 ? 'Si no lo cambias, son 2.' : `Está en ${pedido.semanasAgota}, también para tus próximos pedidos (lo cambias aquí o en Datos).`}</span>
        </div>
        <Contador valor={valor} etiqueta="semanas para marcar que se agota" onMover={mover} paso={1} />
      </div>
      {error && <ErrorLista mensaje={error} />}
    </div>
  )
}

// --- Paso 3 -----------------------------------------------------------------------------------

function useReporte(id: number) {
  const [r, setR] = useState<ReporteRotacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<{ reporte: ReporteRotacion }>('GET', `/pedidos/${id}/reporte`).then((x) => setR(x.reporte)).catch((e) => setError(textoErrores(e).mensaje))
  }, [id])
  return { r, error }
}

// Ver el reporte habilita el paso 4 en el servidor: "Seguir" recarga el pedido antes de avanzar.
function Paso3({ pedido, ir }: { pedido: Pedido; ir: (n: number) => void }) {
  const { r, error } = useReporte(pedido.id)
  if (error) return <ErrorLista mensaje={error} />
  if (!r) return <Cargando texto="Cargando el reporte…" />
  return (
    <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Tu reporte de rotación</h2>
          <p className="mt-1 text-muted-foreground">
            Arriba está lo que se agota primero; abajo, lo que sobra. Archivo: {r.archivos?.join(', ')} (subido el {fechaHora(r.subidoEn)}).{' '}
            {!pedido.terminado && <Link href="?paso=2" className="font-semibold text-primary hover:text-primary-hover">Usar otro archivo</Link>}
          </p>
        </div>
        {!pedido.terminado && <Boton variante="primario" onClick={() => ir(4)}>Seguir: arma tu lista final <ArrowRight /></Boton>}
      </div>
      <Recordatorio pedidoId={pedido.id} />
      <Reporte r={r} />
      {!pedido.terminado && <Boton variante="primario" className="self-end" onClick={() => ir(4)}>Seguir: arma tu lista final <ArrowRight /></Boton>}
    </Tarjeta>
  )
}

type DatosRecordatorio = {
  email: string
  plan: { fechaReporte: string; productos: number; primero: { codigo: string; nombre: string; fechaUmbral: string; fechaAviso: string } | null; semanasBuenNivel: number; semanasAgota?: number; diasAntes: number; correo: boolean }
  respuesta: { activo: boolean; pedidoId: number; fechaReporte: string; primerAviso: string } | null
  correo?: 'enviado' | 'fallo'
}

// Stickiness del Entregable: un recordatorio en el calendario antes de que algo se agote.
function Recordatorio({ pedidoId }: { pedidoId: number }) {
  const [d, setD] = useState<DatosRecordatorio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    api<DatosRecordatorio>('GET', `/pedidos/${pedidoId}/recordatorio`).then(setD).catch(() => {})
  }, [pedidoId])
  if (!d) return null
  const { plan, respuesta } = d
  const activo = respuesta?.activo
  const deEste = respuesta?.pedidoId === pedidoId

  async function responder(v: boolean) {
    setEnviando(true)
    setError(null)
    try {
      setD(await api<DatosRecordatorio>('POST', `/pedidos/${pedidoId}/recordatorio`, { activo: v }))
    } catch (e) {
      setError(textoErrores(e).mensaje)
    } finally {
      setEnviando(false)
    }
  }

  const descargar = <a href={`/api/pedidos/${pedidoId}/recordatorio.ics`} download className="presionable inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"><CalendarDays className="size-4" /> Descargar para mi calendario</a>
  let cuerpo: React.ReactNode = null
  if (activo && deEste) {
    cuerpo = (
      <>
        <p><strong>Listo.</strong> {d.correo === 'enviado' ? `Te enviamos la invitación a ${d.email}. ` : ''}{d.correo === 'fallo' ? 'No pudimos enviarte el correo, pero puedes descargar el archivo. ' : ''}Descarga el archivo y ábrelo: tu calendario (Google Calendar, Outlook o el del celular) te avisará. El primer recordatorio es el {dia(respuesta!.primerAviso)}.</p>
        <div className="flex flex-wrap gap-2">{descargar}<Boton tamano="chico" onClick={() => responder(false)} disabled={enviando}>Ya no lo quiero</Boton></div>
      </>
    )
  } else if (activo) {
    cuerpo = (
      <>
        <p>Tienes recordatorios con el reporte del {dia(respuesta!.fechaReporte)}.{plan.productos ? ` ¿Prefieres usar este, del ${dia(plan.fechaReporte)}?` : ''}</p>
        <div className="flex flex-wrap gap-2">{plan.productos > 0 && <Boton tamano="chico" variante="primario" onClick={() => responder(true)} disabled={enviando}>Usar este reporte</Boton>}<Boton tamano="chico" onClick={() => responder(false)} disabled={enviando}>Ya no lo quiero</Boton></div>
      </>
    )
  } else if (plan.productos && plan.primero) {
    const p = plan.primero
    cuerpo = (
      <>
        <p><strong>¿Te recordamos antes de que se agoten?</strong> {plural(plan.productos, 'producto que hoy tiene', 'productos que hoy tienen')} más de {plan.semanasBuenNivel} semanas {plan.productos === 1 ? 'baja' : 'bajan'} de {plan.semanasAgota ?? 2} semanas en los próximos 3 meses, si sigues vendiendo al mismo ritmo. El primero es {p.codigo}{p.nombre ? ` (${p.nombre})` : ''}, hacia el {dia(p.fechaUmbral)}. Te dejamos un recordatorio en tu calendario {plan.diasAntes} días antes{plan.correo ? ` y te lo mandamos a ${d.email}` : ''}, como máximo uno por semana.</p>
        <div className="flex flex-wrap gap-2">{!respuesta && <Boton tamano="chico" onClick={() => responder(false)} disabled={enviando}>No, gracias</Boton>}<Boton tamano="chico" variante="primario" onClick={() => responder(true)} disabled={enviando}>Sí, recuérdamelo</Boton></div>
      </>
    )
  }
  if (!cuerpo) return null
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4 text-[0.95rem] text-[#0b3f3b]">
      {cuerpo}
      {error && <ErrorLista mensaje={error} />}
    </div>
  )
}

// --- Paso 4 -----------------------------------------------------------------------------------

type ProductoSugerido = { codigo: string; nombre: string; sugerido: number | null; semanas: number | null; estado: string; ventasSemana: number; existencias: number; entrega: number; lote: number | null; proveedor: string }
type Sugerido = { entrega: number; cadaCuanto: number; nivelServicio: number; productos: ProductoSugerido[] }

// Lo que sugiere el modelo para este pedido: se puede ajustar el tiempo de entrega y cada cuánto
// pide, llevar las cantidades sugeridas a la lista o agregar lo que se agota y no está en ella.
function RecuadroSugerido({ sug, hoja, alCambiarLista, alCambiarAjustes }: { sug: Sugerido; hoja: React.RefObject<HojaApi | null>; alCambiarLista: () => void; alCambiarAjustes: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)
  const enLista = new Set((hoja.current?.lineas() || []).map((l) => claveCodigo(l.codigo)))
  const faltan = sug.productos.filter((p) => (p.estado === 'agota' || p.estado === 'pide') && (p.sugerido || 0) > 0 && !enLista.has(claveCodigo(p.codigo)))
  const porCodigo = new Map(sug.productos.map((p) => [claveCodigo(p.codigo), p]))

  async function ajustar(campo: 'entregaPorDefecto' | 'cadaCuanto', valor: number) {
    setGuardando(true)
    try {
      await api('PUT', '/inventario/ajustes', { [campo]: valor })
      alCambiarAjustes()
    } finally {
      setGuardando(false)
    }
  }
  function usarSugeridas() {
    const lineas = hoja.current?.lineas() || []
    let n = 0
    const nuevas = lineas.map((l) => {
      const x = porCodigo.get(claveCodigo(l.codigo))
      if (!l.codigo || !x || x.sugerido === null || String(x.sugerido) === l.cantidad) return l
      n++
      return { ...l, nombre: l.nombre || x.nombre, cantidad: String(x.sugerido) }
    })
    hoja.current?.fijar(nuevas)
    alCambiarLista()
    setHecho(n ? `Se pusieron las cantidades sugeridas en ${plural(n, 'producto', 'productos')}. Revísalas antes de guardar.` : 'Tu lista ya tiene las cantidades sugeridas.')
  }
  function agregarFaltantes() {
    const lineas = (hoja.current?.lineas() || []).filter((l) => l.codigo || l.nombre || l.cantidad)
    hoja.current?.fijar([...lineas, ...faltan.map((p) => ({ codigo: p.codigo, nombre: p.nombre, cantidad: String(p.sugerido) }))])
    alCambiarLista()
    setHecho(`Se agregaron ${plural(faltan.length, 'producto', 'productos')} con su cantidad sugerida. Quita los que no vayas a pedir.`)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4 sm:p-5">
      <div>
        <strong className="text-[0.97rem]">Lo que sugiere SINESC</strong>
        <p className="mt-1 text-[0.93rem] text-muted-foreground">
          Para cada producto, lo que te falta para no quedarte sin él hasta que llegue tu siguiente pedido: lo que vendes por semana (lo reciente pesa más y se tiene en cuenta la temporada), cuánto tarda tu proveedor y cada cuánto pides, en {Math.round(sug.nivelServicio * 10)} de cada 10 casos. Ya resta lo que tienes, y si un producto se vende siempre por paquetes, redondea al paquete.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="flex items-center gap-3 text-[0.93rem]">
          <span>Tu proveedor tarda</span>
          <Contador valor={sug.entrega} etiqueta="el tiempo de entrega" paso={1} onMover={(d) => !guardando && ajustar('entregaPorDefecto', Math.max(0, Math.min(26, sug.entrega + d)))} />
        </div>
        <div className="flex items-center gap-3 text-[0.93rem]">
          <span>Pides cada</span>
          <Contador valor={sug.cadaCuanto} etiqueta="cada cuánto pides" paso={1} onMover={(d) => !guardando && ajustar('cadaCuanto', Math.max(1, Math.min(26, sug.cadaCuanto + d)))} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Si en Datos le pusiste a un proveedor su propio tiempo de entrega, sus productos usan ese.</p>
      <div className="flex flex-wrap gap-2">
        <Boton tamano="chico" onClick={usarSugeridas}>Usar las cantidades sugeridas en mi lista</Boton>
        {faltan.length > 0 && (
          <Boton tamano="chico" onClick={agregarFaltantes}>Agregar lo que se agota y no está en mi lista ({faltan.length})</Boton>
        )}
      </div>
      {faltan.length > 0 && (
        <details className="text-[0.9rem]">
          <summary className="cursor-pointer text-muted-foreground">Ver cuáles se agotan y no están en tu lista</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {faltan.slice(0, 40).map((p) => <li key={p.codigo}>{p.codigo} · {p.nombre}: te alcanza para {semanas(p.semanas ?? 0)} semanas; sugerido {numero(p.sugerido ?? 0)}</li>)}
          </ul>
          {faltan.length > 40 && <p className="mt-1 text-muted-foreground">Y {faltan.length - 40} más.</p>}
        </details>
      )}
      {hecho && <p className="text-[0.93rem] font-semibold text-primary" aria-live="polite">{hecho}</p>}
    </div>
  )
}

function useSugerido(pedidoId: number) {
  const [sug, setSug] = useState<Sugerido | null>(null)
  const cargar = useCallback(() => {
    api<Sugerido>('GET', `/pedidos/${pedidoId}/sugerido`).then(setSug).catch(() => setSug(null))
  }, [pedidoId])
  useEffect(cargar, [cargar])
  return { sug, cargar }
}

function Paso4({ pedido, ir }: { pedido: Pedido; ir: (n: number) => void }) {
  const { r, error: errorReporte } = useReporte(pedido.id)
  const hoja = useRef<HojaApi>(null)
  const [verReporte, setVerReporte] = useState(false)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [guardando, setGuardando] = useState(false)
  const { ventana, preguntar } = useConfirmar()
  const auto = useAutoguardado(() => api('PUT', `/pedidos/${pedido.id}/lista-final`, { lineas: hoja.current?.lineas() || [] }))
  // Los códigos que hay en la hoja ahora, para mostrar lo que se quitó de la lista inicial.
  const [actuales, setActuales] = useState<Set<string> | null>(null)
  const { sug, cargar: cargarSugerido } = useSugerido(pedido.id)
  const cambio = () => {
    auto.cambio()
    setActuales(new Set((hoja.current?.lineas() || []).map((l) => claveCodigo(l.codigo))))
  }

  if (errorReporte) return <ErrorLista mensaje={errorReporte} />
  if (!r) return <Cargando texto="Cargando…" />

  const porCodigo = new Map(r.filas.map((f) => [claveCodigo(f.codigo), f]))
  const inicial = new Map(pedido.listaInicial.map((l) => [claveCodigo(l.codigo), l]))
  const cantidad = (v: unknown) => Number(String(v ?? '').trim().replace(',', '.'))
  const sugPorCodigo = new Map((sug?.productos || []).map((x) => [claveCodigo(x.codigo), x]))
  const extras: Extra[] = [
    {
      titulo: 'Ibas a pedir',
      valor: (l) => {
        if (!l.codigo) return { texto: '' }
        const x = inicial.get(claveCodigo(l.codigo))
        if (!x) return { texto: '—', clase: 'text-muted-foreground' }
        return { texto: numero(cantidad(x.cantidad)), clase: 'tabular-nums text-muted-foreground' }
      },
    },
    {
      titulo: 'Sugerido',
      valor: (l) => {
        if (!l.codigo || !sug) return { texto: '' }
        const x = sugPorCodigo.get(claveCodigo(l.codigo))
        if (!x) return { texto: '—', clase: 'text-muted-foreground' }
        if (x.sugerido === null) return { texto: 'sin ventas', clase: 'text-azul' }
        if (x.sugerido === 0) return { texto: '0, te alcanza', clase: 'text-muted-foreground' }
        return { texto: numero(x.sugerido), clase: 'tabular-nums font-semibold text-primary' }
      },
    },
    {
      // La diferencia entre lo que va a pedir ahora y lo que iba a pedir: es lo que mide la prueba.
      titulo: 'Cambio',
      valor: (l) => {
        if (!l.codigo) return { texto: '' }
        const x = inicial.get(claveCodigo(l.codigo))
        if (!x) return { texto: 'agregado', clase: 'font-semibold text-verde' }
        const antes = cantidad(x.cantidad)
        const ahora = cantidad(l.cantidad)
        if (!Number.isFinite(ahora) || !Number.isFinite(antes)) return { texto: '' }
        const d = ahora - antes
        if (Math.abs(d) < 1e-9) return { texto: 'igual', clase: 'text-muted-foreground' }
        return { texto: `${d > 0 ? '+' : '−'}${numero(Math.abs(d))}`, clase: 'tabular-nums font-semibold text-ambar-texto' }
      },
    },
    {
      titulo: 'Semanas de inventario',
      valor: (l) => {
        if (!l.codigo) return { texto: '' }
        const f = porCodigo.get(claveCodigo(l.codigo))
        if (!f) return { texto: 'no está en el archivo', clase: 'text-muted-foreground' }
        if (f.semanasInventario === null) return { texto: 'sin ventas', clase: 'text-azul' }
        const e = estadoDeFila(f)
        return { texto: semanas(f.semanasInventario), clase: cn('tabular-nums font-semibold', e === 'agota' && 'text-rojo', e === 'sobra' && 'text-azul') }
      },
    },
  ]

  // Los productos que escribió sin nombre lo toman del archivo, para reconocerlos al editar.
  const conNombres = (ls: Pedido['listaInicial']) => ls.map((l) => ({ ...l, nombre: l.nombre || porCodigo.get(claveCodigo(l.codigo))?.nombre || '' }))
  const enHoja = actuales ?? new Set((pedido.listaFinal || pedido.listaInicial).map((l) => claveCodigo(l.codigo)))
  const quitados = pedido.listaInicial.filter((l) => !enHoja.has(claveCodigo(l.codigo)))

  if (pedido.terminado) {
    return (
      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Lo que de verdad vas a pedir</h2>
        <p className="text-muted-foreground">La guardaste el {fechaHora(pedido.finalGuardadaEn)}.</p>
        <Hoja inicial={pedido.listaFinal || []} soloLectura extras={extras} tituloCantidad="Vas a pedir" />
      </Tarjeta>
    )
  }

  async function guardar() {
    setError(null)
    const cuerpo = { lineas: hoja.current?.lineas() || [] }
    setGuardando(true)
    try {
      const rev = await api<{ lineas: number; avisos: string[] }>('POST', `/pedidos/${pedido.id}/lista-final`, { ...cuerpo, revisar: true })
      const ok = await preguntar(
        '¿Guardar tu lista final?',
        <>
          <p>{rev.lineas === 0 ? 'Tu lista final está vacía: ¿no vas a pedir nada?' : <>Vas a guardar tu lista final con <strong>{plural(rev.lineas, 'producto', 'productos')}</strong>.</>}</p>
          {rev.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-[0.93rem] text-ambar-texto">{rev.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
        </>,
      )
      if (!ok) return setGuardando(false)
      auto.cancelar()
      await api('POST', `/pedidos/${pedido.id}/lista-final`, cuerpo)
      ir(5)
    } catch (e) {
      setGuardando(false)
      setError(textoErrores(e))
      const errs = (e as { datos?: { errores?: { fila: number }[] } }).datos?.errores
      if (errs) hoja.current?.marcarErrores(errs.map((x) => x.fila).filter(Boolean))
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
      {ventana}
      <div>
        <h2 className="text-xl font-bold">Lo que de verdad vas a pedir</h2>
        <p className="mt-1 text-muted-foreground">Arrancamos con una copia de tu lista inicial, por eso al comienzo "Vas a pedir" e "Ibas a pedir" son iguales. Al lado ves lo que SINESC te sugiere pedir de cada producto. Tú decides: cambia "Vas a pedir", agrega o quita productos, y en "Cambio" ves la diferencia.</p>
      </div>
      <Boton tamano="chico" className="self-start" aria-expanded={verReporte} onClick={() => setVerReporte((v) => !v)}>{verReporte ? 'Ocultar el reporte' : 'Mostrar el reporte'}</Boton>
      {verReporte && <div className="aparecer"><Reporte r={r} compacto /></div>}
      {sug && <RecuadroSugerido sug={sug} hoja={hoja} alCambiarLista={cambio} alCambiarAjustes={cargarSugerido} />}
      <ImportarLista pedidoId={pedido.id} para="final" hoja={hoja} alImportar={cambio} />
      <Hoja ref={hoja} inicial={conNombres(pedido.listaFinal || pedido.listaInicial)} extras={extras} alCambiar={cambio} tituloCantidad="Vas a pedir" />
      {quitados.length > 0 && (
        <p className="text-[0.93rem]">
          <strong>Quitaste {plural(quitados.length, 'producto', 'productos')} de tu lista inicial:</strong>{' '}
          {quitados.map((l) => { const n = l.nombre || porCodigo.get(claveCodigo(l.codigo))?.nombre; return `${l.codigo}${n ? ` ${n}` : ''} (ibas a pedir ${numero(cantidad(l.cantidad))})` }).join(', ')}.
        </p>
      )}
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">{auto.estado}</span>
        <Boton variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Revisando…' : 'Guardar lista final'}</Boton>
      </div>
    </Tarjeta>
  )
}

// --- Paso 5 -----------------------------------------------------------------------------------

function Paso5({ pedido, recargar }: { pedido: Pedido; recargar: () => Promise<void> }) {
  const c = pedido.comparacion!
  const n = c.conteo
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const router = useRouter()
  // Si el producto se escribió sin nombre, se toma el del archivo.
  const { r } = useReporte(pedido.id)
  const delArchivo = new Map((r?.filas || []).map((f) => [claveCodigo(f.codigo), f.nombre]))
  const nombre = (x: { codigo: string; nombre?: string }) => {
    const t = x.nombre || delArchivo.get(claveCodigo(x.codigo))
    return t ? ` · ${t}` : ''
  }

  async function terminar() {
    setEnviando(true)
    setError(null)
    try {
      await api('POST', `/pedidos/${pedido.id}/por-que`, { respuesta: texto })
      await recargar()
    } catch (e) {
      setError(textoErrores(e).mensaje)
      setEnviando(false)
    }
  }

  async function otro() {
    const { pedido: p } = await api<{ pedido: { id: number } }>('POST', '/pedidos', {})
    router.push(`/pedidos/${p.id}`)
  }

  return (
    <Tarjeta className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-bold">¿Por qué cambió?</h2>
        <p className="mt-1 text-muted-foreground">Comparamos tu lista inicial con la final, producto por producto (por código).</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Cifra n={n.agregadas} texto={n.agregadas === 1 ? 'línea agregada' : 'líneas agregadas'} />
        <Cifra n={n.quitadas} texto={n.quitadas === 1 ? 'línea quitada' : 'líneas quitadas'} />
        <Cifra n={n.cambiadas} texto="con cantidad distinta" />
        <Cifra n={n.total} texto={n.total === 1 ? 'línea cambiada en total' : 'líneas cambiadas en total'} destacado />
      </div>
      <details open={n.total > 0 && n.total <= 30} className="rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer font-semibold">Ver el detalle</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Detalle titulo="Agregadas" items={c.agregadas.map((x) => <><span className="text-muted-foreground">{x.codigo}</span>{nombre(x)}: {numero(x.cantidad, 2)}</>)} />
          <Detalle titulo="Quitadas" items={c.quitadas.map((x) => <><span className="text-muted-foreground">{x.codigo}</span>{nombre(x)}: {numero(x.cantidad, 2)}</>)} />
          <Detalle titulo="Cantidad distinta" items={c.cambiadas.map((x) => <><span className="text-muted-foreground">{x.codigo}</span>{nombre(x)}: {numero(x.antes, 2)} → {numero(x.despues, 2)}</>)} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{plural(c.iguales, 'línea quedó igual', 'líneas quedaron iguales')}.</p>
      </details>
      {pedido.terminado ? (
        <>
          <Aviso tono="ok" titulo={`Pedido terminado el ${fechaHora(pedido.terminadoEn)}. ¡Gracias!`}>
            <p className="mt-1 font-semibold">¿Por qué cambiaste lo que cambiaste?</p>
            <p className="whitespace-pre-line">{pedido.porQue}</p>
          </Aviso>
          <div className="flex flex-wrap gap-2.5">
            <BotonEnlace href="/panel">Ir al panel</BotonEnlace>
            <Boton variante="primario" onClick={otro}>Preparar otro pedido</Boton>
          </div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 font-semibold">
            ¿Por qué cambiaste lo que cambiaste?
            <textarea className={cn(claseEntrada, 'min-h-36 py-3 font-normal')} maxLength={5000} placeholder="Si no cambiaste nada, cuéntanos por qué." value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          {error && <ErrorLista mensaje={error} />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="?paso=4" className="font-semibold text-primary hover:text-primary-hover">← Volver a la lista final</Link>
            <Boton variante="primario" onClick={terminar} disabled={enviando}>{enviando ? 'Guardando…' : 'Terminar pedido'}</Boton>
          </div>
        </>
      )}
    </Tarjeta>
  )
}

function Cifra({ n, texto, destacado }: { n: number; texto: string; destacado?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-4', destacado ? 'border-verde-borde bg-verde-fondo' : 'border-border bg-card')}>
      <strong className={cn('font-display text-[1.8rem] tabular-nums', destacado && 'text-verde')}>{numero(n)}</strong>
      <span className="block text-sm text-muted-foreground">{texto}</span>
    </div>
  )
}

function Detalle({ titulo, items }: { titulo: string; items: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-1 font-bold">{titulo} ({items.length})</h3>
      {items.length ? <ul className="flex flex-col gap-1 text-[0.93rem]">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-sm text-muted-foreground">Ninguna.</p>}
    </div>
  )
}
