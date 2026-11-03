'use client'

// Un pedido de la prueba, en 5 pasos: lo que ibas a pedir → tus ventas y existencias → el
// reporte → tu lista final → tu pedido. Las reglas (la lista inicial queda fija, no hay
// reporte sin lista inicial) se hacen cumplir en el servidor (server/pedidos.js).

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Ban, CalendarDays, Check, FileUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, prepararArchivo, textoErrores } from '@/lib/api'
import { bajar as bajarArchivo } from '@/lib/descargar'
import { alcance, claveCodigo, dia, fecha, fechaHora, mesAnio, numero, plural, semanas, ventasSemana } from '@/lib/formato'
import { GraficoVentas } from './graficos'
import { useInventario, useSesion } from './contexto'
import { useConfirmar } from './confirmar'
import { Hoja, type Extra, type HojaApi } from './hoja'
import { Reporte, estadoDeFila, type FilaReporte, type ReporteRotacion } from './reporte'
import { FormularioColumnas, SubirArchivos, type HojaMapeo } from './subir'
import { Aviso, Boton, BotonEnlace, Cargando, ChipAprobacion, Contador, Desplegable, ErrorLista, Tarjeta, claseEntrada } from './ui'
import { PedidoPreparar } from './pedido-preparar'
import { RecibirPedido } from './recepcion'
import { useAutoguardado } from './autoguardado'
import type { Aprobacion, Clase, EntradaHistorial, Estado, Recepcion } from '@/lib/tipos'

export type LineaGuardada = { codigo: string; nombre?: string; cantidad: number | string; proveedor?: string; nota?: string }
type Conteo = { agregadas: number; quitadas: number; cambiadas: number; total: number }
// Una línea de la foto de lo sugerido que se guardó al crear el pedido (server/pedidos.js).
export type LineaSugerida = { codigo: string; nombre: string; proveedor: string; cantidad: number; estado: Estado; semanas: number | null; costo: number | null; existencias: number; familia?: string | null; clase?: Clase | null }
export type Pedido = {
  id: number
  modo: 'lista' | 'sugerido'
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
  sugerido: LineaSugerida[] | null
  observaciones: string
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
  recepcion?: Recepcion | null
  aprobacion?: Aprobacion | null // solo desde lo sugerido
  historial?: EntradaHistorial[] | null
}

const PASOS = ['Lo que iba a pedir', 'Ventas y existencias', 'El reporte', 'Su lista final', 'Su pedido']

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
  // Al cambiar de paso se recarga: en el paso 3 se pueden agregar productos a la lista final.
  const pasoPedido = params.get('paso')
  useEffect(() => { cargar() }, [pasoPedido, cargar])

  if (error) return <><VolverAPedidos /><ErrorLista mensaje={error} /></>
  if (!pedido) return <Cargando texto="Cargando el pedido…" />

  const alcanzable = Math.min(pedido.paso, 5)
  const pedidoPaso = Number(params.get('paso'))
  const paso = pedidoPaso >= 1 && pedidoPaso <= alcanzable ? pedidoPaso : alcanzable
  async function borrar() {
    const si = await preguntarBorrar(`¿Borrar el Pedido ${pedido!.numero}?`, 'Se borra lo que lleva de este pedido y no se puede deshacer.', 'Sí, borrar', true)
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
      'Queda guardado, pero no se puede editar ni cuenta en sus resultados. Lo puede reactivar después.',
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
        <h1 className="text-[2.1rem] leading-tight font-extrabold sm:text-[2.35rem]">Pedido {pedido.numero}{pedido.proveedor ? ` · ${pedido.proveedor}` : ''}</h1>
        {pedido.modo === 'lista' && <span className="rounded-full bg-muted px-2.5 py-0.5 text-nota font-bold text-foreground/80">Con mi propia lista</span>}
        {!pedido.terminado && !pedido.anulado && pedido.modo === 'sugerido' && <ChipAprobacion estado={pedido.aprobacion?.estado ?? 'preparando'} />}
        {pedido.terminado && !pedido.anulado && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-nota font-bold text-secondary-foreground">{pedido.modo === 'sugerido' ? (pedido.aprobacion?.aprobado ? 'Aprobado' : 'Cerrado') : 'Terminado'}</span>}
        {pedido.anulado && <span className="rounded-full bg-rojo-fondo px-2.5 py-0.5 text-nota font-bold text-rojo-texto">Anulado</span>}
        {/* Quien aprueba ve el pedido de otra persona: anularlo o borrarlo es de quien lo preparó. */}
        {!pedido.anulado && pedido.aprobacion?.esMio !== false && (
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
      {pedido.modo === 'sugerido' ? (
        <div inert={Boolean(pedido.anulado)} className={cn('flex flex-col gap-7', pedido.anulado && 'opacity-60')}>
          {pedido.anulado && <AvisoAnulado pedido={pedido} reactivar={reactivar} />}
          <PedidoPreparar pedido={pedido} alCambiar={setPedido} />
          {pedido.terminado && pedido.recepcion?.espera && <Tarjeta className="p-5 sm:p-6"><RecibirPedido recepcion={pedido.recepcion} /></Tarjeta>}
        </div>
      ) : <>
      {pedido.anulado && <AvisoAnulado pedido={pedido} reactivar={reactivar} />}

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
                  <Link href={`${ruta}?paso=${n}`} aria-current={actual ? 'step' : undefined} className={cn('flex min-h-10 items-center gap-2 rounded-full pl-1.5 text-chico font-semibold transition-colors duration-150', actual ? 'bg-secondary text-secondary-foreground' : 'text-foreground/80 hover:bg-muted')}>
                    {contenido}
                  </Link>
                ) : (
                  <span title="Primero termina el paso anterior" className="flex min-h-10 items-center gap-2 rounded-full pl-1.5 text-chico font-semibold text-muted-foreground/70">{contenido}</span>
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
        {paso === 4 && <Paso4 key={`${(pedido.listaFinal || []).length}-${pedido.finalGuardadaEn}`} pedido={pedido} ir={ir} />}
        {paso === 5 && <Paso5 pedido={pedido} recargar={cargar} />}
        {paso === 5 && pedido.terminado && pedido.recepcion?.espera && <Tarjeta className="p-5 sm:p-6"><RecibirPedido recepcion={pedido.recepcion} /></Tarjeta>}
      </div>
      </>}
    </>
  )
}

function AvisoAnulado({ pedido, reactivar }: { pedido: Pedido; reactivar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rojo-borde bg-rojo-fondo px-4 py-3">
      <p className="text-cuerpo">
        <strong>Anulado el {fechaHora(pedido.anulado!.en)}.</strong> {pedido.anulado!.motivo ? `Motivo: ${pedido.anulado!.motivo}. ` : ''}No cuenta en sus resultados y no se puede editar.
      </p>
      <Boton tamano="chico" onClick={reactivar}><RotateCcw /> Reactivar</Boton>
    </div>
  )
}

function VolverAPedidos() {
  return <Link href="/pedidos" className="inline-flex items-center gap-1.5 self-start font-semibold text-primary hover:text-primary-hover"><ArrowLeft className="size-4" /> Mis pedidos</Link>
}

// --- Importar la lista desde un archivo ---------------------------------------------------------

export const CAMPOS_LISTA = [
  { campo: 'codigo', nombre: 'Código de producto' },
  { campo: 'pedir', nombre: 'Cantidad a pedir' },
  { campo: 'nombre', nombre: 'Nombre (opcional)' },
]

type RespuestaLista = { ok: boolean; lineas: LineaGuardada[]; columnas: Record<string, string>; archivo: string; hoja?: string; omitidas?: number; sumadas?: number; errores?: string[]; hojas?: HojaMapeo[]; archivoId: number }

// ruta: a dónde se manda el archivo (por defecto, la lista del pedido). Movimientos la usa con
// /movimientos/importar y sus propios textos (sin plantilla de lista).
export function ImportarLista({ pedidoId, para, hoja, alImportar, ruta, boton = 'Importar mi archivo de pedido', intro = 'Escriba en la tabla o pegue filas copiadas de su Excel (Ctrl+V). También puede:', conPlantilla = true, campos = CAMPOS_LISTA }: { pedidoId?: number; para?: 'inicial' | 'final'; hoja: React.RefObject<HojaApi | null>; alImportar: () => void; ruta?: string; boton?: string; intro?: string; conPlantilla?: boolean; campos?: { campo: string; nombre: string }[] }) {
  const destino = ruta ?? `/pedidos/${pedidoId}/importar-lista`
  const [mensaje, setMensaje] = useState<React.ReactNode>(null)
  const [mapeo, setMapeo] = useState<{ hojas: HojaMapeo[]; archivoId: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function enviar(fd: FormData) {
    setMensaje(<p className="text-sm text-muted-foreground">Leyendo su archivo…</p>)
    setMapeo(null)
    let r: RespuestaLista
    try {
      r = await api<RespuestaLista>('POST', destino, undefined, { formulario: fd })
    } catch (e) {
      const t = textoErrores(e)
      return setMensaje(<ErrorLista mensaje={t.mensaje} lista={t.lista} />)
    }
    if (!r.ok) {
      setMensaje(<ErrorLista mensaje="No pudimos leer la lista:" lista={r.errores} />)
      if (r.hojas?.some((h) => h.encabezados.length)) setMapeo({ hojas: r.hojas, archivoId: r.archivoId })
      return
    }
    if (!r.lineas.length) return setMensaje(<Aviso tono="cuidado">El archivo no tiene productos con cantidad (columna: {r.columnas.pedir}).</Aviso>)
    const hayAlgo = (hoja.current?.lineas() || []).some((l) => l.codigo || l.cantidad)
    if (hayAlgo && !window.confirm(`El archivo trae ${r.lineas.length} productos. ¿Reemplazar lo que hay en la tabla?`)) return setMensaje(null)
    hoja.current?.fijar(r.lineas)
    setMensaje(
      <Aviso tono="ok">
        Importamos {plural(r.lineas.length, 'producto', 'productos')} de &quot;{r.archivo}&quot;{r.hoja ? ` (hoja "${r.hoja}")` : ''}: código en {r.columnas.codigo}, cantidad en {r.columnas.pedir}.
        {r.sumadas ? ` El archivo trae varias filas por producto: se juntaron en una línea por código.` : ''}
        {r.omitidas ? ` ${plural(r.omitidas, 'producto sin cantidad no se incluyó', 'productos sin cantidad no se incluyeron')}.` : ''} Revise la tabla antes de guardar.
      </Aviso>,
    )
    alImportar()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-chico text-muted-foreground">
        <span>{intro}</span>
        <label className="presionable inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-within:outline-3 focus-within:outline-ring">
          <FileUp className="size-4" /> {boton}
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
                if (para) fd.append('para', para)
                fd.append('archivo', listo)
                enviar(fd)
              })
            }}
          />
        </label>
        {conPlantilla && <a href="/plantillas/lista-pedido.xlsx" download className="font-semibold text-primary hover:text-primary-hover">Descargar plantilla de lista</a>}
      </div>
      {mensaje}
      {mapeo && (
        <FormularioColumnas
          hojas={mapeo.hojas}
          campos={campos}
          alEnviar={(m) => {
            const fd = new FormData()
            if (para) fd.append('para', para)
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
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [guardando, setGuardando] = useState(false)
  const { ventana, preguntar } = useConfirmar()
  const datos = useRef({ proveedor })
  datos.current = { proveedor }
  const auto = useAutoguardado(() => api('PUT', `/pedidos/${pedido.id}/lista-inicial`, { lineas: hoja.current?.lineas() || [], proveedor: datos.current.proveedor }))
  // Los proveedores escritos en la lista (para el panel de proveedores).
  const [enLista, setEnLista] = useState<Map<string, number>>(() => contarProveedores(pedido.listaInicial))
  const cambioLista = () => { auto.cambio(); setTimeout(() => setEnLista(contarProveedores(hoja.current?.lineas() || [])), 150) }
  const nombresProveedores = useNombresProveedores(enLista)

  if (pedido.inicialGuardadaEn) {
    return (
      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Lo que iba a pedir</h2>
        <p className="text-muted-foreground">La guardó el {fechaHora(pedido.inicialGuardadaEn)}. Ya no se puede cambiar: es la base para comparar con su lista final.</p>
        <Hoja inicial={pedido.listaInicial} soloLectura conProveedor={pedido.listaInicial.some((l) => l.proveedor)} />
        {pedido.paso === 2 && <BotonEnlace href="?paso=2" variante="primario" className="self-start">Seguir: sus ventas y existencias <ArrowRight /></BotonEnlace>}
      </Tarjeta>
    )
  }

  async function guardar() {
    setError(null)
    const cuerpo = { lineas: hoja.current?.lineas() || [], proveedor }
    setGuardando(true)
    try {
      const rev = await api<{ lineas: number; avisos: string[] }>('POST', `/pedidos/${pedido.id}/lista-inicial`, { ...cuerpo, revisar: true })
      const ok = await preguntar(
        '¿Guardar su lista inicial?',
        <>
          <p>Va a guardar su lista inicial con <strong>{plural(rev.lineas, 'producto', 'productos')}</strong>. Una vez guardada queda fija y ya no se puede cambiar.</p>
          {rev.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-chico text-ambar-texto">{rev.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
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
        <h2 className="text-xl font-bold">Lo que iba a pedir</h2>
        <p className="mt-1 text-muted-foreground">Anote lo que pediría hoy, como lo hace de costumbre, antes de ver el reporte. Al final la comparamos con su lista final.</p>
      </div>
      <label className="flex max-w-xl flex-col gap-1.5 font-semibold">
        <span>Proveedor o nombre del pedido <span className="font-normal text-muted-foreground">(opcional)</span></span>
        <input className={claseEntrada} maxLength={120} placeholder="Ej.: Tornillería Central" value={proveedor} onChange={(e) => { setProveedor(e.target.value); auto.cambio() }} />
      </label>
      <ImportarLista pedidoId={pedido.id} para="inicial" hoja={hoja} alImportar={cambioLista} />
      <ProveedoresPedido enLista={enLista} />
      <Hoja ref={hoja} inicial={pedido.listaInicial} alCambiar={cambioLista} conProveedor proveedores={nombresProveedores} />
      <p className="text-sm text-muted-foreground">Cada línea necesita código y cantidad. El nombre y el proveedor son opcionales: el proveedor queda atado al producto, también en Datos.</p>
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Boton variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Revisando…' : 'Guardar lista inicial'}</Boton>
        <span className="text-sm text-muted-foreground" aria-live="polite">{auto.estado}</span>
      </div>
    </Tarjeta>
  )
}

// Cuántos productos de la lista tiene cada proveedor.
function contarProveedores(ls: { proveedor?: string }[]) {
  const m = new Map<string, number>()
  for (const l of ls) {
    const p = (l.proveedor || '').trim()
    if (p) m.set(p, (m.get(p) || 0) + 1)
  }
  return m
}

// Los proveedores que ya tiene (los mismos de Datos) más los que escribió en la lista.
function useNombresProveedores(enLista: Map<string, number>) {
  const { inventario, respuesta } = useInventario()
  const aj = inventario?.ajustes ?? respuesta?.ajustes
  const conocidos = [...(inventario?.proveedores || []).map((p) => p.nombre).filter((n) => n !== 'Sin proveedor'), ...Object.keys(aj?.entregas || {})]
  return [...new Set([...conocidos, ...enLista.keys()])].sort((a, b) => (enLista.get(b) || 0) - (enLista.get(a) || 0) || a.localeCompare(b, 'es'))
}

// Panel del paso 1: cada proveedor con cuánto tarda. Se guarda en los ajustes de la cuenta, así
// que es lo mismo que en Datos y lo usan el sugerido y la orden de compra.
function ProveedoresPedido({ enLista }: { enLista: Map<string, number> }) {
  const { inventario, respuesta, recargar } = useInventario()
  const aj = inventario?.ajustes ?? respuesta?.ajustes
  const nombres = useNombresProveedores(enLista)
  const [propias, setPropias] = useState<Record<string, number>>({})
  const [nuevo, setNuevo] = useState('')
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const defecto = aj?.entregaPorDefecto ?? 1
  const tarda = (n: string) => propias[n] ?? aj?.entregas?.[n] ?? inventario?.proveedores.find((p) => p.nombre === n)?.entrega ?? defecto
  async function poner(nombre: string, valor: number) {
    const entregas = { ...(aj?.entregas || {}), ...propias, [nombre]: Math.max(0, Math.min(52, valor)) }
    setPropias(entregas)
    await api('PUT', '/inventario/ajustes', { entregas })
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(recargar, 1500)
  }
  function agregar(e: React.FormEvent) {
    e.preventDefault()
    const n = nuevo.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!n) return
    setNuevo('')
    poner(n, tarda(n))
  }
  const todos = [...new Set([...nombres, ...Object.keys(propias)])]
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4">
      <div>
        <strong className="text-cuerpo">Proveedores</strong>
        <p className="text-chico text-muted-foreground">Los mismos de Datos. Escriba el proveedor de cada producto en la tabla; uno nuevo se agrega solo. Ajuste aquí cuánto tarda en llegar cada pedido.</p>
      </div>
      {todos.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {todos.slice(0, 30).map((n) => (
            <li key={n} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-1.5">
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-semibold" title={n}>{n}</span>
                <span className="text-nota text-muted-foreground">{enLista.get(n) ? plural(enLista.get(n)!, 'producto en esta lista', 'productos en esta lista') : 'sin productos en esta lista'}</span>
              </span>
              <Contador valor={tarda(n)} etiqueta={`lo que tarda ${n}`} paso={1} onMover={(d) => poner(n, tarda(n) + d)} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={agregar} className="flex flex-wrap items-center gap-2">
        <input className={cn(claseEntrada, 'h-10 w-auto min-w-56 flex-1 sm:flex-none')} placeholder="Nombre del proveedor nuevo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={80} />
        <Boton type="submit" tamano="chico" disabled={!nuevo.trim()}><Plus /> Agregar proveedor</Boton>
      </form>
    </div>
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
        <h2 className="text-xl font-bold">Sus ventas y existencias</h2>
        {pedido.export && <p>Usó {pedido.export.archivos.map((a) => `"${a.nombre}"`).join(' y ')}, subidos el {fechaHora(pedido.export.subidoEn)}.</p>}
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
        <h2 className="text-xl font-bold">Sus ventas y existencias</h2>
        <p className="mt-1 text-muted-foreground">Necesitamos <strong className="text-foreground">lo que vendió</strong> de cada producto en el último año y <strong className="text-foreground">lo que tiene hoy</strong>. Un archivo o varios, tal como salen de su programa.</p>
      </div>
      {pedido.export && (
        <Aviso tono="ok">
          Ya subió {pedido.export.archivos.map((a) => `"${a.nombre}"`).join(' y ')} el {fechaHora(pedido.export.subidoEn)}. <Link href="?paso=3" className="font-semibold underline-offset-2 hover:underline">Ver el reporte</Link>
        </Aviso>
      )}
      {guardado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4">
          <p className="text-cuerpo text-[#0b3f3b]">
            Tiene su inventario guardado del <strong>{fecha(guardado.fuente.fecha)}</strong> ({numero(guardado.resumen.productos)} productos).
            {dias > 7 ? ' Tiene más de una semana: si puede, suba uno nuevo.' : ' Puede usarlo sin subir nada.'}
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
          <strong className="block text-cuerpo">¿Con cuántas semanas marcamos que algo se agota?</strong>
          <span className="text-chico text-muted-foreground">Si a un producto le quedan menos semanas que esto, sale como «se agota» en su reporte. {pedido.semanasAgota === 2 ? 'Si no lo cambia, son 2.' : `Está en ${pedido.semanasAgota}, también para sus próximos pedidos (se cambia aquí o en Datos).`}</span>
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
      <div className="flex flex-col items-start gap-4">
        <div>
          <h2 className="text-xl font-bold">Su reporte de rotación</h2>
          <p className="mt-1 text-muted-foreground">
            Arriba está lo que se agota primero; abajo, lo que sobra. Archivo: {r.archivos?.join(', ')} (subido el {fechaHora(r.subidoEn)}).{' '}
            {!pedido.terminado && <Link href="?paso=2" className="font-semibold text-primary hover:text-primary-hover">Usar otro archivo</Link>}
          </p>
        </div>
        {!pedido.terminado && <Boton variante="primario" onClick={() => ir(4)}>Seguir: armar la lista final <ArrowRight /></Boton>}
      </div>
      <TuPedidoFrenteAlReporte pedido={pedido} r={r} />
      <Recordatorio pedidoId={pedido.id} />
      <Reporte r={r} />
      {!pedido.terminado && <Boton variante="primario" className="self-start" onClick={() => ir(4)}>Seguir: armar la lista final <ArrowRight /></Boton>}
    </Tarjeta>
  )
}

// Lo primero que quiere saber quien va a pedir: cómo están los productos de su propia lista y qué
// se le está acabando que no tenía en cuenta. Sale del mismo reporte (no sugiere cantidades).
function TuPedidoFrenteAlReporte({ pedido, r }: { pedido: Pedido; r: ReporteRotacion }) {
  const { sug } = useSugerido(pedido.id)
  const sugPorCodigo = new Map((sug?.productos || []).map((x) => [claveCodigo(x.codigo), x]))
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
      <span className="text-chico tabular-nums">{extra}{cantidad !== undefined ? ` · iba a pedir ${cant(cantidad)}` : ''}</span>
    </li>
  )
  return (
    <section aria-labelledby="su-pedido" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 id="su-pedido" className="text-lg font-bold">Su pedido frente al reporte</h3>
        <p className="text-chico text-muted-foreground">Los {plural(lineas.length, 'producto', 'productos')} que iba a pedir, según su archivo.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-rojo-borde bg-rojo-fondo p-3"><strong className="font-display text-2xl text-rojo tabular-nums">{agotan.length}</strong><span className="block text-nota text-rojo-texto">agotados o por agotarse</span></div>
        <div className="rounded-xl border border-azul-borde bg-azul-fondo p-3"><strong className="font-display text-2xl text-azul tabular-nums">{sobran.length + sinVentas.length}</strong><span className="block text-nota text-azul-texto">sobrestock o sin ventas</span></div>
        <div className="rounded-xl border border-border p-3"><strong className="font-display text-2xl tabular-nums">{lineas.length - agotan.length - sobran.length - sinVentas.length - fuera.length}</strong><span className="block text-nota text-muted-foreground">están bien</span></div>
        <div className="rounded-xl border border-ambar-borde bg-ambar-fondo p-3"><strong className="font-display text-2xl text-ambar-texto tabular-nums">{olvidados.length}</strong><span className="block text-nota text-ambar-texto">se agotan y no están en su lista</span></div>
      </div>
      {(agotan.length > 0 || sobran.length + sinVentas.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {agotan.length > 0 && (
            <div>
              <strong className="text-cuerpo text-rojo-texto">De su lista, agotados o por agotarse</strong>
              <ul className="divide-y divide-border">{agotan.map(({ l, f }) => <Fila key={l.codigo} codigo={l.codigo} f={f} extra={f!.existencias <= 0 ? 'agotado' : `alcanza para ${alcance(f!.semanasInventario ?? 0)}`} cantidad={l.cantidad} />)}</ul>
            </div>
          )}
          {sobran.length + sinVentas.length > 0 && (
            <div>
              <strong className="text-cuerpo text-azul-texto">De su lista, en sobrestock</strong>
              <ul className="divide-y divide-border">{[...sobran, ...sinVentas].map(({ l, f }) => <Fila key={l.codigo} codigo={l.codigo} f={f} extra={f!.semanasInventario === null ? 'no se vendió' : `alcanza para ${alcance(f!.semanasInventario)}`} cantidad={l.cantidad} />)}</ul>
            </div>
          )}
        </div>
      )}
      {olvidados.length > 0 && (
        <Desplegable tono="ambar" abierto={!pedido.terminado} titulo={`Se agotan y no están en su lista: los ${Math.min(olvidados.length, 15)} que más vende`}>
          {!pedido.terminado && <p className="mt-1 text-chico text-ambar-texto">Con <strong>+</strong> lo agrega a su lista final con la cantidad sugerida, o escriba otra.</p>}
          <ul className="mt-2 divide-y divide-ambar-borde">
            {olvidados.slice(0, 15).map((f) => (
              <AgregarOlvidado key={f.codigo} pedido={pedido} f={f} sugerido={sugPorCodigo.get(claveCodigo(f.codigo))} nombre={nombre(f.codigo, f)} />
            ))}
          </ul>
        </Desplegable>
      )}
      {fuera.length > 0 && <p className="text-chico text-muted-foreground">{plural(fuera.length, 'producto de su lista no está', 'productos de su lista no están')} en el archivo: {fuera.map(({ l }) => l.codigo).join(', ')}.</p>}
    </section>
  )
}

// Un producto que se agota y no estaba en la lista: con "+" pasa a la lista final (borrador del
// paso 4) con la cantidad sugerida o la que escriba. Cuenta como línea agregada.
function AgregarOlvidado({ pedido, f, sugerido, nombre }: { pedido: Pedido; f: FilaReporte; sugerido?: ProductoSugerido; nombre: string }) {
  const [cantidad, setCantidad] = useState('')
  const [estado, setEstado] = useState<'listo' | 'agregando' | 'agregado' | string>('listo')
  const propuesta = sugerido?.sugerido ? sugerido.sugerido : Math.max(1, Math.ceil(f.promedioSemanal * 4))
  const valor = cantidad.trim() || String(propuesta)
  async function agregar() {
    const q = Number(valor.replace(',', '.'))
    if (!Number.isFinite(q) || q <= 0) return setEstado('Escriba una cantidad mayor que 0.')
    setEstado('agregando')
    try {
      const { pedido: actual } = await api<{ pedido: Pedido }>('GET', `/pedidos/${pedido.id}`)
      const lista = (actual.listaFinal || actual.listaInicial).filter((l) => claveCodigo(l.codigo) !== claveCodigo(f.codigo))
      const proveedor = sugerido?.proveedor && sugerido.proveedor !== 'Sin proveedor' ? sugerido.proveedor : undefined
      await api('PUT', `/pedidos/${pedido.id}/lista-final`, { lineas: [...lista, { codigo: f.codigo, nombre, cantidad: q, ...(proveedor ? { proveedor } : {}) }] })
      setEstado('agregado')
    } catch (e) {
      setEstado(textoErrores(e).mensaje)
    }
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
      <span className="min-w-0"><span className="text-muted-foreground">{f.codigo}</span> {nombre}
        <span className="block text-nota text-muted-foreground">vende {ventasSemana(f.promedioSemanal)}/sem · hay {numero(f.existencias)}{f.existencias <= 0 ? ' (agotado)' : ` · alcanza para ${alcance(f.semanasInventario)}`}</span>
      </span>
      {pedido.terminado ? null : estado === 'agregado' ? (
        <span className="inline-flex items-center gap-1 text-chico font-semibold text-verde"><Check className="size-4" /> En su lista: {numero(Number(valor.replace(',', '.')))}</span>
      ) : (
        <span className="flex items-center gap-1.5">
          <input aria-label={`Cantidad de ${nombre || f.codigo}`} inputMode="decimal" className="h-9 w-20 rounded-lg border border-input bg-card px-2 text-right tabular-nums" placeholder={String(propuesta)} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          <button type="button" onClick={agregar} disabled={estado === 'agregando'} title={`Agregar a su lista final (${valor})`} aria-label={`Agregar ${nombre || f.codigo} a su lista final`} className="presionable inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
            <Plus className="size-4" />
          </button>
        </span>
      )}
      {estado !== 'listo' && estado !== 'agregando' && estado !== 'agregado' && <span className="w-full text-nota text-rojo-texto">{estado}</span>}
    </li>
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
        <p><strong>Listo.</strong> {d.correo === 'enviado' ? `Le enviamos la invitación a ${d.email}. ` : ''}{d.correo === 'fallo' ? 'No pudimos enviarle el correo, pero puede descargar el archivo. ' : ''}Descargue el archivo y ábralo: su calendario (Google Calendar, Outlook o el del celular) le avisará. El primer recordatorio es el {dia(respuesta!.primerAviso)}.</p>
        <div className="flex flex-wrap gap-2">{descargar}<Boton tamano="chico" onClick={() => responder(false)} disabled={enviando}>Ya no lo quiero</Boton></div>
      </>
    )
  } else if (activo) {
    cuerpo = (
      <>
        <p>Tiene recordatorios con el reporte del {dia(respuesta!.fechaReporte)}.{plan.productos ? ` ¿Prefiere usar este, del ${dia(plan.fechaReporte)}?` : ''}</p>
        <div className="flex flex-wrap gap-2">{plan.productos > 0 && <Boton tamano="chico" variante="primario" onClick={() => responder(true)} disabled={enviando}>Usar este reporte</Boton>}<Boton tamano="chico" onClick={() => responder(false)} disabled={enviando}>Ya no lo quiero</Boton></div>
      </>
    )
  } else if (plan.productos && plan.primero) {
    const p = plan.primero
    cuerpo = (
      <>
        <p><strong>¿Quiere un recordatorio?</strong> {plural(plan.productos, 'producto baja', 'productos bajan')} de {plan.semanasAgota ?? 2} semanas en los próximos 3 meses al ritmo actual; el primero, {p.codigo}{p.nombre ? ` (${p.nombre})` : ''}, hacia el {dia(p.fechaUmbral)}. Le avisamos en su calendario {plan.diasAntes} días antes{plan.correo ? ` y por correo a ${d.email}` : ''}, máximo una vez por semana.</p>
        <div className="flex flex-wrap gap-2">{!respuesta && <Boton tamano="chico" onClick={() => responder(false)} disabled={enviando}>No, gracias</Boton>}<Boton tamano="chico" variante="primario" onClick={() => responder(true)} disabled={enviando}>Sí, recordarme</Boton></div>
      </>
    )
  }
  if (!cuerpo) return null
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4 text-cuerpo text-[#0b3f3b]">
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

// Para cuántas semanas alcanza tener "existencias + cantidad": con la misma venta por semana del
// reporte (existencias ÷ ventas por semana), así con 0 da lo mismo que "Te alcanza hoy".
const duraSemanas = (p: ProductoSugerido, cantidad: number) =>
  p.ventasSemana > 0 ? (Math.max(p.existencias, 0) + Math.max(cantidad, 0)) / p.ventasSemana : null
const textoDura = (s: number | null) => (s === null ? '' : s >= 26 ? 'más de 6 meses' : s < 1 ? alcance(s) : `${semanas(s)} semanas (unos ${Math.round(s * 7)} días)`)

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
    setHecho(n ? `Se pusieron las cantidades sugeridas en ${plural(n, 'producto', 'productos')}. Revíselas antes de guardar.` : 'Su lista ya tiene las cantidades sugeridas.')
  }
  function agregar(ps: ProductoSugerido[]) {
    const lineas = (hoja.current?.lineas() || []).filter((l) => l.codigo || l.nombre || l.cantidad)
    hoja.current?.fijar([...lineas, ...ps.map((p) => ({ codigo: p.codigo, nombre: p.nombre, cantidad: String(p.sugerido), proveedor: p.proveedor && p.proveedor !== 'Sin proveedor' ? p.proveedor : '' }))])
    alCambiarLista()
    setHecho(`Se ${ps.length === 1 ? 'agregó' : 'agregaron'} ${plural(ps.length, 'producto', 'productos')} con su cantidad sugerida al final de su lista. Quite los que no vaya a pedir.`)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-4 sm:p-5">
      <div>
        <strong className="text-cuerpo">Lo que sugiere SINESC</strong>
        <p className="mt-0.5 text-chico text-muted-foreground">Lo que falta de cada producto para llegar al siguiente pedido sin agotarse.</p>
        <Desplegable className="mt-2 text-chico" titulo="¿Cómo lo calcula?">
          <p className="text-muted-foreground">Con lo que vende por semana (lo reciente pesa más y se tiene en cuenta la temporada), cuánto tarda su proveedor y cada cuánto pide, para que no le falte en {Math.round(sug.nivelServicio * 10)} de cada 10 casos. Ya resta lo que tiene, y si un producto se vende siempre por paquetes, redondea al paquete. Lo que el reporte marca como que sobra no se sugiere.</p>
        </Desplegable>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="flex items-center gap-3 text-chico">
          <span>{proveedores.length ? 'Por defecto, un proveedor tarda' : 'Su proveedor tarda'}</span>
          <Contador valor={sug.entrega} etiqueta="el tiempo de entrega" paso={1} onMover={(d) => !guardando && ajustar('entregaPorDefecto', Math.max(0, Math.min(26, sug.entrega + d)))} />
        </div>
        <div className="flex items-center gap-3 text-chico">
          <span>Se pide cada</span>
          <Contador valor={sug.cadaCuanto} etiqueta="cada cuánto pide" paso={1} onMover={(d) => !guardando && ajustar('cadaCuanto', Math.max(1, Math.min(26, sug.cadaCuanto + d)))} />
        </div>
      </div>
      {proveedores.length > 0 ? (
        <Desplegable className="text-chico" abierto={proveedores.length <= 6} titulo={`Cuánto tarda cada proveedor (${proveedores.length})`}>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {proveedores.slice(0, 30).map((pr) => (
              <li key={pr.nombre} className="flex items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-1.5">
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold">{pr.nombre}</span>
                  <span className="text-nota text-muted-foreground">{plural(pr.productos, 'producto', 'productos')}</span>
                </span>
                <Contador valor={pr.entrega} etiqueta={`lo que tarda ${pr.nombre}`} paso={1} onMover={(d) => !guardando && ajustar('entregas', { ...(sug.entregas || {}), [pr.nombre]: Math.max(0, Math.min(52, pr.entrega + d)) })} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-nota text-muted-foreground">"Por defecto" aplica a los proveedores sin tiempo propio. Se guarda también en Datos.</p>
        </Desplegable>
      ) : (
        <p className="text-nota text-muted-foreground">Los proveedores con tiempo propio en Datos usan ese.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Boton tamano="chico" className="py-1.5 text-left whitespace-normal" onClick={usarSugeridas}>Usar las cantidades sugeridas en mi lista</Boton>
        {urgentes.length > 0 && (
          <Boton tamano="chico" className="py-1.5 text-left whitespace-normal" onClick={() => agregar(urgentes)}>Agregar {urgentes.length === faltan.length ? `los ${urgentes.length}` : `los ${urgentes.length} más vendidos`} que se agotan y no están en mi lista</Boton>
        )}
      </div>
      {faltan.length > 0 && (
        <Desplegable className="text-chico" titulo={`Ver los ${faltan.length} que se agotan y no están en su lista`}>
          <ul className="flex flex-col divide-y divide-[#cfe5e1]">
            {faltan.slice(0, 40).map((p) => (
              <li key={p.codigo} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span><span className="text-muted-foreground">{p.codigo}</span> · {p.nombre}: {(p.existencias ?? 0) <= 0 ? 'agotado' : `alcanza para ${alcance(p.semanas ?? 0)}`}; sugerido <strong>{numero(p.sugerido ?? 0)}</strong></span>
                <button type="button" onClick={() => agregar([p])} className="presionable rounded-md border border-primary/40 bg-card px-2 py-0.5 text-nota font-semibold text-primary hover:bg-primary hover:text-primary-foreground">Agregar</button>
              </li>
            ))}
          </ul>
          {faltan.length > 40 && <p className="mt-1 text-muted-foreground">Y {faltan.length - 40} más.</p>}
        </Desplegable>
      )}
      {hecho && <p className="text-chico font-semibold text-primary" aria-live="polite">{hecho}</p>}
    </div>
  )
}

// Cuánto lleva el pedido. No cuenta las líneas cambiadas frente a la lista inicial: es lo que se
// mide, y mostrarlo como un marcador empuja a cambiar por cambiar (la columna "Cambio" de cada fila
// basta para ver qué movió).
function ResumenPedido({ hoja, version, sugeridos }: { hoja: React.RefObject<HojaApi | null>; version: unknown; sugeridos: Map<string, ProductoSugerido> }) {
  void version // se vuelve a calcular cada vez que cambia la hoja
  const cant = (v: unknown) => Number(String(v ?? '').trim().replace(',', '.'))
  const ahora = new Map((hoja.current?.lineas() || []).filter((l) => l.codigo && cant(l.cantidad) > 0).map((l) => [claveCodigo(l.codigo), cant(l.cantidad)]))
  let unidades = 0
  let plata = 0
  let conCosto = 0
  for (const [k, v] of ahora) {
    unidades += v
    const c = sugeridos.get(k)?.costo
    if (c && c > 0) { plata += c * v; conCosto++ }
  }
  return (
    <p className="rounded-xl bg-muted px-4 py-3 text-cuerpo font-semibold">
      Su pedido: {plural(ahora.size, 'producto', 'productos')}, {numero(unidades)} unidades
      {conCosto > 0 && <> · {plata.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })} a costo{conCosto < ahora.size ? ` (${conCosto} con costo)` : ''}</>}
    </p>
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
          <span className="text-nota text-muted-foreground">{p.codigo}{p.proveedor !== 'Sin proveedor' ? ` · ${p.proveedor}` : ''}</span>
          <h3 className="text-lg leading-snug font-bold">{p.nombre}</h3>
        </div>
        <Boton tamano="chico" variante="fantasma" onClick={alCerrar}>Cerrar</Boton>
      </div>
      {p.ventaUnica ? (
        <VentaUnica v={p.ventaUnica} existencias={p.existencias} />
      ) : p.sugerido === null || !d ? (
        <p>No se vendió en el periodo de su archivo, así que no hay cómo sugerir una cantidad. Hay {numero(p.existencias)}.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-secondary p-3"><span className="block text-nota font-semibold">SINESC sugiere</span><strong className="font-display text-2xl tabular-nums text-primary">{numero(p.sugerido)}</strong><span className="block text-nota">con lo que hay, dura {textoDura(duraSemanas(p, p.sugerido))}</span></div>
            <div className="rounded-xl border border-border p-3"><span className="block text-nota font-semibold text-muted-foreground">Su cantidad final</span><strong className="font-display text-2xl tabular-nums">{numero(vasAPedir)}</strong><span className="block text-nota">dura {textoDura(duraSemanas(p, vasAPedir))}</span></div>
            <div className="rounded-xl border border-border p-3"><span className="block text-nota font-semibold text-muted-foreground">Iba a pedir</span><strong className="font-display text-2xl tabular-nums">{ibasAPedir === null ? '—' : numero(ibasAPedir)}</strong><span className="block text-nota">{ibasAPedir === null ? 'no estaba en su lista' : `dura ${textoDura(duraSemanas(p, ibasAPedir))}`}</span></div>
          </div>
          <div>
            <strong className="text-cuerpo">Por qué {numero(p.sugerido)}</strong>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-chico">
              <li>Hoy hay <strong>{numero(Math.max(p.existencias, 0))}</strong> y se venden {ventasSemana(p.ventasSemana)} por semana: {p.existencias <= 0 ? <strong>ya está agotado</strong> : <>alcanza para <strong>{alcance(Math.max(p.existencias, 0) / Math.max(p.ventasSemana, 1e-9))}</strong></>}.</li>
              <li>De aquí en adelante esperamos vender unas <strong>{ventasSemana(d.ventaSemana)}</strong> por semana (lo de los últimos meses pesa más y se tiene en cuenta la temporada).</li>
              <li>Su proveedor tarda {semanas(p.entrega)} {p.entrega === 1 ? 'semana' : 'semanas'} y usted pide cada {semanas(sug.cadaCuanto)}: este pedido tiene que cubrir <strong>{semanas(d.semanasCubrir)} semanas</strong>.</li>
              {p.estado !== 'sobra' && <li>En esas semanas lo más probable es vender <strong>{numero(Math.round(d.media))}</strong>. Para no quedarte corto en {Math.round(sug.nivelServicio * 10)} de cada 10 casos hay que contar con <strong>{numero(Math.ceil(d.alto))}</strong>.</li>}
              {p.estado === 'sobra' ? (
                <li>Hay {numero(Math.max(p.existencias, 0))}, que alcanzan para {textoDura(duraSemanas(p, 0))}: más de las {semanas(d.semanasCubrir)} que cubre este pedido. No hace falta pedirlo; el reporte lo marca como que sobra.</li>
              ) : (
              <li>Hay {numero(Math.max(p.existencias, 0))}: faltan {numero(p.lote && p.lote > 1 ? Math.max(0, Math.ceil(d.alto - Math.max(p.existencias, 0))) : p.sugerido)}{p.lote && p.lote > 1 ? `, que redondeado a paquetes de ${p.lote} da ${numero(p.sugerido)}` : ''}.</li>
              )}
            </ol>
            {(() => {
              const dura = duraSemanas(p, p.sugerido)
              return dura !== null && p.sugerido > 0 && dura > d.semanasCubrir * 1.5 ? (
                <p className="mt-2 text-chico text-muted-foreground">
                  Dura más de {semanas(d.semanasCubrir)} semanas porque sus ventas son irregulares: al ritmo normal alcanza para {textoDura(dura)}, y el margen cubre una venta grande antes del siguiente pedido.
                </p>
              ) : null
            })()}
          </div>
        </>
      )}
      {historia.length > 4 && (
        <div className="flex flex-col gap-2">
          <strong className="text-cuerpo">Sus ventas por semana y lo que viene</strong>
          <GraficoVentas historia={historia} pronostico={pronostico} marcas={p.semanasPico} alto={180} descripcion={`Ventas semanales de ${p.nombre} y pronóstico`} />
          {ultimas.length > 0 && <p className="text-chico text-muted-foreground">Últimas {ultimas.length} semanas de su archivo: {ultimas.map((x) => numero(x)).join(', ')}.</p>}
          {p.pico && <p className="text-chico text-ambar-texto">En {mesAnio(p.pico.mes)} vendió {numero(p.pico.vendido)}, mucho más de lo normal (un proyecto o un cliente puntual). Para el promedio se contaron {numero(p.pico.contado)}.</p>}
        </div>
      )}
    </div>
  )
}

// Lo que se dice de un producto que se vendió de una sola vez (server/inventario.js, ventaUnica).
export function VentaUnica({ v, existencias }: { v: { vendido: number; semanas: number; desde: string }; existencias: number }) {
  return (
    <div className="rounded-xl border border-ambar-borde bg-ambar-fondo p-3.5 text-chico">
      <strong className="block text-ambar-texto">SINESC sugiere 0: se vendió de una sola vez</strong>
      Las {numero(v.vendido)} unidades se vendieron {v.semanas === 1 ? 'en la semana' : 'en las dos semanas'} del {fecha(v.desde)} y no volvió a venderse. Parece un proyecto puntual. Hay {numero(Math.max(existencias, 0))}; si espera otro pedido igual, escriba usted la cantidad.
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
  const textoSem = (n: number) => (n >= 26 ? '+6 meses' : alcance(n, true))
  const cambiada = (l: { codigo: string; cantidad: string }) => {
    if (!l.codigo) return false
    const x = inicial.get(claveCodigo(l.codigo))
    return !x || Math.abs(cantidad(x.cantidad) - cantidad(l.cantidad)) > 1e-9
  }
  // Antes de la cantidad: cómo está el producto, lo que iba a pedir y lo que sugiere SINESC.
  const extrasAntes: Extra[] = [
    {
      // Lo que tiene hoy según su archivo: la base de "Te alcanza hoy".
      titulo: 'Existencias',
      valor: (l) => {
        if (!l.codigo) return { texto: '' }
        const f = porCodigo.get(claveCodigo(l.codigo))
        if (!f) return { texto: '—', clase: 'text-muted-foreground' }
        return { texto: numero(f.existencias), clase: cn('tabular-nums', f.existencias <= 0 && 'font-semibold text-rojo') }
      },
    },
    {
      titulo: 'Alcanza hoy para',
      valor: (l) => {
        if (!l.codigo) return { texto: '' }
        const f = porCodigo.get(claveCodigo(l.codigo))
        if (!f) return { texto: 'no está en el archivo', clase: 'text-muted-foreground' }
        if (f.semanasInventario === null) return { texto: 'sin ventas', clase: 'text-azul' }
        const e = estadoDeFila(f)
        if (f.existencias <= 0) return { texto: 'Agotado', clase: 'font-bold text-rojo' }
        const sub = e === 'agota' ? (f.existencias <= 0 ? 'agotado' : 'se va a agotar') : e === 'sobra' ? 'sobrestock' : 'bien'
        return { texto: textoSem(f.semanasInventario), sub, clase: cn('tabular-nums font-semibold', e === 'agota' && 'text-rojo', e === 'sobra' && 'text-azul'), claseSub: e === 'agota' ? 'font-semibold text-rojo-texto' : e === 'sobra' ? 'text-azul-texto' : 'text-verde' }
      },
    },
    {
      titulo: 'Iba a pedir',
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
        if (x.sugerido === 0) return { texto: '0', sub: x.ventaUnica ? 'se vendió una vez' : 'alcanza', clase: 'tabular-nums font-semibold text-muted-foreground' }
        const d = duraSemanas(x, x.sugerido)
        return { texto: numero(x.sugerido), sub: d !== null ? `dura ${textoSem(d)}` : undefined, clase: 'tabular-nums text-cuerpo font-bold text-primary' }
      },
      alClic: (l) => setDetalle({ codigo: claveCodigo(l.codigo), cantidad: cantidad(l.cantidad) }),
      accion: (l, i) => {
        const x = l.codigo ? sugPorCodigo.get(claveCodigo(l.codigo)) : undefined
        if (!x || x.sugerido === null || cantidad(l.cantidad) === x.sugerido) return null
        return { texto: 'Usar', titulo: `Poner ${x.sugerido} en su cantidad final`, alClic: () => hoja.current?.ponerCantidad(i, String(x.sugerido)) }
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
      titulo: 'Con su cantidad, dura',
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
        <h2 className="text-xl font-bold">Lo que de verdad va a pedir</h2>
        <p className="text-muted-foreground">La guardó el {fechaHora(pedido.finalGuardadaEn)}.</p>
        <Hoja inicial={pedido.listaFinal || []} soloLectura extrasAntes={extrasAntesLectura} extras={extras} tituloCantidad="Su cantidad final" destacarCantidad />
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
        '¿Guardar su lista final?',
        <>
          <p>{rev.lineas === 0 ? 'Su lista final está vacía: ¿no va a pedir nada?' : <>Va a guardar su lista final con <strong>{plural(rev.lineas, 'producto', 'productos')}</strong>.</>}</p>
          {rev.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-chico text-ambar-texto">{rev.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
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
        <h2 className="text-xl font-bold">Arme su pedido de verdad</h2>
        <p className="mt-1 text-muted-foreground">Parte de su lista inicial. Usted decide la cantidad final de cada producto.</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ['Revise cada producto', 'Para cuánto alcanza hoy, lo que iba a pedir y lo que sugiere SINESC. Haga clic en el sugerido para ver por qué.'],
          ['Escriba su cantidad final', 'En la columna verde con el lápiz escribe con cuánto se queda, o elija «Usar» en el sugerido.'],
          ['Guarde su lista', 'En «Cambio» ve la diferencia con lo que iba a pedir y en «Con su cantidad, dura», para cuánto alcanza.'],
        ].map(([t, d], k) => (
          <li key={t} className="flex gap-3 rounded-xl border border-border p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{k + 1}</span>
            <span className="text-chico"><strong className="block">{t}</strong><span className="text-muted-foreground">{d}</span></span>
          </li>
        ))}
      </ol>
      <Boton tamano="chico" className="self-start" aria-expanded={verReporte} onClick={() => setVerReporte((v) => !v)}>{verReporte ? 'Ocultar el reporte' : 'Mostrar el reporte'}</Boton>
      {verReporte && <div className="aparecer"><Reporte r={r} compacto /></div>}
      {sug && <RecuadroSugerido sug={sug} hoja={hoja} alCambiarLista={cambio} alCambiarAjustes={cargarSugerido} />}
      <Hoja ref={hoja} inicial={conNombres(pedido.listaFinal || pedido.listaInicial)} extrasAntes={extrasAntes} extras={extras} alCambiar={cambio} tituloCantidad="Su cantidad final" destacarCantidad claseFila={(l) => (cambiada(l) ? 'bg-ambar-fondo/60' : undefined)} />
      {detalle && sug && sugPorCodigo.get(detalle.codigo) && (
        <DetalleSugerido p={sugPorCodigo.get(detalle.codigo)!} sug={sug} vasAPedir={cantidadEnHoja(detalle.codigo) ?? detalle.cantidad} ibasAPedir={inicial.has(detalle.codigo) ? cantidad(inicial.get(detalle.codigo)!.cantidad) : null} alCerrar={() => setDetalle(null)} />
      )}
      <ResumenPedido hoja={hoja} version={actuales} sugeridos={sugPorCodigo} />
      {quitados.length > 0 && (
        <p className="text-chico">
          <strong>Quitó {plural(quitados.length, 'producto', 'productos')} de su lista inicial:</strong>{' '}
          {quitados.map((l) => { const n = l.nombre || porCodigo.get(claveCodigo(l.codigo))?.nombre; return `${l.codigo}${n ? ` ${n}` : ''} (iba a pedir ${numero(cantidad(l.cantidad))})` }).join(', ')}.
        </p>
      )}
      <Desplegable className="text-chico" titulo="¿Tiene su pedido en otro Excel? Impórtelo">
        <ImportarLista pedidoId={pedido.id} para="final" hoja={hoja} alImportar={cambio} />
      </Desplegable>
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Boton variante="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Revisando…' : 'Guardar lista final'}</Boton>
        <span className="text-sm text-muted-foreground" aria-live="polite">{auto.estado}</span>
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
        <h2 className="text-xl font-bold">Su pedido</h2>
        <p className="mt-1 text-muted-foreground">{pedido.terminado ? 'Listo para enviar a sus proveedores.' : 'Termínelo para llevarse la orden de compra.'}</p>
      </div>
      <Desplegable titulo="Qué cambió frente a lo que iba a pedir">
        <p className="text-chico text-muted-foreground">
          {n.total === 0 ? 'Su lista final quedó igual a la inicial.' : `${plural(n.agregadas, 'producto agregado', 'productos agregados')}, ${plural(n.quitadas, 'quitado', 'quitados')} y ${plural(n.cambiadas, 'con otra cantidad', 'con otra cantidad')}.`}
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Detalle titulo="Agregadas" items={c.agregadas.map((x) => <><span className="text-muted-foreground">{x.codigo}</span>{nombre(x)}: {numero(x.cantidad, 2)}</>)} />
          <Detalle titulo="Quitadas" items={c.quitadas.map((x) => <><span className="text-muted-foreground">{x.codigo}</span>{nombre(x)}: {numero(x.cantidad, 2)}</>)} />
          <Detalle titulo="Cantidad distinta" items={c.cambiadas.map((x) => <><span className="text-muted-foreground">{x.codigo}</span>{nombre(x)}: {numero(x.antes, 2)} → {numero(x.despues, 2)}</>)} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{plural(c.iguales, 'línea quedó igual', 'líneas quedaron iguales')}.</p>
      </Desplegable>
      {pedido.terminado ? (
        <>
          <Aviso tono="ok" titulo={`Pedido terminado el ${fechaHora(pedido.terminadoEn)}.`}>
            {pedido.porQue && (
              <>
                <p className="mt-1 font-semibold">Lo que tuvo en cuenta</p>
                <p className="whitespace-pre-line">{pedido.porQue}</p>
              </>
            )}
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
            <span>¿Qué tuvo en cuenta para decidir su pedido? <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <textarea className={cn(claseEntrada, 'min-h-28 py-3 font-normal')} maxLength={5000} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          {error && <ErrorLista mensaje={error} />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Boton variante="primario" onClick={terminar} disabled={enviando}>{enviando ? 'Guardando…' : 'Terminar pedido'}</Boton>
            <Link href="?paso=4" className="font-semibold text-primary hover:text-primary-hover">← Volver a la lista final</Link>
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
  const mensaje = ['Hola, buen día. Este es nuestro pedido:', ...lineas.map((l) => `• ${l.codigo} ${l.nombre}: ${numero(l.cantidad)}`), '', 'Quedamos atentos a la confirmación y la fecha de entrega. Gracias.'].join('\n')

  async function bajar(tipo: 'xlsx' | 'pdf') {
    setAviso(null)
    try {
      // El servidor lo arma con el pedido guardado: el nombre de la empresa, el número y la fecha del pedido.
      await bajarArchivo(`/pedidos/${pedido.id}/pedido.${tipo}`, `pedido-${pedido.numero}.${tipo}`)
      setAviso(tipo === 'pdf' ? 'Listo: el PDF trae el pedido, los totales y el espacio para la firma.' : 'Listo: el Excel trae un resumen y una hoja por proveedor.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No pudimos armar el archivo.')
    }
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
      setAviso('Copiado. Péguelo en el chat de su proveedor.')
    } catch {
      setAviso('Su navegador no dejó copiar: seleccione el mensaje de abajo.')
    }
  }

  return (
    <section aria-labelledby="orden-compra" className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-secondary p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="orden-compra" className="text-lg font-bold">Su orden de compra</h3>
        <span className="text-chico font-semibold">
          {plural(lineas.length, 'producto', 'productos')} · {numero(unidades)} unidades
          {plata > 0 && <> · {plata.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })} a costo</>}
        </span>
      </div>
      <p className="text-chico text-muted-foreground">Su lista final, lista para enviar al proveedor o para aprobación.</p>
      <div className="flex flex-wrap gap-2">
        <Boton tamano="chico" variante="primario" onClick={() => bajar('pdf')}>PDF para aprobar</Boton>
        <Boton tamano="chico" onClick={() => bajar('xlsx')}>Excel por proveedor</Boton>
        <Boton tamano="chico" onClick={copiar}>Copiar mensaje para WhatsApp</Boton>
      </div>
      {aviso && <p className="text-chico font-semibold text-primary" aria-live="polite">{aviso}</p>}
      <Desplegable className="text-chico" titulo="Ver el mensaje">
        <pre className="rounded-lg bg-muted p-3 font-sans whitespace-pre-wrap">{mensaje}</pre>
      </Desplegable>
    </section>
  )
}

function Detalle({ titulo, items }: { titulo: string; items: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-1 font-bold">{titulo} ({items.length})</h3>
      {items.length ? <ul className="flex flex-col gap-1 text-chico">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-sm text-muted-foreground">Ninguna.</p>}
    </div>
  )
}
