'use client'

// Movimientos del día: lo que entra y sale del inventario, uno por uno o pegado desde Excel.
// Con esto el inventario queda al día sin esperar el archivo del programa contable (que se puede
// seguir subiendo en Datos: los dos se combinan, server/saldos.js).

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, PackagePlus, RotateCcw, ShoppingCart, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ErrorApi, textoErrores } from '@/lib/api'
import { dia, numero } from '@/lib/formato'
import type { Movimiento, ProductoCatalogo, TipoMovimiento } from '@/lib/tipos'
import { useConfirmar } from './confirmar'
import { useInventario } from './contexto'
import { Aviso, Boton, BotonEnlace, Campo, Cargando, ErrorLista, Pildoras, Tarjeta, Titulo, claseEntrada } from './ui'
import { Hoja, type HojaApi } from './hoja'
import { ImportarLista } from './pedido-flujo'

export const TIPOS: { id: TipoMovimiento; texto: string; ayuda: string; icono: ReactNode; signo: string }[] = [
  { id: 'venta', texto: 'Venta', ayuda: 'Lo que se vendió. Cuenta para el promedio de ventas.', icono: <ShoppingCart />, signo: '−' },
  { id: 'entrada', texto: 'Entrada', ayuda: 'Llegó mercancía del proveedor.', icono: <ArrowDownToLine />, signo: '+' },
  { id: 'devolucion', texto: 'Devolución', ayuda: 'Un cliente devolvió algo: regresa al inventario y se resta de las ventas.', icono: <RotateCcw />, signo: '+' },
  { id: 'salida', texto: 'Otra salida', ayuda: 'Daño, consumo propio o traslado. Resta, pero no es venta.', icono: <ArrowUpFromLine />, signo: '−' },
  { id: 'conteo', texto: 'Conteo', ayuda: 'Se contó lo que hay: las existencias quedan en esa cantidad.', icono: <ClipboardCheck />, signo: '=' },
]
export const TEXTO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t.texto])) as Record<TipoMovimiento, string>

type Resultado = { guardados: number; creados?: string[]; avisos: string[] }

type Modo = 'uno' | 'varios'
const CLAVE_MODO = 'movimientos-modo'

// Códigos que no están en el catálogo y se parecen a productos que ya existen (respuesta 409 de
// POST /movimientos). Lo que conteste la persona vuelve como `resolver`: código existente o 'nuevo'.
type Desconocido = { codigo: string; nombre: string }
type Pendiente = { parecidos: (Desconocido & { opciones: Desconocido[] })[]; nuevos: Desconocido[] }

function pendienteDe(err: unknown): Pendiente | null {
  if (!(err instanceof ErrorApi) || err.estado !== 409 || !Array.isArray(err.datos.parecidos)) return null
  return { parecidos: err.datos.parecidos as Pendiente['parecidos'], nuevos: (err.datos.nuevos as Desconocido[]) || [] }
}

// Busca en el catálogo de la empresa mientras se escribe (código o nombre).
function useCatalogo(q: string) {
  const [productos, setProductos] = useState<ProductoCatalogo[]>([])
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      api<{ productos: ProductoCatalogo[]; total: number }>('GET', `/catalogo?limite=20${q ? `&q=${encodeURIComponent(q)}` : ''}`)
        .then((r) => {
          if (!vivo) return
          setProductos(r.productos)
          setTotal(r.total)
        })
        .catch(() => {})
    }, 150)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [q])
  return { productos, total }
}

export function Movimientos() {
  const { recargar, perfil } = useInventario()
  const [hoy, setHoy] = useState<string | null>(null)
  const [fecha, setFecha] = useState<string>('')
  const [lista, setLista] = useState<Movimiento[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<Resultado | null>(null)
  const [modo, setModo] = useState<Modo>('uno')
  const { ventana, preguntar } = useConfirmar()

  // Se recuerda en este navegador si la persona registra de a uno o varios a la vez.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_MODO)
      if (guardado === 'uno' || guardado === 'varios') setModo(guardado)
    } catch {}
  }, [])
  function cambiarModo(m: Modo) {
    setModo(m)
    try { localStorage.setItem(CLAVE_MODO, m) } catch {}
  }

  const cargar = useCallback(async (f?: string) => {
    try {
      const r = await api<{ movimientos: Movimiento[]; hoy: string }>('GET', `/movimientos${f ? `?desde=${f}&hasta=${f}` : ''}`)
      setHoy(r.hoy)
      setLista(r.movimientos)
      if (!f) setFecha((x) => x || r.hoy)
    } catch (e) {
      setErrorLista(textoErrores(e).mensaje)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])
  useEffect(() => {
    if (fecha) cargar(fecha)
  }, [fecha, cargar])

  function alGuardar(r: Resultado) {
    setUltimo(r)
    cargar(fecha)
    recargar()
  }

  async function anular(m: Movimiento) {
    const ok = await preguntar(`¿Anular esta ${TEXTO_TIPO[m.tipo].toLowerCase()}?`, `${m.codigo} · ${numero(m.cantidad, 2)} el ${dia(m.fecha)}. No se borra: queda tachado en el historial y ya no cuenta en las existencias.`, 'Sí, anular', true)
    if (!ok) return
    await api('POST', `/movimientos/${m.id}/anular`)
    cargar(fecha)
    recargar()
  }

  if (!hoy) return errorLista ? <ErrorLista mensaje={errorLista} /> : <Cargando />

  return (
    <>
      <Titulo
        sub="Registre lo que entra y sale cada día. Las existencias, el panel y el boletín se actualizan solos. El archivo de su programa contable lo puede seguir subiendo en Datos: se combinan."
        acciones={<BotonEnlace href="/existencias">Ver existencias</BotonEnlace>}
      >
        Movimientos
      </Titulo>
      {perfil === 'analista' && <Aviso tono="info">Registrar movimientos es tarea del perfil operador, pero cualquiera de la empresa puede hacerlo.</Aviso>}

      <Pildoras
        etiqueta="Cuántos movimientos va a registrar"
        valor={modo}
        onCambio={cambiarModo}
        opciones={[{ id: 'uno', texto: 'Un movimiento' }, { id: 'varios', texto: 'Varios a la vez' }]}
      />
      {/* Se esconde el que no está elegido en vez de quitarlo: así no se pierde lo que se llevaba escrito. */}
      <div hidden={modo !== 'uno'}>
        <RegistroRapido fecha={fecha || hoy} hoy={hoy} cambiarFecha={setFecha} alGuardar={alGuardar} />
      </div>
      <div hidden={modo !== 'varios'}>
        <PegarVarios fecha={fecha || hoy} hoy={hoy} alGuardar={alGuardar} />
      </div>

      {ultimo && (
        <div className="aparecer flex flex-col gap-2">
          <Aviso tono="ok">{ultimo.guardados === 1 ? 'Guardado 1 movimiento.' : `Guardados ${ultimo.guardados} movimientos.`}</Aviso>
          {ultimo.avisos.map((a) => <Aviso key={a} tono="cuidado">{a}</Aviso>)}
        </div>
      )}

      <Tarjeta className="p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Registrado el {dia(fecha || hoy)}</h2>
          <label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            Ver otro día
            <input type="date" className="min-h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground" value={fecha} max={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          </label>
        </div>
        {!lista ? <Cargando /> : lista.length === 0 ? (
          <p className="text-muted-foreground">Nada registrado este día.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-cuerpo" data-privado>
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Producto</th>
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Tipo</th>
                  <th scope="col" className="border-b border-border px-2 py-2 text-right font-semibold">Cantidad</th>
                  <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Quién</th>
                  <th scope="col" className="border-b border-border px-2 py-2"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className={cn(m.anulado && 'text-muted-foreground line-through')}>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5"><strong>{m.codigo}</strong> <span className="text-muted-foreground">{m.nombre}</span>{m.nota && <span className="block text-nota text-muted-foreground">{m.nota}</span>}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5">
                      {TEXTO_TIPO[m.tipo]}
                      {m.proyecto && <span className="block text-nota text-muted-foreground">de proyecto</span>}
                      {m.desde && <span className="block text-nota text-muted-foreground">del {dia(m.desde)} al {dia(m.fecha)}</span>}
                      {m.pedidoId && <span className="block text-nota text-muted-foreground">llegada de un pedido</span>}
                    </td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5 text-right font-semibold tabular-nums">{TIPOS.find((t) => t.id === m.tipo)!.signo}{numero(m.cantidad, 2)}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5 text-sm text-muted-foreground">{m.registro || '—'}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5 text-right">
                      {m.anulado ? <span className="text-sm no-underline">Anulado</span> : <Boton tamano="chico" variante="fantasma" onClick={() => anular(m)}><Undo2 /> Anular</Boton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      {ventana}
    </>
  )
}

function ElegirTipo({ valor, onCambio }: { valor: TipoMovimiento; onCambio: (t: TipoMovimiento) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Tipo de movimiento" className="flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={valor === t.id}
            onClick={() => onCambio(t.id)}
            className={cn('presionable flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold whitespace-nowrap [&_svg]:size-4', valor === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted')}
          >
            {t.icono}{t.texto}
          </button>
        ))}
      </div>
      <p className="text-nota text-muted-foreground">{TIPOS.find((t) => t.id === valor)!.ayuda}</p>
    </div>
  )
}

// Un movimiento a la vez: tipo, producto, cantidad y Enter.
function RegistroRapido({ fecha, hoy, cambiarFecha, alGuardar }: { fecha: string; hoy: string; cambiarFecha: (f: string) => void; alGuardar: (r: Resultado) => void }) {
  const [tipo, setTipo] = useState<TipoMovimiento>('venta')
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [proyecto, setProyecto] = useState(false)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [guardando, setGuardando] = useState(false)
  const { productos, total } = useCatalogo(codigo)
  const lista = useId()
  const idFormulario = useId()
  const campoCodigo = useRef<HTMLInputElement>(null)
  const elegido = productos.find((p) => p.codigo.toUpperCase() === codigo.trim().toUpperCase())

  async function enviar(resolver?: Record<string, string>) {
    setGuardando(true)
    setError(null)
    try {
      const r = await api<Resultado>('POST', '/movimientos', { movimientos: [{ codigo, tipo, cantidad, fecha, nota, proyecto: tipo === 'venta' && proyecto }], resolver })
      alGuardar(r)
      setPendiente(null)
      setCodigo('')
      setCantidad('')
      setNota('')
      setProyecto(false)
      campoCodigo.current?.focus()
    } catch (err) {
      const p = pendienteDe(err)
      if (p) setPendiente(p)
      else setError(textoErrores(err))
    } finally {
      setGuardando(false)
    }
  }

  function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPendiente(null)
    enviar()
  }

  return (
    <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Registrar un movimiento</h2>
        {!pendiente && <Boton type="submit" form={idFormulario} variante="primario" disabled={guardando || !codigo || !cantidad}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>}
      </div>
      {total === 0 && <Aviso tono="info">Su catálogo está vacío. Suba el archivo de su programa en Datos para traer sus productos. Si registra un código que no está, se crea como producto nuevo.</Aviso>}
      <form id={idFormulario} className="flex flex-col gap-4" onSubmit={guardar} noValidate>
        <ElegirTipo valor={tipo} onCambio={setTipo} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Campo etiqueta="Producto" nota={elegido ? `· ${elegido.nombre}` : undefined}>
            <input ref={campoCodigo} className={claseEntrada} list={lista} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código o nombre" autoComplete="off" required />
            <datalist id={lista}>{productos.map((p) => <option key={p.id} value={p.codigo}>{p.nombre}</option>)}</datalist>
          </Campo>
          <Campo etiqueta={tipo === 'conteo' ? 'Conteo' : 'Cantidad'}>
            <input className={claseEntrada} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
          </Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Campo etiqueta="Fecha"><input type="date" className={claseEntrada} value={fecha} max={hoy} onChange={(e) => e.target.value && cambiarFecha(e.target.value)} /></Campo>
          <Campo etiqueta="Nota" nota="(opcional)"><input className={claseEntrada} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Factura, cliente, motivo…" maxLength={200} /></Campo>
        </div>
        {tipo === 'venta' && (
          <label className="flex items-start gap-2.5 text-cuerpo">
            <input type="checkbox" checked={proyecto} onChange={(e) => setProyecto(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
            <span>
              <strong>Es para un proyecto</strong>
              <span className="block text-nota text-muted-foreground">Una obra o un cliente puntual que no se repite. Baja las existencias, pero no cuenta en el promedio de venta ni en lo sugerido.</span>
            </span>
          </label>
        )}
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        {pendiente ? (
          <ProductosNoEncontrados pendiente={pendiente} guardando={guardando} alGuardar={enviar} alCancelar={() => setPendiente(null)} />
        ) : (
          <Boton type="submit" variante="primario" className="self-start" disabled={guardando || !codigo || !cantidad}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        )}
      </form>
    </Tarjeta>
  )
}

// Códigos que no están en el catálogo pero se parecen a productos que ya existen: para cada uno, la
// persona dice si se refería a uno de esos o si es un producto nuevo. Los que no se parecen a
// ninguno se crean al guardar, y aquí se avisa.
function ProductosNoEncontrados({ pendiente, guardando, alGuardar, alCancelar }: { pendiente: Pendiente; guardando: boolean; alGuardar: (resolver: Record<string, string>) => void; alCancelar: () => void }) {
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const grupo = useId()
  const faltan = pendiente.parecidos.filter((d) => !respuestas[d.codigo]).length
  const conNombre = (d: Desconocido) => (d.nombre ? `${d.codigo} · ${d.nombre}` : d.codigo)
  return (
    <div className="aparecer flex flex-col gap-4 rounded-xl border border-ambar-borde bg-ambar-fondo/50 p-4">
      <div>
        <p className="font-semibold">{pendiente.parecidos.length === 1 ? 'Un código no está en su catálogo' : `${pendiente.parecidos.length} códigos no están en su catálogo`}, pero se {pendiente.parecidos.length === 1 ? 'parece' : 'parecen'} a productos que ya tiene.</p>
        <p className="text-nota text-muted-foreground">Elija si se refería a uno de ellos. Todavía no se guardó nada.</p>
      </div>
      {pendiente.parecidos.map((d, i) => (
        <fieldset key={d.codigo} className="flex flex-col gap-2">
          <legend className="mb-1 text-cuerpo"><strong>{d.codigo}</strong>{d.nombre ? <span className="text-muted-foreground"> · {d.nombre}</span> : null}: ¿se refiere a…?</legend>
          {[...d.opciones.map((o) => ({ valor: o.codigo, texto: conNombre(o) })), { valor: 'nuevo', texto: 'No, es un producto nuevo: créelo' }].map((o) => (
            <label key={o.valor} className={cn('flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-chico', respuestas[d.codigo] === o.valor ? 'border-primary bg-secondary' : 'border-input bg-card hover:bg-muted')}>
              <input type="radio" name={`${grupo}-${i}`} value={o.valor} checked={respuestas[d.codigo] === o.valor} onChange={() => setRespuestas((r) => ({ ...r, [d.codigo]: o.valor }))} className="size-4 accent-[var(--primary)]" />
              {o.valor === 'nuevo' ? <PackagePlus className="size-4 shrink-0 text-muted-foreground" /> : null}
              <span className="min-w-0">{o.texto}</span>
            </label>
          ))}
        </fieldset>
      ))}
      {pendiente.nuevos.length > 0 && (
        <p className="text-chico">
          {pendiente.nuevos.length === 1 ? 'Este código no se parece a ninguno de su catálogo y se va a crear como producto nuevo: ' : `Estos ${pendiente.nuevos.length} códigos no se parecen a ninguno de su catálogo y se van a crear como productos nuevos: `}
          <strong>{pendiente.nuevos.slice(0, 10).map((d) => d.codigo).join(', ')}{pendiente.nuevos.length > 10 ? ` y ${pendiente.nuevos.length - 10} más` : ''}</strong>.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Boton variante="primario" disabled={guardando || faltan > 0} onClick={() => alGuardar(respuestas)}>{guardando ? 'Guardando…' : faltan ? `Falta elegir ${faltan === 1 ? '1 código' : `${faltan} códigos`}` : 'Guardar'}</Boton>
        <Boton variante="fantasma" disabled={guardando} onClick={alCancelar}>Volver a editar</Boton>
      </div>
    </div>
  )
}

// Varias líneas a la vez, en una hoja como la de Excel (código, nombre y cantidad): escritas, pegadas
// desde Excel o importadas de un archivo. "Del día" registra un tipo de movimiento en una fecha; "Ventas
// de un periodo" registra lo vendido entre dos fechas (por ejemplo, el total del mes) y se reparte
// entre esos días para el promedio.
type Forma = 'dia' | 'periodo'

const CAMPOS_MOVIMIENTOS = [
  { campo: 'codigo', nombre: 'Código de producto' },
  { campo: 'pedir', nombre: 'Cantidad' },
  { campo: 'nombre', nombre: 'Nombre (opcional)' },
]

function primeroDelMes(f: string) {
  return `${f.slice(0, 8)}01`
}

function PegarVarios({ fecha, hoy, alGuardar }: { fecha: string; hoy: string; alGuardar: (r: Resultado) => void }) {
  const [forma, setForma] = useState<Forma>('dia')
  const [tipo, setTipo] = useState<TipoMovimiento>('venta')
  const [fechaLote, setFechaLote] = useState(fecha)
  const [desde, setDesde] = useState(() => primeroDelMes(hoy))
  const [hasta, setHasta] = useState(hoy)
  const [filas, setFilas] = useState(0)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [version, setVersion] = useState(0)
  const hoja = useRef<HojaApi>(null)
  useEffect(() => setFechaLote(fecha), [fecha])

  const contar = () => {
    setPendiente(null)
    setTimeout(() => setFilas((hoja.current?.lineas() || []).filter((l) => l.codigo || l.cantidad).length), 150)
  }
  const periodo = forma === 'periodo'
  const periodoMalo = periodo && (!desde || !hasta || desde > hasta)
  // El mismo botón arriba y abajo de la hoja: con muchas filas, el de abajo queda lejos.
  const botonGuardar = (
    <Boton variante="primario" disabled={guardando || !filas || periodoMalo} onClick={() => guardar()}>
      {guardando ? 'Guardando…' : filas ? `Guardar ${filas === 1 ? '1 fila' : `${filas} filas`}` : 'Guardar'}
    </Boton>
  )

  async function guardar(resolver?: Record<string, string>) {
    const lineas = (hoja.current?.lineas() || []).filter((l) => l.codigo || l.cantidad)
    setGuardando(true)
    setError(null)
    if (!resolver) setPendiente(null)
    try {
      // El nombre va para reconocer el producto si el código no está en el catálogo, o para crearlo.
      const movimientos = lineas.map((l) => (periodo
        ? { codigo: l.codigo, nombre: l.nombre, cantidad: l.cantidad, tipo: 'venta', desde, fecha: hasta }
        : { codigo: l.codigo, nombre: l.nombre, cantidad: l.cantidad, tipo, fecha: fechaLote }))
      const r = await api<Resultado>('POST', '/movimientos', { movimientos, resolver })
      alGuardar(r)
      setPendiente(null)
      hoja.current?.fijar([])
      setFilas(0)
      setVersion((v) => v + 1)
    } catch (err) {
      const p = pendienteDe(err)
      if (p) setPendiente(p)
      else {
        const t = textoErrores(err)
        setError(t)
        // "Fila 3: …": se marca esa fila en la hoja.
        hoja.current?.marcarErrores(t.lista.map((x) => Number(/^Fila (\d+)/.exec(x)?.[1])).filter((n) => n > 0))
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Varios a la vez</h2>
        {pendiente ? <span className="text-nota text-muted-foreground">Conteste abajo por los códigos que no están en su catálogo.</span> : botonGuardar}
      </div>
      <Pildoras
        etiqueta="Qué va a registrar"
        valor={forma}
        onCambio={(f) => { setForma(f); setError(null) }}
        opciones={[{ id: 'dia', texto: 'Movimientos de un día' }, { id: 'periodo', texto: 'Ventas de un periodo' }]}
      />
      {periodo ? (
        <>
          <p className="text-nota text-muted-foreground">Lo vendido entre dos fechas, por ejemplo el total del mes que le da su programa. Se reparte por partes iguales entre esos días para el promedio de venta, y las existencias bajan el último día.</p>
          <div className="grid max-w-lg gap-3 sm:grid-cols-2">
            <Campo etiqueta="Desde"><input type="date" className={claseEntrada} value={desde} max={hasta || hoy} onChange={(e) => setDesde(e.target.value)} /></Campo>
            <Campo etiqueta="Hasta"><input type="date" className={claseEntrada} value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} /></Campo>
          </div>
        </>
      ) : (
        <>
          <ElegirTipo valor={tipo} onCambio={setTipo} />
          <Campo etiqueta="Fecha"><input type="date" className={cn(claseEntrada, 'max-w-48')} value={fechaLote} max={hoy} onChange={(e) => e.target.value && setFechaLote(e.target.value)} /></Campo>
        </>
      )}
      <ImportarLista
        ruta="/movimientos/importar"
        hoja={hoja}
        alImportar={contar}
        boton="Importar de un archivo"
        intro="Escriba el código y la cantidad, o pegue dos columnas copiadas de Excel (Ctrl+V)."
        conPlantilla={false}
        campos={CAMPOS_MOVIMIENTOS}
      />
      <Hoja key={version} ref={hoja} inicial={[]} alCambiar={contar} tituloCantidad={periodo ? 'Vendido' : tipo === 'conteo' ? 'Conteo' : 'Cantidad'} />
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      {pendiente ? (
        <ProductosNoEncontrados pendiente={pendiente} guardando={guardando} alGuardar={guardar} alCancelar={() => setPendiente(null)} />
      ) : (
        <div className="self-start">{botonGuardar}</div>
      )}
      <p className="text-nota text-muted-foreground">Si una fila tiene un error, no se guarda ninguna: corríjala y guarde de nuevo.</p>
    </Tarjeta>
  )
}
