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
import { Aviso, Boton, BotonEnlace, Campo, Cargando, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'

export const TIPOS: { id: TipoMovimiento; texto: string; ayuda: string; icono: ReactNode; signo: string }[] = [
  { id: 'venta', texto: 'Venta', ayuda: 'Lo que se vendió. Cuenta para el promedio de ventas.', icono: <ShoppingCart />, signo: '−' },
  { id: 'entrada', texto: 'Entrada', ayuda: 'Llegó mercancía del proveedor.', icono: <ArrowDownToLine />, signo: '+' },
  { id: 'devolucion', texto: 'Devolución', ayuda: 'Un cliente devolvió algo: vuelve al inventario y se resta de las ventas.', icono: <RotateCcw />, signo: '+' },
  { id: 'salida', texto: 'Otra salida', ayuda: 'Daño, consumo propio o traslado. Resta, pero no es venta.', icono: <ArrowUpFromLine />, signo: '−' },
  { id: 'conteo', texto: 'Conteo', ayuda: 'Contaste lo que hay: las existencias quedan en esa cantidad.', icono: <ClipboardCheck />, signo: '=' },
]
export const TEXTO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t.texto])) as Record<TipoMovimiento, string>

type Resultado = { guardados: number; avisos: string[] }

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
  const { ventana, preguntar } = useConfirmar()

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
    const ok = await preguntar(`¿Anular esta ${TEXTO_TIPO[m.tipo].toLowerCase()}?`, `${m.codigo} · ${numero(m.cantidad, 2)} el ${dia(m.fecha)}. No se borra: queda tachado en el historial y deja de contar en las existencias.`, 'Sí, anular', true)
    if (!ok) return
    await api('POST', `/movimientos/${m.id}/anular`)
    cargar(fecha)
    recargar()
  }

  if (!hoy) return errorLista ? <ErrorLista mensaje={errorLista} /> : <Cargando />

  return (
    <>
      <Titulo
        sub="Registra lo que entra y sale cada día. Las existencias, el panel y el boletín se actualizan solos. El archivo de tu programa contable lo sigues pudiendo subir en Datos: se combinan."
        acciones={<BotonEnlace href="/existencias">Ver existencias</BotonEnlace>}
      >
        Movimientos
      </Titulo>
      {perfil === 'analista' && <Aviso tono="info">Registrar movimientos es tarea del perfil operador, pero cualquiera de la empresa puede hacerlo.</Aviso>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <RegistroRapido fecha={fecha || hoy} hoy={hoy} cambiarFecha={setFecha} alGuardar={alGuardar} />
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[0.95rem]" data-privado>
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
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5"><strong>{m.codigo}</strong> <span className="text-muted-foreground">{m.nombre}</span>{m.nota && <span className="block text-[0.82rem] text-muted-foreground">{m.nota}</span>}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-2.5">{TEXTO_TIPO[m.tipo]}</td>
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
      <p className="text-[0.85rem] text-muted-foreground">{TIPOS.find((t) => t.id === valor)!.ayuda}</p>
    </div>
  )
}

// Un movimiento a la vez: tipo, producto, cantidad y Enter.
function RegistroRapido({ fecha, hoy, cambiarFecha, alGuardar }: { fecha: string; hoy: string; cambiarFecha: (f: string) => void; alGuardar: (r: Resultado) => void }) {
  const [tipo, setTipo] = useState<TipoMovimiento>('venta')
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [faltan, setFaltan] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const { productos, total } = useCatalogo(codigo)
  const lista = useId()
  const campoCodigo = useRef<HTMLInputElement>(null)
  const elegido = productos.find((p) => p.codigo.toUpperCase() === codigo.trim().toUpperCase())

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setFaltan([])
    try {
      const r = await api<Resultado>('POST', '/movimientos', { movimientos: [{ codigo, tipo, cantidad, fecha, nota }] })
      alGuardar(r)
      setCodigo('')
      setCantidad('')
      setNota('')
      campoCodigo.current?.focus()
    } catch (err) {
      setError(textoErrores(err))
      if (err instanceof ErrorApi && Array.isArray(err.datos.faltan)) setFaltan(err.datos.faltan as string[])
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="text-xl font-bold">Registrar un movimiento</h2>
      {total === 0 && <Aviso tono="info">Tu catálogo está vacío. Sube el archivo de tu programa en Datos para traer tus productos, o créalos uno por uno al registrar.</Aviso>}
      <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
        <ElegirTipo valor={tipo} onCambio={setTipo} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Campo etiqueta="Producto" nota={elegido ? `· ${elegido.nombre}` : undefined}>
            <input ref={campoCodigo} className={claseEntrada} list={lista} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código o nombre" autoComplete="off" required />
            <datalist id={lista}>{productos.map((p) => <option key={p.id} value={p.codigo}>{p.nombre}</option>)}</datalist>
          </Campo>
          <Campo etiqueta={tipo === 'conteo' ? 'Contaste' : 'Cantidad'}>
            <input className={claseEntrada} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
          </Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Campo etiqueta="Fecha"><input type="date" className={claseEntrada} value={fecha} max={hoy} onChange={(e) => e.target.value && cambiarFecha(e.target.value)} /></Campo>
          <Campo etiqueta="Nota" nota="(opcional)"><input className={claseEntrada} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Factura, cliente, motivo…" maxLength={200} /></Campo>
        </div>
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        {faltan.map((c) => <CrearProducto key={c} codigo={c} alCrear={() => setFaltan((f) => f.filter((x) => x !== c))} />)}
        <Boton type="submit" variante="primario" className="self-start" disabled={guardando || !codigo || !cantidad}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
      </form>
    </Tarjeta>
  )
}

// Un código que no está en el catálogo: se crea aquí mismo y se vuelve a guardar.
export function CrearProducto({ codigo, alCrear }: { codigo: string; alCrear: () => void }) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="aparecer flex flex-col gap-2 rounded-xl border border-border bg-muted p-3">
      <p className="text-[0.92rem]"><strong>{codigo}</strong> no está en tu catálogo. ¿Lo creas?</p>
      <div className="flex flex-wrap gap-2">
        <input className={cn(claseEntrada, 'min-w-0 flex-1')} placeholder="Nombre del producto" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label={`Nombre de ${codigo}`} />
        <Boton
          tamano="chico"
          disabled={!nombre.trim()}
          onClick={async () => {
            try {
              await api('POST', '/catalogo', { codigo, nombre })
              alCrear()
            } catch (e) {
              setError(textoErrores(e).mensaje)
            }
          }}
        >
          <PackagePlus /> Crear producto
        </Boton>
      </div>
      {error && <p className="text-sm text-rojo-texto">{error}</p>}
      <p className="text-[0.82rem] text-muted-foreground">Después de crearlo, vuelve a guardar.</p>
    </div>
  )
}

// Varias líneas a la vez: código y cantidad, pegados desde Excel (una fila por producto).
function PegarVarios({ fecha, hoy, alGuardar }: { fecha: string; hoy: string; alGuardar: (r: Resultado) => void }) {
  const [tipo, setTipo] = useState<TipoMovimiento>('venta')
  const [texto, setTexto] = useState('')
  const [fechaLote, setFechaLote] = useState(fecha)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [faltan, setFaltan] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setFechaLote(fecha), [fecha])

  // Cada fila: código y cantidad separados por tabulador (Excel), punto y coma o varios espacios.
  const filas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const partes = l.split(/\t|;|\s{2,}/).map((x) => x.trim()).filter(Boolean)
      return { codigo: partes[0] || '', cantidad: partes[partes.length - 1] || '', nota: partes.length > 2 ? partes.slice(1, -1).join(' ') : '' }
    })

  async function guardar() {
    setGuardando(true)
    setError(null)
    setFaltan([])
    try {
      const r = await api<Resultado>('POST', '/movimientos', { movimientos: filas.map((f) => ({ ...f, tipo, fecha: fechaLote })) })
      alGuardar(r)
      setTexto('')
    } catch (err) {
      setError(textoErrores(err))
      if (err instanceof ErrorApi && Array.isArray(err.datos.faltan)) setFaltan(err.datos.faltan as string[])
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="text-xl font-bold">Pegar varios desde Excel</h2>
      <ElegirTipo valor={tipo} onCambio={setTipo} />
      <Campo etiqueta="Código y cantidad, una fila por producto" nota="(copia dos columnas de Excel y pégalas)">
        <textarea className={cn(claseEntrada, 'min-h-36 py-2 font-mono text-sm')} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'TOR-0610\t12\nLIJ-0120\t40'} spellCheck={false} />
      </Campo>
      <Campo etiqueta="Fecha"><input type="date" className={cn(claseEntrada, 'max-w-48')} value={fechaLote} max={hoy} onChange={(e) => e.target.value && setFechaLote(e.target.value)} /></Campo>
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      {faltan.slice(0, 5).map((c) => <CrearProducto key={c} codigo={c} alCrear={() => setFaltan((f) => f.filter((x) => x !== c))} />)}
      <Boton variante="primario" className="self-start" disabled={guardando || !filas.length} onClick={guardar}>
        {guardando ? 'Guardando…' : filas.length ? `Guardar ${filas.length === 1 ? '1 movimiento' : `${filas.length} movimientos`}` : 'Guardar'}
      </Boton>
      <p className="text-[0.82rem] text-muted-foreground">Si una fila tiene un error, no se guarda ninguna: corriges y vuelves a guardar.</p>
    </Tarjeta>
  )
}
