'use client'

// Tabla que se maneja como una hoja de Excel: filas y columnas, Enter y flechas para moverse,
// y pegar varias filas copiadas de Excel (Ctrl+V / Cmd+V). Misma lógica que public/js/hoja.js.

import { forwardRef, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Linea = { codigo: string; nombre: string; cantidad: string }
// alClic: la celda es un botón (por ejemplo, para abrir el detalle de un producto).
export type Extra = { titulo: string; valor: (l: Linea) => { texto: string; clase?: string }; alClic?: (l: Linea) => void }
export type HojaApi = { lineas: () => Linea[]; fijar: (l: { codigo: unknown; nombre?: unknown; cantidad: unknown }[]) => void; marcarErrores: (filas: number[]) => void }

const COLUMNAS: (keyof Linea)[] = ['codigo', 'nombre', 'cantidad']
const VACIAS_AL_FINAL = 3
const MINIMAS = 8

const vacia = (f: Linea) => !f.codigo && !f.nombre && f.cantidad === ''
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
    out.push({ codigo: '', nombre: '', cantidad: '' })
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
  let cantidad = buscar(/pedir|pedido|comprar|solicitad/)
  if (cantidad < 0) cantidad = buscar(/^(cantidad|cant|unidades)\b/)
  const nombre = buscar(/^(nombre|descripcion|producto|detalle|denominacion)/)
  return { codigo, nombre, cantidad }
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

// tituloCantidad: el nombre de la columna que se edita (en la lista final, "Vas a pedir").
type Props = { inicial: { codigo: unknown; nombre?: unknown; cantidad: unknown }[]; soloLectura?: boolean; extras?: Extra[]; alCambiar?: () => void; tituloCantidad?: string }

export const Hoja = forwardRef<HojaApi, Props>(function Hoja({ inicial, soloLectura = false, extras = [], alCambiar, tituloCantidad = 'Cantidad' }, ref) {
  const desde = (ls: Props['inicial']) => ls.map((l) => ({ codigo: texto(l.codigo), nombre: texto(l.nombre), cantidad: texto(l.cantidad) }))
  const [filas, setFilas] = useState<Linea[]>(() => (soloLectura ? desde(inicial) : conVacias(desde(inicial))))
  const [errores, setErrores] = useState<Set<number>>(new Set())
  const tabla = useRef<HTMLTableElement>(null)

  useImperativeHandle(ref, () => ({
    lineas() {
      const out = filas.map((f) => ({ codigo: f.codigo.trim(), nombre: f.nombre.trim(), cantidad: f.cantidad.trim() }))
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
      if (i + 1 >= filas.length) setFilas((f) => [...f, { codigo: '', nombre: '', cantidad: '' }])
      enfocar(i + 1, col)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      enfocar(Math.max(0, i - 1), col)
    } else if (e.key === 'ArrowLeft' && alInicio && col > 0) {
      e.preventDefault()
      enfocar(i, col - 1)
    } else if (e.key === 'ArrowRight' && alFinal && col < 2) {
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
    let mapa: { codigo: number; nombre: number; cantidad: number } | null = null
    const enc = columnasPorEncabezado(bloque[0])
    if (enc && bloque[0].length > 1 && !pareceNumero(bloque[0][enc.cantidad] ?? 'x')) {
      mapa = enc
      bloque = bloque.slice(1)
    } else if (col === 0 && bloque.every((f) => f.length === 2) && bloque.filter((f) => pareceNumero(f[1])).length >= bloque.length * 0.6) {
      mapa = { codigo: 0, nombre: -1, cantidad: 1 }
    }
    const sig = filas.slice()
    bloque.forEach((celdas, k) => {
      const d = i + k
      while (sig.length <= d) sig.push({ codigo: '', nombre: '', cantidad: '' })
      const f = { ...sig[d] }
      if (mapa) {
        if (mapa.codigo >= 0) f.codigo = celdas[mapa.codigo] ?? ''
        if (mapa.nombre >= 0) f.nombre = celdas[mapa.nombre] ?? ''
        if (mapa.cantidad >= 0) f.cantidad = celdas[mapa.cantidad] ?? ''
      } else {
        celdas.slice(0, 3 - col).forEach((c, j) => { f[COLUMNAS[col + j]] = c })
      }
      sig[d] = f
    })
    cambiar(sig)
    enfocar(Math.min(i + bloque.length, sig.length - 1), col)
  }

  const visibles = soloLectura ? filas.filter((f) => !vacia(f)) : filas
  const productos = filas.filter((f) => f.codigo.trim()).length
  const celda = 'h-10 w-full bg-transparent px-2.5 outline-none focus:bg-card focus:ring-2 focus:ring-ring focus:ring-inset'

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table ref={tabla} className="w-full min-w-[560px] border-collapse text-[0.95rem]">
          <thead className="bg-muted text-left text-[0.82rem] text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2 text-center font-semibold">#</th>
              <th className="w-40 px-2.5 py-2 font-semibold">Código</th>
              <th className="px-2.5 py-2 font-semibold">Nombre <span className="font-normal">(opcional)</span></th>
              <th className="w-28 px-2.5 py-2 font-semibold">{tituloCantidad}</th>
              {extras.map((x) => <th key={x.titulo} className="px-2.5 py-2 font-semibold">{x.titulo}</th>)}
              {!soloLectura && <th className="w-10" aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => {
              const invalida = f.cantidad !== '' && !pareceNumero(f.cantidad)
              return (
                <tr key={i} data-i={i} className={cn('border-t border-border', errores.has(i) && 'bg-rojo-fondo')}>
                  <td className="px-2 text-center text-[0.8rem] text-muted-foreground tabular-nums">{i + 1}</td>
                  {soloLectura ? (
                    <>
                      <td className="px-2.5 py-2">{f.codigo}</td>
                      <td className="px-2.5 py-2">{f.nombre}</td>
                      <td className="px-2.5 py-2 tabular-nums">{f.cantidad}</td>
                    </>
                  ) : (
                    COLUMNAS.map((c, col) => (
                      <td key={c} className="border-l border-border p-0">
                        <input
                          data-col={col}
                          value={f[c]}
                          aria-label={`${c === 'codigo' ? 'Código' : c === 'nombre' ? 'Nombre' : tituloCantidad}, fila ${i + 1}`}
                          autoComplete="off"
                          spellCheck={false}
                          inputMode={c === 'cantidad' ? 'decimal' : undefined}
                          className={cn(celda, c === 'cantidad' && 'tabular-nums', c === 'cantidad' && invalida && 'text-rojo-texto underline decoration-wavy')}
                          onChange={(e) => {
                            const sig = filas.slice()
                            sig[i] = { ...sig[i], [c]: e.target.value }
                            setErrores((s) => { if (!s.has(i)) return s; const n = new Set(s); n.delete(i); return n })
                            cambiar(sig)
                          }}
                          onKeyDown={(e) => alTeclear(e, i, col)}
                          onPaste={(e) => alPegar(e, i, col)}
                        />
                      </td>
                    ))
                  )}
                  {extras.map((x) => {
                    const v = x.valor(f)
                    return (
                      <td key={x.titulo} className={cn('border-l border-border px-2.5 py-2 text-[0.9rem] whitespace-nowrap', v.clase)}>
                        {x.alClic && v.texto ? <button type="button" onClick={() => x.alClic!(f)} className="underline decoration-dotted underline-offset-4 hover:decoration-solid">{v.texto}</button> : v.texto}
                      </td>
                    )
                  })}
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
