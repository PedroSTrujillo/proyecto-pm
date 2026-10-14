'use client'

// Un pedido de la prueba, en 5 pasos: lo que ibas a pedir → tus ventas y existencias → el
// reporte → tu lista final → por qué cambió. Las reglas (la lista inicial queda fija, no hay
// reporte sin lista inicial) se hacen cumplir en el servidor (server/pedidos.js).

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Ban, CalendarDays, Check, FileUp, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, prepararArchivo, textoErrores } from '@/lib/api'
import { descargar } from '@/lib/descargar'
import { claveCodigo, dia, fecha, fechaHora, mesAnio, numero, plural, semanas, ventasSemana } from '@/lib/formato'
import { GraficoVentas } from './graficos'
import { useInventario, useSesion } from './contexto'
import { useConfirmar } from './confirmar'
import { Hoja, type Extra, type HojaApi } from './hoja'
import { Reporte, estadoDeFila, type FilaReporte, type ReporteRotacion } from './reporte'
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
  anulado: { en: string; motivo: string } | null
}

const PASOS = ['Lo que ibas a pedir', 'Ventas y existencias', 'El reporte', 'Tu lista final', '¿Por qué cambió?']

export function PedidoFlujo({ id }: { id: number }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [error, setError] = useState<string | null>(null)
  const params = useSearchParams()!
  const { ventana: ventanaBorrar, preguntar: preguntarBorrar, preguntarTexto } = useConfirmar()
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

  async function anular() {
    const motivo = await preguntarTexto(
      `¿Anular el Pedido ${pedido!.numero}?`,
      'Queda guardado, pero no se puede editar ni cuenta en tus resultados. Puedes reactivarlo después.',
      'Motivo (opcional)',
      'Sí, anular',
    )
    if (motivo === null) return
    try {
      setPedido((await api<{ pedido: Pedido }>('POST', `/pedidos/${id}/anular`, { motivo })).pedido)
    } catch (e) {
      setError(textoErrores(e).mensaje)
    }
  }
  async function reactivar() {
    try {
      setPedido((await api<{ pedido: Pedido }>('POST', `/pedidos/${id}/reactivar`)).pedido)
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
        {pedido.terminado && !pedido.anulado && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">Terminado</span>}
        {pedido.anulado && <span className="rounded-full bg-rojo-fondo px-2.5 py-0.5 text-xs font-bold text-rojo-texto">Anulado</span>}
        {!pedido.anulado && (
          <span className="ml-auto flex gap-1">
            <Boton tamano="chico" variante="fantasma" className="text-muted-foreground hover:text-rojo-texto" onClick={anular} title="Queda guardado, pero no cuenta">
              <Ban /> Anular
            </Boton>
            {pedido.paso < 5 && (
              <Boton tamano="chico" variante="fantasma" className="text-muted-foreground hover:text-rojo-texto" onClick={borrar}>
                <Trash2 /> Borrar
              </Boton>
            )}
          </span>
        )}
      </header>
      {ventanaBorrar}
      {pedido.anulado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rojo-borde bg-rojo-fondo px-4 py-3">
          <p className="text-[0.95rem]">
            <strong>Anulado el {fechaHora(pedido.anulado.en)}.</strong> {pedido.anulado.motivo ? `Motivo: ${pedido.anulado.motivo}. ` : ''}No cuenta en tus resultados y no se puede editar.
          </p>
          <Boton tamano="chico" onClick={reactivar}><RotateCcw /> Reactivar</Boton>
        </div>
      )}

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

      {/* Anulado: se ve como quedó, sin poder tocarlo. */}
      <div inert={Boolean(pedido.anulado)} className={cn('flex flex-col gap-7', pedido.anulado && 'opacity-60')}>
        {paso === 1 && <Paso1 pedido={pedido} ir={ir} />}
        {paso === 2 && <Paso2 pedido={pedido} ir={ir} alCambiar={setPedido} />}
        {paso === 3 && <Paso3 pedido={pedido} ir={ir} />}
        {paso === 4 && <Paso4 pedido={pedido} ir={ir} />}
        {paso === 5 && <Paso5 pedido={pedido} recargar={cargar} />}
      </div>
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
        <p className="mt-1 text-muted-foreground">Anota lo que pedirías hoy, como lo haces siempre, antes de ver el reporte. Al final la comparamos con tu lista final.</p>
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
      <TuPedidoFrenteAlReporte pedido={pedido} r={r} />
      <Recordatorio pedidoId={pedido.id} />
      <Reporte r={r} />
      {!pedido.terminado && <Boton variante="primario" className="self-end" onClick={() => ir(4)}>Seguir: arma tu lista final <ArrowRight /></Boton>}
    </Tarjeta>
  )
}

// Lo primero que quiere saber quien va a pedir: cómo están los productos de su propia lista y qué
// se le está acabando que no tenía en cuenta. Sale del mismo reporte (no sugiere cantidades).
function TuPedidoFrenteAlReporte({ pedido, r }: { pedido: Pedido; r: ReporteRotacion }) {
  const porCodigo = new Map(r.filas.map((f) => [claveCodigo(f.codigo), f]))
  const enLista = new Set(pedido.listaInicial.map((l) => claveCodigo(l.codigo)))
  const lineas = pedido.listaInicial.map((l) => ({ l, f: porCodigo.get(claveCodigo(l.codigo)) }))
  const grupo = (e: string) => lineas.filter(({ f }) => (f ? estadoDeFila(f) : 'fuera') === e)
  const agotan = grupo('agota')
  const sobran = grupo('sobra')
  const fuera = grupo('fuera')
  const sinVentas = grupo('sin_ventas')
  const olvidados = r.filas
    .filter((f) => estadoDeFila(f) === 'agota' && f.promedioSemanal > 0 && !enLista.has(claveCodigo(f.codigo)))
    .sort((a, b) => b.promedioSemanal - a.promedioSemanal)
  const cant = (v: unknown) => numero(Number(String(v ?? '').replace(',', '.')))
  const nombre = (codigo: string, f?: FilaReporte) => f?.nombre || pedido.listaInicial.find((x) => x.codigo === codigo)?.nombre || ''
  const Fila = ({ codigo, f, extra, cantidad }: { codigo: string; f?: FilaReporte; extra: string; cantidad?: unknown }) => (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <span className="min-w-0"><span className="text-muted-foreground">{codigo}</span> {nombre(codigo, f)}</span>
      <span className="text-[0.9rem] tabular-nums">{extra}{cantidad !== undefined ? ` · ibas a pedir ${cant(cantidad)}` : ''}</span>
    </li>
  )
  return (
    <section aria-labelledby="tu-pedido" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 id="tu-pedido" className="text-lg font-bold">Tu pedido frente al reporte</h3>
        <p className="text-[0.93rem] text-muted-foreground">Los {plural(lineas.length, 'producto', 'productos')} que ibas a pedir, según tu archivo.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-rojo-borde bg-rojo-fondo p-3"><strong className="font-display text-2xl text-rojo tabular-nums">{agotan.length}</strong><span className="block text-[0.85rem] text-rojo-texto">se agotan</span></div>
        <div className="rounded-xl border border-azul-borde bg-azul-fondo p-3"><strong className="font-display text-2xl text-azul tabular-nums">{sobran.length + sinVentas.length}</strong><span className="block text-[0.85rem] text-azul-texto">sobran o no se venden</span></div>
        <div className="rounded-xl border border-border p-3"><strong className="font-display text-2xl tabular-nums">{lineas.length - agotan.length - sobran.length - sinVentas.length - fuera.length}</strong><span className="block text-[0.85rem] text-muted-foreground">están bien</span></div>
        <div className="rounded-xl border border-ambar-borde bg-ambar-fondo p-3"><strong className="font-display text-2xl text-ambar-texto tabular-nums">{olvidados.length}</strong><span className="block text-[0.85rem] text-ambar-texto">se agotan y no están en tu lista</span></div>
      </div>
      {(agotan.length > 0 || sobran.length + sinVentas.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {agotan.length > 0 && (
            <div>
              <strong className="text-[0.95rem] text-rojo-texto">De tu lista, se agotan</strong>
              <ul className="divide-y divide-border">{agotan.map(({ l, f }) => <Fila key={l.codigo} codigo={l.codigo} f={f} extra={`te alcanza para ${semanas(f!.semanasInventario ?? 0)} sem`} cantidad={l.cantidad} />)}</ul>
            </div>
          )}
          {sobran.length + sinVentas.length > 0 && (
            <div>
              <strong className="text-[0.95rem] text-azul-texto">De tu lista, ya te sobran</strong>
              <ul className="divide-y divide-border">{[...sobran, ...sinVentas].map(({ l, f }) => <Fila key={l.codigo} codigo={l.codigo} f={f} extra={f!.semanasInventario === null ? 'no se vendió' : `te alcanza para ${semanas(f!.semanasInventario)} sem`} cantidad={l.cantidad} />)}</ul>
            </div>
          )}
        </div>
      )}
      {olvidados.length > 0 && (
        <details className="rounded-xl border border-ambar-borde bg-ambar-fondo/50 px-4 py-3">
          <summary className="cursor-pointer font-semibold text-ambar-texto">Se agotan y no están en tu lista: los {Math.min(olvidados.length, 8)} que más vendes</summary>
          <ul className="mt-2 divide-y divide-ambar-borde">{olvidados.slice(0, 8).map((f) => <Fila key={f.codigo} codigo={f.codigo} f={f} extra={`vendes ${ventasSemana(f.promedioSemanal)}/sem · tienes ${numero(f.existencias)}`} />)}</ul>
        </details>
      )}
      {fuera.length > 0 && <p className="text-[0.88rem] text-muted-foreground">{plural(fuera.length, 'producto de tu lista no está', 'productos de tu lista no están')} en el archivo: {fuera.map(({ l }) => l.codigo).join(', ')}.</p>}
    </section>
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
        <p><strong>¿Quieres un recordatorio?</strong> {plural(plan.productos, 'producto baja', 'productos bajan')} de {plan.semanasAgota ?? 2} semanas en los próximos 3 meses al ritmo actual; el primero, {p.codigo}{p.nombre ? ` (${p.nombre})` : ''}, hacia el {dia(p.fechaUmbral)}. Te avisamos en tu calendario {plan.diasAntes} días antes{plan.correo ? ` y por correo a ${d.email}` : ''}, máximo una vez por semana.</p>
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

type ProductoSugerido = {
  codigo: string; nombre: string; sugerido: number | null; semanas: number | null; estado: string
  ventasSemana: number; existencias: number; entrega: number; lote: number | null; proveedor: string; costo: number | null
  detalle: { semanasCubrir: number; media: number; alto: number; ventaSemana: number } | null
  serie: number[] | null; pronostico: { media: number; bajo: number; alto: number }[] | null; semanasPico: number[]
  pico: { mes: string; vendido: number; contado: number } | null
  ventaUnica?: { vendido: number; semanas: number; desde: string } | null
}
type Sugerido = { entrega: number; entregas?: Record<string, number>; cadaCuanto: number; nivelServicio: number; semanas: string[]; semanasPronostico: string[]; productos: ProductoSugerido[] }

// Para cuántas semanas alcanza tener "existencias + cantidad" al ritmo que se espera vender.
const duraSemanas = (p: ProductoSugerido, cantidad: number) =>
  p.detalle && p.detalle.ventaSemana > 0 ? (Math.max(p.existencias, 0) + Math.max(cantidad, 0)) / p.detalle.ventaSemana : null
const textoDura = (s: number | null) => (s === null ? '' : s >= 26 ? 'más de 6 meses' : `${semanas(s)} semanas (unos ${Math.round(s * 7)} días)`)

// Lo que sugiere el modelo para este pedido: se puede ajustar el tiempo de entrega y cada cuánto
// pide, llevar las cantidades sugeridas a la lista o agregar lo que se agota y no está en ella.
function RecuadroSugerido({ sug, hoja, alCambiarLista, alCambiarAjustes }: { sug: Sugerido; hoja: React.RefObject<HojaApi | null>; alCambiarLista: () => void; alCambiarAjustes: () => void }) {
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)
  const enLista = new Set((hoja.current?.lineas() || []).map((l) => claveCodigo(l.codigo)))
  // Lo que se agota y no está en la lista, de lo que más se vende a lo que menos.
  const faltan = sug.productos
    .filter((p) => (p.estado === 'agota' || p.estado === 'pide') && (p.sugerido || 0) > 0 && !enLista.has(claveCodigo(p.codigo)))
    .sort((a, b) => (b.detalle?.ventaSemana ?? b.ventasSemana) - (a.detalle?.ventaSemana ?? a.ventasSemana))
  const urgentes = faltan.slice(0, 10)
  const porCodigo = new Map(sug.productos.map((p) => [claveCodigo(p.codigo), p]))

  // Los proveedores de este archivo, con cuánto tarda cada uno (de Datos, o el de todos).
  const proveedores = [...new Map(sug.productos.filter((p) => p.proveedor && p.proveedor !== 'Sin proveedor').map((p) => [p.proveedor, p.entrega])).entries()]
    .map(([nombre, entrega]) => ({ nombre, entrega, productos: sug.productos.filter((p) => p.proveedor === nombre).length }))
    .sort((a, b) => b.productos - a.productos)

  async function ajustar(campo: 'entregaPorDefecto' | 'cadaCuanto' | 'entregas', valor: number | Record<string, number>) {
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
  function agregar(ps: ProductoSugerido[]) {
    const lineas = (hoja.current?.lineas() || []).filter((l) => l.codigo || l.nombre || l.cantidad)
    hoja.current?.fijar([...lineas, ...ps.map((p) => ({ codigo: p.codigo, nombre: p.nombre, cantidad: String(p.sugerido) }))])
    alCambiarLista()
    setHecho(`Se ${ps.length === 1 ? 'agregó' : 'agregaron'} ${plural(ps.length, 'producto', 'productos')} con su cantidad sugerida al final de tu lista. Quita los que no vayas a pedir.`)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4 sm:p-5">
      <div>
        <strong className="text-[0.97rem]">Lo que sugiere SINESC</strong>
        <p className="mt-0.5 text-[0.93rem] text-muted-foreground">Lo que falta de cada producto para llegar al siguiente pedido sin agotarse.</p>
        <details className="mt-1 text-[0.9rem]">
          <summary className="cursor-pointer font-semibold text-primary">¿Cómo lo calcula?</summary>
          <p className="mt-1 text-muted-foreground">Con lo que vendes por semana (lo reciente pesa más y se tiene en cuenta la temporada), cuánto tarda tu proveedor y cada cuánto pides, para que no te falte en {Math.round(sug.nivelServicio * 10)} de cada 10 casos. Ya resta lo que tienes, y si un producto se vende siempre por paquetes, redondea al paquete. Lo que el reporte marca como que sobra no se sugiere.</p>
        </details>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="flex items-center gap-3 text-[0.93rem]">
          <span>{proveedores.length ? 'Por defecto, un proveedor tarda' : 'Tu proveedor tarda'}</span>
          <Contador valor={sug.entrega} etiqueta="el tiempo de entrega" paso={1} onMover={(d) => !guardando && ajustar('entregaPorDefecto', Math.max(0, Math.min(26, sug.entrega + d)))} />
        </div>
        <div className="flex items-center gap-3 text-[0.93rem]">
          <span>Pides cada</span>
          <Contador valor={sug.cadaCuanto} etiqueta="cada cuánto pides" paso={1} onMover={(d) => !guardando && ajustar('cadaCuanto', Math.max(1, Math.min(26, sug.cadaCuanto + d)))} />
        </div>
      </div>
      {proveedores.length > 0 ? (
        <details className="text-[0.9rem]" open={proveedores.length <= 6}>
          <summary className="cursor-pointer font-semibold">Cuánto tarda cada proveedor ({proveedores.length})</summary>
          <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {proveedores.slice(0, 30).map((pr) => (
              <li key={pr.nombre} className="flex items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-1.5">
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold">{pr.nombre}</span>
                  <span className="text-xs text-muted-foreground">{plural(pr.productos, 'producto', 'productos')}</span>
                </span>
                <Contador valor={pr.entrega} etiqueta={`lo que tarda ${pr.nombre}`} paso={1} onMover={(d) => !guardando && ajustar('entregas', { ...(sug.entregas || {}), [pr.nombre]: Math.max(0, Math.min(52, pr.entrega + d)) })} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">"Por defecto" aplica a los proveedores sin tiempo propio. Se guarda también en Datos.</p>
        </details>
      ) : (
        <p className="text-xs text-muted-foreground">Los proveedores con tiempo propio en Datos usan ese.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Boton tamano="chico" onClick={usarSugeridas}>Usar las cantidades sugeridas en mi lista</Boton>
        {urgentes.length > 0 && (
          <Boton tamano="chico" onClick={() => agregar(urgentes)}>Agregar {urgentes.length === faltan.length ? `los ${urgentes.length}` : `los ${urgentes.length} más vendidos`} que se agotan y no están en mi lista</Boton>
        )}
      </div>
      {faltan.length > 0 && (
        <details className="text-[0.9rem]">
          <summary className="cursor-pointer text-muted-foreground">Ver los {faltan.length} que se agotan y no están en tu lista</summary>
          <ul className="mt-2 flex flex-col divide-y divide-[#cfe5e1]">
            {faltan.slice(0, 40).map((p) => (
              <li key={p.codigo} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span><span className="text-muted-foreground">{p.codigo}</span> · {p.nombre}: te alcanza para {semanas(p.semanas ?? 0)} semanas; sugerido <strong>{numero(p.sugerido ?? 0)}</strong></span>
                <button type="button" onClick={() => agregar([p])} className="presionable rounded-md border border-primary/40 bg-card px-2 py-0.5 text-[0.78rem] font-semibold text-primary hover:bg-primary hover:text-primary-foreground">Agregar</button>
              </li>
            ))}
          </ul>
          {faltan.length > 40 && <p className="mt-1 text-muted-foreground">Y {faltan.length - 40} más.</p>}
        </details>
      )}
      {hecho && <p className="text-[0.93rem] font-semibold text-primary" aria-live="polite">{hecho}</p>}
    </div>
  )
}

// Lo que lleva cambiado frente a la lista inicial: es lo que mide la prueba.
function ResumenCambios({ hoja, inicial, version, sugeridos }: { hoja: React.RefObject<HojaApi | null>; inicial: Pedido['listaInicial']; version: unknown; sugeridos: Map<string, ProductoSugerido> }) {
  void version // se vuelve a calcular cada vez que cambia la hoja
  const cant = (v: unknown) => Number(String(v ?? '').trim().replace(',', '.'))
  const ahora = new Map((hoja.current?.lineas() || []).filter((l) => l.codigo && cant(l.cantidad) > 0).map((l) => [claveCodigo(l.codigo), cant(l.cantidad)]))
  const antes = new Map(inicial.map((l) => [claveCodigo(l.codigo), cant(l.cantidad)]))
  let agregadas = 0
  let quitadas = 0
  let distintas = 0
  for (const [k, v] of ahora) if (!antes.has(k)) agregadas++; else if (Math.abs(antes.get(k)! - v) > 1e-9) distintas++
  for (const k of antes.keys()) if (!ahora.has(k)) quitadas++
  const total = agregadas + quitadas + distintas
  let unidades = 0
  let plata = 0
  let conCosto = 0
  for (const [k, v] of ahora) {
    unidades += v
    const c = sugeridos.get(k)?.costo
    if (c && c > 0) { plata += c * v; conCosto++ }
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted px-4 py-3 text-[0.95rem] sm:flex-row sm:items-center sm:justify-between">
      <span className="font-semibold">
        Tu pedido: {plural(ahora.size, 'producto', 'productos')}, {numero(unidades)} unidades
        {conCosto > 0 && <> · {plata.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })} a costo{conCosto < ahora.size ? ` (${conCosto} con costo)` : ''}</>}
      </span>
    <p>
      {total === 0
        ? 'Por ahora tu lista final es igual a la inicial.'
        : <>Frente a lo que ibas a pedir llevas <strong>{plural(total, 'línea cambiada', 'líneas cambiadas')}</strong>: {plural(agregadas, 'agregada', 'agregadas')}, {plural(quitadas, 'quitada', 'quitadas')} y {plural(distintas, 'con otra cantidad', 'con otra cantidad')}.</>}
    </p>
    </div>
  )
}

// El detalle de un producto: por qué se sugiere esa cantidad, para cuánto dura y sus ventas.
function DetalleSugerido({ p, sug, vasAPedir, ibasAPedir, alCerrar }: { p: ProductoSugerido; sug: Sugerido; vasAPedir: number; ibasAPedir: number | null; alCerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [p.codigo])
  const d = p.detalle
  const historia = (p.serie ?? []).map((v, i) => ({ inicio: sug.semanas[sug.semanas.length - (p.serie?.length ?? 0) + i] ?? '', valor: v }))
  const pronostico = (p.pronostico ?? []).map((x, i) => ({ ...x, inicio: sug.semanasPronostico[i] ?? '' }))
  const ultimas = (p.serie ?? []).slice(-8)
  return (
    <div ref={ref} className="aparecer flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[0.82rem] text-muted-foreground">{p.codigo}{p.proveedor !== 'Sin proveedor' ? ` · ${p.proveedor}` : ''}</span>
          <h3 className="text-lg leading-snug font-bold">{p.nombre}</h3>
        </div>
        <Boton tamano="chico" variante="fantasma" onClick={alCerrar}>Cerrar</Boton>
      </div>
      {p.ventaUnica ? (
        <VentaUnica v={p.ventaUnica} existencias={p.existencias} />
      ) : p.sugerido === null || !d ? (
        <p>No se vendió en el periodo de tu archivo, así que no hay cómo sugerir una cantidad. Tienes {numero(p.existencias)}.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-secondary p-3"><span className="block text-[0.82rem] font-semibold">SINESC sugiere</span><strong className="font-display text-2xl tabular-nums text-primary">{numero(p.sugerido)}</strong><span className="block text-[0.85rem]">con lo que tienes, dura {textoDura(duraSemanas(p, p.sugerido))}</span></div>
            <div className="rounded-xl border border-border p-3"><span className="block text-[0.82rem] font-semibold text-muted-foreground">Tu cantidad final</span><strong className="font-display text-2xl tabular-nums">{numero(vasAPedir)}</strong><span className="block text-[0.85rem]">dura {textoDura(duraSemanas(p, vasAPedir))}</span></div>
            <div className="rounded-xl border border-border p-3"><span className="block text-[0.82rem] font-semibold text-muted-foreground">Ibas a pedir</span><strong className="font-display text-2xl tabular-nums">{ibasAPedir === null ? '—' : numero(ibasAPedir)}</strong><span className="block text-[0.85rem]">{ibasAPedir === null ? 'no estaba en tu lista' : `dura ${textoDura(duraSemanas(p, ibasAPedir))}`}</span></div>
          </div>
          <div>
            <strong className="text-[0.95rem]">Por qué {numero(p.sugerido)}</strong>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-[0.93rem]">
              <li>Vendes unas <strong>{ventasSemana(d.ventaSemana)}</strong> por semana de aquí en adelante (lo de los últimos meses pesa más y se tiene en cuenta la temporada).</li>
              <li>Tu proveedor tarda {semanas(p.entrega)} {p.entrega === 1 ? 'semana' : 'semanas'} y pides cada {semanas(sug.cadaCuanto)}: este pedido tiene que cubrir <strong>{semanas(d.semanasCubrir)} semanas</strong>.</li>
              {p.estado !== 'sobra' && <li>En esas semanas lo más probable es vender <strong>{numero(Math.round(d.media))}</strong>. Para no quedarte corto en {Math.round(sug.nivelServicio * 10)} de cada 10 casos hay que contar con <strong>{numero(Math.ceil(d.alto))}</strong>.</li>}
              {p.estado === 'sobra' ? (
                <li>Tienes {numero(Math.max(p.existencias, 0))}, que te alcanzan para {textoDura(duraSemanas(p, 0))}: más de las {semanas(d.semanasCubrir)} que cubre este pedido. No hace falta pedirlo; el reporte lo marca como que sobra.</li>
              ) : (
              <li>Tienes {numero(Math.max(p.existencias, 0))}: te faltan {numero(p.lote && p.lote > 1 ? Math.max(0, Math.ceil(d.alto - Math.max(p.existencias, 0))) : p.sugerido)}{p.lote && p.lote > 1 ? `, que redondeado a paquetes de ${p.lote} da ${numero(p.sugerido)}` : ''}.</li>
              )}
            </ol>
            {(() => {
              const dura = duraSemanas(p, p.sugerido)
              return dura !== null && p.sugerido > 0 && dura > d.semanasCubrir * 1.5 ? (
                <p className="mt-2 text-[0.9rem] text-muted-foreground">
                  Dura más de {semanas(d.semanasCubrir)} semanas porque sus ventas son irregulares: al ritmo normal alcanza para {textoDura(dura)}, y el margen cubre una venta grande antes del siguiente pedido.
                </p>
              ) : null
            })()}
          </div>
        </>
      )}
      {historia.length > 4 && (
        <div className="flex flex-col gap-2">
          <strong className="text-[0.95rem]">Sus ventas por semana y lo que viene</strong>
          <GraficoVentas historia={historia} pronostico={pronostico} marcas={p.semanasPico} alto={180} descripcion={`Ventas semanales de ${p.nombre} y pronóstico`} />
          {ultimas.length > 0 && <p className="text-[0.88rem] text-muted-foreground">Últimas {ultimas.length} semanas de tu archivo: {ultimas.map((x) => numero(x)).join(', ')}.</p>}
          {p.pico && <p className="text-[0.88rem] text-ambar-texto">En {mesAnio(p.pico.mes)} vendió {numero(p.pico.vendido)}, mucho más de lo normal (un proyecto o un cliente puntual). Para el promedio se contaron {numero(p.pico.contado)}.</p>}
        </div>
      )}
    </div>
  )
}

// Lo que se dice de un producto que se vendió de una sola vez (server/inventario.js, ventaUnica).
export function VentaUnica({ v, existencias }: { v: { vendido: number; semanas: number; desde: string }; existencias: number }) {
  return (
    <div className="rounded-xl border border-ambar-borde bg-ambar-fondo p-3.5 text-[0.93rem]">
      <strong className="block text-ambar-texto">SINESC sugiere 0: se vendió de una sola vez</strong>
      Las {numero(v.vendido)} unidades se vendieron {v.semanas === 1 ? 'en la semana' : 'en las dos semanas'} del {fecha(v.desde)} y no volvió a venderse. Parece un proyecto puntual. Tienes {numero(Math.max(existencias, 0))}; si esperas otro pedido igual, escribe tú la cantidad.
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
  const [detalle, setDetalle] = useState<{ codigo: string; cantidad: number } | null>(null)
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
  // La cantidad que hay ahora en la hoja para un producto (el detalle se actualiza al editarla).
  const cantidadEnHoja = (codigo: string) => {
    const l = (hoja.current?.lineas() || []).find((x) => claveCodigo(x.codigo) === codigo)
    return l ? cantidad(l.cantidad) : null
  }
  const textoSem = (n: number) => (n >= 26 ? '+6 meses' : `${semanas(n)} sem`)
  const cambiada = (l: { codigo: string; cantidad: string }) => {
    if (!l.codigo) return false
    const x = inicial.get(claveCodigo(l.codigo))
    return !x || Math.abs(cantidad(x.cantidad) - cantidad(l.cantidad)) > 1e-9
  }
  // Antes de la cantidad: cómo está el producto, lo que iba a pedir y lo que sugiere SINESC.
  const extrasAntes: Extra[] = [
    {
      titulo: 'Te alcanza hoy',
      valor: (l) => {
        if (!l.codigo) return { texto: '' }
        const f = porCodigo.get(claveCodigo(l.codigo))
        if (!f) return { texto: 'no está en el archivo', clase: 'text-muted-foreground' }
        if (f.semanasInventario === null) return { texto: 'sin ventas', clase: 'text-azul' }
        const e = estadoDeFila(f)
        return { texto: textoSem(f.semanasInventario), sub: e === 'agota' ? 'se agota' : e === 'sobra' ? 'sobra' : undefined, clase: cn('tabular-nums font-semibold', e === 'agota' && 'text-rojo', e === 'sobra' && 'text-azul'), claseSub: e === 'agota' ? 'text-rojo-texto' : 'text-azul-texto' }
      },
    },
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
      titulo: 'SINESC sugiere',
      valor: (l) => {
        if (!l.codigo || !sug) return { texto: '' }
        const x = sugPorCodigo.get(claveCodigo(l.codigo))
        if (!x) return { texto: '—', clase: 'text-muted-foreground' }
        if (x.sugerido === null) return { texto: 'sin ventas', clase: 'text-azul' }
        if (x.sugerido === 0) return { texto: '0', sub: x.ventaUnica ? 'se vendió una vez' : 'te alcanza', clase: 'tabular-nums font-semibold text-muted-foreground' }
        const d = duraSemanas(x, x.sugerido)
        return { texto: numero(x.sugerido), sub: d !== null ? `dura ${textoSem(d)}` : undefined, clase: 'tabular-nums text-[1rem] font-bold text-primary' }
      },
      alClic: (l) => setDetalle({ codigo: claveCodigo(l.codigo), cantidad: cantidad(l.cantidad) }),
      accion: (l, i) => {
        const x = l.codigo ? sugPorCodigo.get(claveCodigo(l.codigo)) : undefined
        if (!x || x.sugerido === null || cantidad(l.cantidad) === x.sugerido) return null
        return { texto: 'Usar', titulo: `Poner ${x.sugerido} en tu cantidad final`, alClic: () => hoja.current?.ponerCantidad(i, String(x.sugerido)) }
      },
    },
  ]
  // Después de la cantidad: qué cambió y para cuánto le dura lo que decidió.
  const extras: Extra[] = [
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
      titulo: 'Con tu cantidad, dura',
      valor: (l) => {
        if (!l.codigo) return { texto: '' }
        const x = sugPorCodigo.get(claveCodigo(l.codigo))
        if (!x || !x.detalle) return { texto: '' }
        const q = cantidad(l.cantidad)
        const d = duraSemanas(x, Number.isFinite(q) ? q : 0)
        if (d === null) return { texto: '' }
        // Si no alcanza hasta que llegue el siguiente pedido, se marca.
        const corto = d < x.detalle.semanasCubrir
        return { texto: textoSem(d), sub: corto ? 'no alcanza' : undefined, clase: cn('tabular-nums', corto ? 'font-semibold text-rojo-texto' : 'text-muted-foreground'), claseSub: 'text-rojo-texto' }
      },
    },
  ]
  const extrasAntesLectura = extrasAntes.map(({ accion: _a, ...x }) => x)

  // Los productos que escribió sin nombre lo toman del archivo, para reconocerlos al editar.
  const conNombres = (ls: Pedido['listaInicial']) => ls.map((l) => ({ ...l, nombre: l.nombre || porCodigo.get(claveCodigo(l.codigo))?.nombre || '' }))
  const enHoja = actuales ?? new Set((pedido.listaFinal || pedido.listaInicial).map((l) => claveCodigo(l.codigo)))
  const quitados = pedido.listaInicial.filter((l) => !enHoja.has(claveCodigo(l.codigo)))

  if (pedido.terminado) {
    return (
      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Lo que de verdad vas a pedir</h2>
        <p className="text-muted-foreground">La guardaste el {fechaHora(pedido.finalGuardadaEn)}.</p>
        <Hoja inicial={pedido.listaFinal || []} soloLectura extrasAntes={extrasAntesLectura} extras={extras} tituloCantidad="Tu cantidad final" destacarCantidad />
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
        <h2 className="text-xl font-bold">Arma tu pedido de verdad</h2>
        <p className="mt-1 text-muted-foreground">Parte de tu lista inicial. Tú decides la cantidad final de cada producto.</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ['Mira cada producto', 'Cuánto te alcanza hoy, lo que ibas a pedir y lo que sugiere SINESC. Haz clic en el sugerido para ver por qué.'],
          ['Escribe tu cantidad final', 'En la columna verde con el lápiz escribes con cuánto te quedas, o le das «Usar» al sugerido.'],
          ['Guarda tu lista', 'En «Cambio» ves la diferencia con lo que ibas a pedir y en «Con tu cantidad dura», para cuánto te alcanza.'],
        ].map(([t, d], k) => (
          <li key={t} className="flex gap-3 rounded-xl border border-border p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{k + 1}</span>
            <span className="text-[0.92rem]"><strong className="block">{t}</strong><span className="text-muted-foreground">{d}</span></span>
          </li>
        ))}
      </ol>
      <Boton tamano="chico" className="self-start" aria-expanded={verReporte} onClick={() => setVerReporte((v) => !v)}>{verReporte ? 'Ocultar el reporte' : 'Mostrar el reporte'}</Boton>
      {verReporte && <div className="aparecer"><Reporte r={r} compacto /></div>}
      {sug && <RecuadroSugerido sug={sug} hoja={hoja} alCambiarLista={cambio} alCambiarAjustes={cargarSugerido} />}
      <Hoja ref={hoja} inicial={conNombres(pedido.listaFinal || pedido.listaInicial)} extrasAntes={extrasAntes} extras={extras} alCambiar={cambio} tituloCantidad="Tu cantidad final" destacarCantidad claseFila={(l) => (cambiada(l) ? 'bg-ambar-fondo/60' : undefined)} />
      {detalle && sug && sugPorCodigo.get(detalle.codigo) && (
        <DetalleSugerido p={sugPorCodigo.get(detalle.codigo)!} sug={sug} vasAPedir={cantidadEnHoja(detalle.codigo) ?? detalle.cantidad} ibasAPedir={inicial.has(detalle.codigo) ? cantidad(inicial.get(detalle.codigo)!.cantidad) : null} alCerrar={() => setDetalle(null)} />
      )}
      <ResumenCambios hoja={hoja} inicial={pedido.listaInicial} version={actuales} sugeridos={sugPorCodigo} />
      {quitados.length > 0 && (
        <p className="text-[0.93rem]">
          <strong>Quitaste {plural(quitados.length, 'producto', 'productos')} de tu lista inicial:</strong>{' '}
          {quitados.map((l) => { const n = l.nombre || porCodigo.get(claveCodigo(l.codigo))?.nombre; return `${l.codigo}${n ? ` ${n}` : ''} (ibas a pedir ${numero(cantidad(l.cantidad))})` }).join(', ')}.
        </p>
      )}
      <details className="text-[0.92rem]">
        <summary className="cursor-pointer text-muted-foreground">¿Tienes tu pedido en otro Excel? Impórtalo</summary>
        <div className="mt-2"><ImportarLista pedidoId={pedido.id} para="final" hoja={hoja} alImportar={cambio} /></div>
      </details>
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
          <OrdenDeCompra pedido={pedido} />
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

// La lista final, lista para mandar: Excel con una hoja por proveedor, PDF para que gerencia lo
// apruebe y el mensaje para WhatsApp. Usa el proveedor y el costo del archivo si venían.
function OrdenDeCompra({ pedido }: { pedido: Pedido }) {
  const { sug } = useSugerido(pedido.id)
  const { usuario } = useSesion()
  const [aviso, setAviso] = useState<string | null>(null)
  const porCodigo = new Map((sug?.productos || []).map((p) => [claveCodigo(p.codigo), p]))
  const lineas = (pedido.listaFinal || [])
    .map((l) => {
      const p = porCodigo.get(claveCodigo(l.codigo))
      return { codigo: l.codigo, nombre: l.nombre || p?.nombre || '', cantidad: Number(String(l.cantidad).replace(',', '.')), proveedor: p?.proveedor && p.proveedor !== 'Sin proveedor' ? p.proveedor : '', costo: p?.costo ?? null, semanas: p?.semanas ?? null }
    })
    .filter((l) => l.cantidad > 0)
  if (!lineas.length) return null
  const unidades = lineas.reduce((t, l) => t + l.cantidad, 0)
  const plata = lineas.reduce((t, l) => t + (l.costo ? l.costo * l.cantidad : 0), 0)
  const empresa = usuario?.nombre || ''
  const fechaArchivo = new Date().toLocaleDateString('en-CA')
  const mensaje = ['Hola, buen día. Este es nuestro pedido:', ...lineas.map((l) => `• ${l.codigo} ${l.nombre}: ${numero(l.cantidad)}`), '', 'Quedamos atentos a la confirmación y la fecha de entrega. Gracias.'].join('\n')

  async function bajar(tipo: 'xlsx' | 'pdf') {
    setAviso(null)
    try {
      await descargar(`/exportar/pedido.${tipo}`, { empresa, cadaCuanto: sug ? `${semanas(sug.cadaCuanto)} semanas` : undefined, lineas }, tipo === 'pdf' ? `pedido-para-aprobar-${fechaArchivo}.pdf` : `pedido-${fechaArchivo}.xlsx`)
      setAviso(tipo === 'pdf' ? 'Listo: el PDF trae el pedido, los totales y el espacio para la firma.' : 'Listo: el Excel trae un resumen y una hoja por proveedor.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No pudimos armar el archivo.')
    }
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
      setAviso('Copiado. Pégalo en el chat de tu proveedor.')
    } catch {
      setAviso('Tu navegador no dejó copiar: selecciona el mensaje de abajo.')
    }
  }

  return (
    <section aria-labelledby="orden-compra" className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-secondary p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="orden-compra" className="text-lg font-bold">Tu orden de compra</h3>
        <span className="text-[0.93rem] font-semibold">
          {plural(lineas.length, 'producto', 'productos')} · {numero(unidades)} unidades
          {plata > 0 && <> · {plata.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })} a costo</>}
        </span>
      </div>
      <p className="text-[0.93rem] text-muted-foreground">Tu lista final, lista para enviar al proveedor o para aprobación.</p>
      <div className="flex flex-wrap gap-2">
        <Boton tamano="chico" variante="primario" onClick={() => bajar('pdf')}>PDF para aprobar</Boton>
        <Boton tamano="chico" onClick={() => bajar('xlsx')}>Excel por proveedor</Boton>
        <Boton tamano="chico" onClick={copiar}>Copiar mensaje para WhatsApp</Boton>
      </div>
      {aviso && <p className="text-[0.93rem] font-semibold text-primary" aria-live="polite">{aviso}</p>}
      <details className="text-[0.9rem]">
        <summary className="cursor-pointer text-muted-foreground">Ver el mensaje</summary>
        <pre className="mt-2 rounded-lg bg-card p-3 font-sans whitespace-pre-wrap">{mensaje}</pre>
      </details>
    </section>
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
