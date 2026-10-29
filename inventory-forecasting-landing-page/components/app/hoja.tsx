'use client'

// Tabla que se maneja como una hoja de Excel: filas y columnas, Enter y flechas para moverse,
// y pegar varias filas copiadas de Excel (Ctrl+V / Cmd+V). Misma lógica que public/js/hoja.js.

import { forwardRef, useId, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Linea = { codigo: string; nombre: string; cantidad: string; proveedor: string }
// alClic: la celda es un botón (por ejemplo, para abrir el detalle de un producto).
// accion: un botón pequeño al lado del valor (por ejemplo, "Usar" el sugerido en esa línea).
export type Extra = {
  titulo: string
  // sub: una segunda línea más pequeña debajo del valor.
  valor: (l: Linea) => { texto: string; clase?: string; sub?: string; claseSub?: string }
  alClic?: (l: Linea) => void
  accion?: (l: Linea, i: number) => { texto: string; titulo: string; alClic: () => void } | null
}
export type HojaApi = {
  lineas: () => Linea[]
  fijar: (l: { codigo: unknown; nombre?: unknown; cantidad: unknown; proveedor?: unknown }[]) => void
  marcarErrores: (filas: number[]) => void
  // Cambia la cantidad de una fila (para las acciones de una columna extra).
  ponerCantidad: (i: number, cantidad: string) => void
}

const COLUMNAS: (keyof Linea)[] = ['codigo', 'nombre', 'cantidad']
const COLUMNAS_CON_PROVEEDOR: (keyof Linea)[] = ['codigo', 'nombre', 'proveedor', 'cantidad']
const FILA_VACIA: Linea = { codigo: '', nombre: '', cantidad: '', proveedor: '' }
const VACIAS_AL_FINAL = 3
const MINIMAS = 8

const vacia = (f: Linea) => !f.codigo && !f.nombre && f.cantidad === '' && !f.proveedor
const normal = (t: string) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export const pareceNumero = (t: string) => {
  const s = String(t ?? '').trim()
  return s !== '' && /^[-+(]?\$?\s*[\d.,\s]+\)?-?$/.test(s)
}
function texto(v: unknown) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v).replace('.', ',')
  return String(v)
}

function conVacias(filas: Linea[]) {
  const out = filas.slice()
  let alFinal = 0
  for (let i = out.length - 1; i >= 0 && vacia(out[i]); i--) alFinal++
  while (alFinal < VACIAS_AL_FINAL || out.length < MINIMAS) {
    out.push({ ...FILA_VACIA })
    alFinal++
  }
  return out
}

// Si lo pegado trae una fila de encabezados, ubica las columnas por su nombre.
function columnasPorEncabezado(fila: string[]) {
  const n = fila.map(normal)
  const buscar = (re: RegExp) => n.findIndex((t) => re.test(t))
  const codigo = buscar(/^(cod|codigo|codigo producto|cod producto|referencia|ref|item|sku|articulo|codigo articulo|material|plu)\b/)
  if (codigo < 0) return null
  const proveedor = buscar(/^(proveedor|proveedores|supplier|vendor)\b/)
  let cantidad = buscar(/pedir|pedido|comprar|solicitad/)
  if (cantidad < 0) cantidad = buscar(/^(cantidad|cant|unidades)\b/)
  let nombre = buscar(/^(nombre|descripcion|producto|detalle|denominacion)/)
  // "CODIGO | ARTÍCULO | PEDIDO": el código ya está; "Artículo" (o la única columna que queda) es el nombre.
  if (nombre < 0) nombre = n.findIndex((t, i) => i !== codigo && i !== cantidad && i !== proveedor && /^(articulo|referencia|item|material)\b/.test(t))
  if (nombre < 0) {
    const resto = n.map((_, i) => i).filter((i) => i !== codigo && i !== cantidad && i !== proveedor)
    if (resto.length === 1) nombre = resto[0]
  }
  return { codigo, nombre, cantidad, proveedor }
}

function separarFilas(datos: string) {
  const out: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let k = 0; k < datos.length; k++) {
    const ch = datos[k]
    if (comillas) {
      if (ch === '"' && datos[k + 1] === '"') { celda += '"'; k++ } else if (ch === '"') comillas = false
      else celda += ch
    } else if (ch === '"' && celda === '') comillas = true
    else if (ch === '\t') { fila.push(celda); celda = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && datos[k + 1] === '\n') k++
      fila.push(celda); out.push(fila); fila = []; celda = ''
    } else celda += ch
  }
  if (celda !== '' || fila.length) { fila.push(celda); out.push(fila) }
  return out.map((f) => f.map((c) => c.trim())).filter((f) => f.some((c) => c !== ''))
}

// tituloCantidad: el nombre de la columna que se edita (en la lista final, "Tu cantidad final").
// extrasAntes: columnas entre el nombre y la cantidad (en la lista final, el contexto y el sugerido
// van antes de la decisión). destacarCantidad: la columna que se edita se resalta.
// claseFila: una clase por fila (por ejemplo, las que cambiaron).
type Props = {
  inicial: { codigo: unknown; nombre?: unknown; cantidad: unknown; proveedor?: unknown }[]
  // conProveedor: muestra la columna del proveedor; proveedores: los conocidos, para sugerirlos.
  conProveedor?: boolean
  proveedores?: string[]
  soloLectura?: boolean
  extras?: Extra[]
  extrasAntes?: Extra[]
  alCambiar?: () => void
  tituloCantidad?: string
  destacarCantidad?: boolean
  claseFila?: (l: Linea) => string | undefined
}

export const Hoja = forwardRef<HojaApi, Props>(function Hoja({ inicial, soloLectura = false, extras = [], extrasAntes = [], alCambiar, tituloCantidad = 'Cantidad', destacarCantidad = false, claseFila, conProveedor = false, proveedores = [] }, ref) {
  const columnas = conProveedor ? COLUMNAS_CON_PROVEEDOR : COLUMNAS
  const listaProveedores = useId()
  const desde = (ls: Props['inicial']) => ls.map((l) => ({ codigo: texto(l.codigo), nombre: texto(l.nombre), cantidad: texto(l.cantidad), proveedor: texto(l.proveedor) }))
  const [filas, setFilas] = useState<Linea[]>(() => (soloLectura ? desde(inicial) : conVacias(desde(inicial))))
  const [errores, setErrores] = useState<Set<number>>(new Set())
  const tabla = useRef<HTMLTableElement>(null)

  useImperativeHandle(ref, () => ({
    lineas() {
      const out = filas.map((f) => ({ codigo: f.codigo.trim(), nombre: f.nombre.trim(), cantidad: f.cantidad.trim(), proveedor: f.proveedor.trim() }))
      while (out.length && vacia(out[out.length - 1])) out.pop()
      return out
    },
    fijar(ls) {
      setFilas(conVacias(desde(ls)))
      setErrores(new Set())
    },
    marcarErrores(fs) {
      setErrores(new Set(fs.map((f) => f - 1)))
    },
    ponerCantidad(i, cantidad) {
      const sig = filas.slice()
      if (!sig[i]) return
      sig[i] = { ...sig[i], cantidad }
      cambiar(sig)
    },
  }), [filas])

  function cambiar(sig: Linea[]) {
    setFilas(conVacias(sig))
    alCambiar?.()
  }

  function enfocar(i: number, col: number) {
    requestAnimationFrame(() => {
      const input = tabla.current?.querySelector<HTMLInputElement>(`tr[data-i="${i}"] input[data-col="${col}"]`)
      if (input) { input.focus(); input.select() }
    })
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>, i: number, col: number) {
    const input = e.currentTarget
    const alInicio = input.selectionStart === 0 && input.selectionEnd === 0
    const alFinal = input.selectionStart === input.value.length
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.altKey)) {
      e.preventDefault()
      if (e.key === 'Enter' && e.shiftKey) return enfocar(Math.max(0, i - 1), col)
      if (i + 1 >= filas.length) setFilas((f) => [...f, { ...FILA_VACIA }])
      enfocar(i + 1, col)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      enfocar(Math.max(0, i - 1), col)
    } else if (e.key === 'ArrowLeft' && alInicio && col > 0) {
      e.preventDefault()
      enfocar(i, col - 1)
    } else if (e.key === 'ArrowRight' && alFinal && col < columnas.length - 1) {
      e.preventDefault()
      enfocar(i, col + 1)
    }
  }

  function alPegar(e: ClipboardEvent<HTMLInputElement>, i: number, col: number) {
    const datos = e.clipboardData.getData('text/plain')
    if (!datos || (!datos.includes('\t') && !/\r?\n./.test(datos))) return // una sola celda: pegado normal
    e.preventDefault()
    let bloque = separarFilas(datos)
    if (!bloque.length) return
    let mapa: { codigo: number; nombre: number; cantidad: number; proveedor: number } | null = null
    const enc = columnasPorEncabezado(bloque[0])
    if (enc && bloque[0].length > 1 && !pareceNumero(bloque[0][enc.cantidad] ?? 'x')) {
      mapa = enc
      bloque = bloque.slice(1)
    } else if (col === 0 && bloque.every((f) => f.length === 2) && bloque.filter((f) => pareceNumero(f[1])).length >= bloque.length * 0.6) {
      mapa = { codigo: 0, nombre: -1, cantidad: 1, proveedor: -1 }
    }
    const sig = filas.slice()
    bloque.forEach((celdas, k) => {
      const d = i + k
      while (sig.length <= d) sig.push({ ...FILA_VACIA })
      const f = { ...sig[d] }
      if (mapa) {
        if (mapa.codigo >= 0) f.codigo = celdas[mapa.codigo] ?? ''
        if (mapa.nombre >= 0) f.nombre = celdas[mapa.nombre] ?? ''
        if (mapa.cantidad >= 0) f.cantidad = celdas[mapa.cantidad] ?? ''
        if (mapa.proveedor >= 0) f.proveedor = celdas[mapa.proveedor] ?? ''
      } else {
        celdas.slice(0, columnas.length - col).forEach((c, j) => { f[columnas[col + j]] = c })
      }
      sig[d] = f
    })
    cambiar(sig)
    enfocar(Math.min(i + bloque.length, sig.length - 1), col)
  }

  const visibles = soloLectura ? filas.filter((f) => !vacia(f)) : filas
  const destacada = destacarCantidad ? 'bg-primary/[0.07]' : ''
  const celdaExtra = (x: Extra, f: Linea, i: number) => {
    const v = x.valor(f)
    const a = x.accion ? x.accion(f, i) : null
    return (
      <td key={x.titulo} className={cn('border-l border-border px-2.5 py-2 text-chico whitespace-nowrap', v.clase)}>
        <span className="inline-flex items-center gap-2">
          <span className="leading-tight">
            {x.alClic && v.texto ? <button type="button" onClick={() => x.alClic!(f)} className="underline decoration-dotted underline-offset-4 hover:decoration-solid">{v.texto}</button> : v.texto}
            {v.sub && <span className={cn('block text-nota font-normal', v.claseSub ?? 'text-muted-foreground')}>{v.sub}</span>}
          </span>
          {a && (
            <button type="button" title={a.titulo} onClick={a.alClic} className="presionable rounded-md border border-primary/40 bg-card px-2 py-0.5 text-nota font-semibold text-primary hover:bg-primary hover:text-primary-foreground">
              {a.texto}
            </button>
          )}
        </span>
      </td>
    )
  }
  const productos = filas.filter((f) => f.codigo.trim()).length
  const celda = 'h-10 w-full bg-transparent px-2.5 outline-none focus:bg-card focus:ring-2 focus:ring-ring focus:ring-inset'

  return (
    <div className="flex flex-col gap-2">
      {conProveedor && <datalist id={listaProveedores}>{proveedores.map((p) => <option key={p} value={p} />)}</datalist>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table ref={tabla} className="w-full border-collapse text-cuerpo" style={{ minWidth: 520 + (conProveedor ? 160 : 0) + (extras.length + extrasAntes.length) * 80 }}>
          <thead className="bg-muted text-left text-nota text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2 text-center font-semibold">#</th>
              <th className={cn('px-2.5 py-2 font-semibold', extras.length + extrasAntes.length > 2 ? 'w-28' : 'w-40')}>Código</th>
              <th className={cn('px-2.5 py-2 font-semibold', (extras.length > 0 || extrasAntes.length > 0) && 'min-w-48')}>Nombre <span className="font-normal">(opcional)</span></th>
              {conProveedor && <th className="w-44 px-2.5 py-2 font-semibold">Proveedor <span className="font-normal">(opcional)</span></th>}
              {extrasAntes.map((x) => <th key={x.titulo} className="px-2.5 py-2 leading-tight font-semibold">{x.titulo}</th>)}
              <th className={cn('w-28 px-2.5 py-2 font-semibold', destacarCantidad && 'w-36 bg-primary text-primary-foreground')}>
                {destacarCantidad ? <span className="inline-flex items-center gap-1.5"><Pencil className="size-3.5" aria-hidden="true" />{tituloCantidad}</span> : tituloCantidad}
              </th>
              {extras.map((x) => <th key={x.titulo} className="px-2.5 py-2 leading-tight font-semibold">{x.titulo}</th>)}
              {!soloLectura && <th className="w-10" aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => {
              const invalida = f.cantidad !== '' && !pareceNumero(f.cantidad)
              return (
                <tr key={i} data-i={i} className={cn('border-t border-border', claseFila?.(f), errores.has(i) && 'bg-rojo-fondo')}>
                  <td className="px-2 text-center text-nota text-muted-foreground tabular-nums">{i + 1}</td>
                  {soloLectura ? (
                    <>
                      <td className="px-2.5 py-2">{f.codigo}</td>
                      <td className="px-2.5 py-2">{f.nombre}</td>
                      {conProveedor && <td className="px-2.5 py-2">{f.proveedor}</td>}
                      {extrasAntes.map((x) => celdaExtra(x, f, i))}
                      <td className={cn('px-2.5 py-2 font-semibold tabular-nums', destacada)}>{f.cantidad}</td>
                    </>
                  ) : (
                    columnas.flatMap((c, col) => [
                      ...(c === 'cantidad' ? extrasAntes.map((x) => celdaExtra(x, f, i)) : []),
                      <td key={c} className={cn('border-l border-border p-0', c === 'cantidad' && destacada)}>
                        <input
                          data-col={col}
                          value={f[c]}
                          aria-label={`${c === 'codigo' ? 'Código' : c === 'nombre' ? 'Nombre' : c === 'proveedor' ? 'Proveedor' : tituloCantidad}, fila ${i + 1}`}
                          list={c === 'proveedor' ? listaProveedores : undefined}
                          autoComplete="off"
                          spellCheck={false}
                          inputMode={c === 'cantidad' ? 'decimal' : undefined}
                          className={cn(celda, c === 'cantidad' && 'tabular-nums', c === 'cantidad' && destacarCantidad && 'text-[1.02rem] font-bold', c === 'cantidad' && invalida && 'text-rojo-texto underline decoration-wavy')}
                          onChange={(e) => {
                            const sig = filas.slice()
                            sig[i] = { ...sig[i], [c]: e.target.value }
                            setErrores((s) => { if (!s.has(i)) return s; const n = new Set(s); n.delete(i); return n })
                            cambiar(sig)
                          }}
                          onKeyDown={(e) => alTeclear(e, i, col)}
                          onPaste={(e) => alPegar(e, i, col)}
                        />
                      </td>,
                    ])
                  )}
                  {extras.map((x) => celdaExtra(x, f, i))}
                  {!soloLectura && (
                    <td className="border-l border-border p-0 text-center">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-label={`Quitar fila ${i + 1}`}
                        title="Quitar fila"
                        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => cambiar(filas.filter((_, k) => k !== i))}
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{productos === 1 ? '1 producto' : `${productos} productos`}</span>
        {!soloLectura && (
          <button
            type="button"
            className="font-semibold hover:text-foreground"
            onClick={() => {
              if (!filas.some((f) => !vacia(f))) return
              if (window.confirm('¿Borrar todas las filas de la lista?')) cambiar([])
            }}
          >
            Vaciar lista
          </button>
        )}
      </div>
    </div>
  )
})
