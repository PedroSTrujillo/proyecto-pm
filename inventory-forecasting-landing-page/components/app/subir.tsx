'use client'

// Subir el export de ventas y existencias, con las preguntas que el lector puede necesitar:
// qué columna es cuál, qué documentos son ventas y de qué periodo son unas ventas sin fecha.
// Lo usan "Datos" y el paso 2 de un pedido.

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, prepararArchivo, textoErrores } from '@/lib/api'
import { plural } from '@/lib/formato'
import { GENERICA, SISTEMAS, sistemaPorId } from '@/lib/sistemas'
import type { Usuario } from '@/lib/tipos'
import { Aviso, Boton, ErrorLista, claseEntrada } from './ui'

export type HojaMapeo = {
  clave: string
  archivo: string
  hoja: string | null
  filaEncabezados: number | null
  encabezados: { indice: number; letra: string; texto: string }[]
  columnas: Record<string, number | null>
  sugeridas?: Record<string, number>
}

type Resultado = {
  ok: boolean
  exportId?: number
  errores?: string[]
  hojas?: HojaMapeo[]
  necesitaPeriodo?: boolean
  periodoSugerido?: { desde: string; hasta: string } | null
  necesitaDocumentos?: boolean
  documentos?: { prefijo: string; filas: number; ejemplo: string; sugerido: boolean }[]
  resumen?: { productos: number; seAgotan: number; sobran: number }
}

export const CAMPOS_EXPORT = [
  { campo: 'codigo', nombre: 'Código de producto' },
  { campo: 'nombre', nombre: 'Nombre (opcional)' },
  { campo: 'fecha', nombre: 'Fecha de la venta' },
  { campo: 'cantidad', nombre: 'Cantidad vendida' },
  { campo: 'existencias', nombre: 'Existencias' },
  { campo: 'documento', nombre: 'Tipo de documento (opcional)' },
  { campo: 'costo', nombre: 'Costo unitario (opcional)' },
  { campo: 'proveedor', nombre: 'Proveedor (opcional)' },
]

// --- Guía por programa -----------------------------------------------------------------------

export function GuiaSistema({ id }: { id: string | null }) {
  const s = sistemaPorId(id)
  if (!s) return null
  if (s.plantilla) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-[0.95rem]">
          <li>Descarga la plantilla.</li>
          <li>En la hoja &quot;Productos&quot;, escribe una fila por producto: lo que tienes hoy y lo que vendiste cada mes. Proveedor y costo son opcionales.</li>
          <li>Guárdala y súbela aquí abajo.</li>
        </ol>
        <a href="/plantillas/inventario.xlsx" download className="presionable inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-primary bg-primary px-4 text-[0.95rem] font-semibold text-primary-foreground hover:bg-primary-hover">
          <FileSpreadsheet className="size-4" /> Descargar la plantilla
        </a>
      </div>
    )
  }
  const generica = !s.ventas && !s.existencias && !s.unInforme
  const dosInformes = (
    <div className="grid gap-3 sm:grid-cols-2">
      <PasosGuia titulo="1. Ventas del último año" pasos={s.ventas || GENERICA.ventas} nota={s.ventasNota} />
      <PasosGuia titulo="2. Existencias de hoy" pasos={s.existencias || GENERICA.existencias} />
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      {generica && s.id !== 'otro' && <p className="text-sm text-muted-foreground">Estos pasos sirven en casi todos los programas; en {s.nombre} los nombres de los menús pueden cambiar un poco.</p>}
      {s.aviso && <p className="text-sm text-muted-foreground">{s.aviso}</p>}
      {s.unInforme ? (
        <>
          <div className="flex flex-col gap-2 rounded-2xl border border-[#cfe5e1] bg-secondary p-4">
            <h3 className="flex flex-wrap items-center gap-2 text-[0.95rem] font-bold text-secondary-foreground">
              Lo más rápido: un solo informe
              <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold">1 archivo</span>
            </h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-[0.93rem]">{s.unInforme.map((p) => <li key={p}>{p}</li>)}</ol>
            {s.unInformeNota && <p className="text-sm text-muted-foreground">{s.unInformeNota}</p>}
          </div>
          {(s.ventas || s.existencias) && (
            <details className="group rounded-2xl border border-border p-3">
              <summary className="cursor-pointer text-[0.93rem] font-semibold">Con dos informes también ves la venta de cada semana y la temporada</summary>
              <div className="mt-3">{dosInformes}</div>
            </details>
          )}
        </>
      ) : dosInformes}
      <p className="text-sm text-muted-foreground">
        Súbelos tal como salen, con títulos y totales. Si el informe mezcla compras y ventas o no trae fechas, te preguntamos.
        {s.fuentes.length > 0 && (
          <> Fuente: {s.fuentes.map((f, i) => <span key={f.url}>{i ? ', ' : ''}<a href={f.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{f.texto}</a></span>)}.</>
        )}
      </p>
    </div>
  )
}

function PasosGuia({ titulo, pasos, nota }: { titulo: string; pasos: string[]; nota?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted p-4">
      <h3 className="text-[0.95rem] font-bold">{titulo}</h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-[0.93rem]">{pasos.map((p) => <li key={p}>{p}</li>)}</ol>
      {nota && <p className="text-sm text-muted-foreground">{nota}</p>}
    </div>
  )
}

export function SelectorSistema({ valor, onCambio }: { valor: string | null; onCambio: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 font-semibold">
      ¿Dónde llevas tu inventario?
      <select className={cn(claseEntrada, 'font-semibold')} value={valor || ''} onChange={(e) => onCambio(e.target.value)}>
        <option value="">Elige una opción</option>
        {SISTEMAS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
    </label>
  )
}

// --- Elegir columnas ---------------------------------------------------------------------------

export function FormularioColumnas({ hojas, campos, alEnviar }: { hojas: HojaMapeo[]; campos: { campo: string; nombre: string }[]; alEnviar: (mapeo: Record<string, Record<string, number | null>>) => void }) {
  const utiles = hojas.filter((h) => h.encabezados.length)
  const [valores, setValores] = useState(() =>
    Object.fromEntries(utiles.map((h) => [h.clave, Object.fromEntries(campos.map((c) => [c.campo, h.columnas[c.campo] ?? h.sugeridas?.[c.campo] ?? null]))])),
  )
  const [enviado, setEnviado] = useState(false)
  if (!utiles.length) return null
  const varias = new Set(hojas.map((h) => h.archivo)).size > 1
  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault()
        setEnviado(true)
        alEnviar(valores)
      }}
    >
      <div>
        <h3 className="text-lg font-bold">Indícanos qué columna es cuál</h3>
        <p className="text-[0.93rem] text-muted-foreground">Ya marcamos las que parecen correctas por su contenido: revísalas y confirma. Solo se hace una vez; la próxima vez este formato se lee solo.</p>
      </div>
      {utiles.map((h) => (
        <fieldset key={h.clave} className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <legend className="px-1 font-semibold">
            {h.hoja ? `Hoja "${h.hoja}"` : `Archivo "${h.archivo}"`}
            {h.hoja && varias ? ` de "${h.archivo}"` : ''}
            {h.filaEncabezados ? <span className="font-normal text-muted-foreground"> (títulos en la fila {h.filaEncabezados})</span> : null}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campos.map((c) => (
              <label key={c.campo} className="flex flex-col gap-1 text-sm font-semibold">
                {c.nombre}
                <select
                  className={cn(claseEntrada, 'text-[0.95rem]')}
                  value={valores[h.clave][c.campo] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [h.clave]: { ...v[h.clave], [c.campo]: e.target.value === '' ? null : Number(e.target.value) } }))}
                >
                  <option value="">No está en esta hoja</option>
                  {h.encabezados.map((x) => <option key={x.indice} value={x.indice}>{x.letra}{x.texto ? ` · ${x.texto}` : ''}</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Boton type="submit" variante="primario" className="self-start" disabled={enviado}>{enviado ? 'Leyendo…' : 'Leer de nuevo con estas columnas'}</Boton>
    </form>
  )
}

// --- Subir -----------------------------------------------------------------------------------

/**
 * base: "/pedidos/12/export" o "/inventario/export". alTerminar recibe el resultado bueno.
 */
export function SubirArchivos({ base, usuario, alGuardarSistema, alTerminar, textoBoton }: { base: string; usuario: Usuario | null; alGuardarSistema?: (u: Usuario) => void; alTerminar: (r: Resultado) => void; textoBoton?: ReactNode }) {
  const [sistema, setSistema] = useState<string | null>(usuario?.sistema ?? null)
  const [estado, setEstado] = useState<'listo' | 'leyendo'>('listo')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [encima, setEncima] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function procesar(promesa: Promise<Resultado>) {
    setEstado('leyendo')
    setError(null)
    setResultado(null)
    try {
      const r = await promesa
      if (r.ok) alTerminar(r)
      else setResultado(r)
    } catch (e) {
      setError(textoErrores(e))
    } finally {
      setEstado('listo')
    }
  }

  function subir(archivos: FileList | null) {
    if (!archivos || !archivos.length) return
    const lista = [...archivos].slice(0, 5)
    if (input.current) input.current.value = ''
    procesar((async () => {
      const fd = new FormData()
      for (const f of await Promise.all(lista.map(prepararArchivo))) fd.append('archivos', f)
      return api<Resultado>('POST', base, undefined, { formulario: fd })
    })())
  }

  async function cambiarSistema(v: string) {
    setSistema(v)
    try {
      const r = await api<{ usuario: Usuario }>('PUT', '/cuenta/datos', { sistema: v || null })
      alGuardarSistema?.(r.usuario)
    } catch {
      // si no se guarda, se vuelve a preguntar la próxima vez
    }
  }

  const exportId = resultado?.exportId
  return (
    <div className="flex flex-col gap-5">
      <SelectorSistema valor={sistema} onCambio={cambiarSistema} />
      <GuiaSistema id={sistema} />

      <label
        onDragOver={(e) => { e.preventDefault(); setEncima(true) }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); subir(e.dataTransfer.files) }}
        className={cn(
          'relative flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-150 focus-within:outline-3 focus-within:outline-ring',
          encima ? 'border-primary bg-secondary' : 'border-highlight bg-[#f2faf8] hover:border-primary hover:bg-secondary',
          estado === 'leyendo' && 'pointer-events-none opacity-70',
        )}
      >
        <Upload className="size-8 text-primary" />
        <strong className="text-[1.05rem]">{estado === 'leyendo' ? 'Leyendo tu archivo y calculando…' : textoBoton || 'Arrastra aquí tus archivos o haz clic para buscarlos'}</strong>
        <span className="text-[0.92rem] text-muted-foreground">Excel o CSV, uno o varios, tal como salen del programa. Nosotros encontramos las columnas.</span>
        <input ref={input} type="file" multiple accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.txt,.tsv,.prn,.xml,.htm,.html" className="sr-only" onChange={(e) => subir(e.target.files)} />
      </label>
      {sistema !== 'excel' && (
        <p className="text-[0.92rem] text-muted-foreground">
          ¿No puedes sacar esos informes? <a href="/plantillas/inventario.xlsx" download className="font-semibold text-primary hover:text-primary-hover">Descarga la plantilla</a>, llénala y súbela.
        </p>
      )}

      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}

      {resultado?.necesitaDocumentos && exportId && (
        <PreguntaDocumentos documentos={resultado.documentos || []} alEnviar={(docs) => procesar(api<Resultado>('POST', `${base}/${exportId}/documentos`, { documentos: docs }))} />
      )}
      {resultado?.necesitaPeriodo && exportId && (
        <PreguntaPeriodo sugerido={resultado.periodoSugerido} alEnviar={(desde, hasta) => procesar(api<Resultado>('POST', `${base}/${exportId}/periodo`, { desde, hasta }))} />
      )}
      {resultado && !resultado.necesitaDocumentos && !resultado.necesitaPeriodo && (
        <>
          <ErrorLista mensaje="No pudimos usar el archivo:" lista={resultado.errores} />
          {exportId && resultado.hojas && resultado.hojas.some((h) => h.encabezados.length) && (
            <FormularioColumnas hojas={resultado.hojas} campos={CAMPOS_EXPORT} alEnviar={(mapeo) => procesar(api<Resultado>('POST', `${base}/${exportId}/columnas`, { mapeo }))} />
          )}
        </>
      )}
    </div>
  )
}

// Lo que suele querer decir cada prefijo en los programas contables de Colombia. Cada empresa
// puede usarlos distinto: por eso se muestra como "suele ser" y el usuario decide.
const QUE_ES: Record<string, string> = {
  FV: 'factura de venta', FE: 'factura electrónica de venta', FED: 'factura electrónica de venta', FVE: 'factura electrónica de venta',
  POS: 'venta en caja', RM: 'remisión: salida de mercancía a un cliente', REM: 'remisión: salida de mercancía a un cliente',
  NC: 'nota crédito: devolución de un cliente', ND: 'nota débito', DV: 'devolución', FC: 'factura de compra',
  DS: 'documento soporte de una compra', CC: 'comprobante contable: ajuste de costo', RC: 'recibo de caja',
  CE: 'comprobante de egreso', EA: 'entrada de almacén', SA: 'salida de almacén', TR: 'traslado entre bodegas',
  AJ: 'ajuste de inventario', OC: 'orden de compra', '(vacío)': 'sin tipo de documento',
}

function PreguntaDocumentos({ documentos, alEnviar }: { documentos: NonNullable<Resultado['documentos']>; alEnviar: (d: string[]) => void }) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(documentos.filter((d) => d.sugerido).map((d) => d.prefijo)))
  const [falta, setFalta] = useState(false)
  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!elegidos.size) return setFalta(true)
    alEnviar([...elegidos])
  }
  return (
    <form onSubmit={enviar} className="aparecer flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-5">
      <p><strong>Tu archivo trae varios tipos de documento.</strong> Marca los que son ventas a tus clientes (dejamos marcados los que suelen serlo). Lo preguntamos una sola vez.</p>
      <ul className="flex flex-col gap-2">
        {[...documentos].sort((a, b) => Number(b.sugerido) - Number(a.sugerido) || b.filas - a.filas).map((d) => (
          <li key={d.prefijo}>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={elegidos.has(d.prefijo)}
                onChange={(e) => setElegidos((s) => { const n = new Set(s); if (e.target.checked) n.add(d.prefijo); else n.delete(d.prefijo); return n })}
              />
              <span>
                <strong>{d.prefijo}</strong>
                {QUE_ES[d.prefijo] && <span className="text-[0.93rem]"> · suele ser {QUE_ES[d.prefijo]}</span>}
                <span className="block text-sm text-muted-foreground">{plural(d.filas, 'fila', 'filas')}{d.ejemplo ? `, por ejemplo "${d.ejemplo}"` : ''}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {falta && <Aviso tono="error">Marca al menos uno.</Aviso>}
      <Boton type="submit" variante="primario" className="self-start">Usar solo estos</Boton>
    </form>
  )
}

function PreguntaPeriodo({ sugerido, alEnviar }: { sugerido?: { desde: string; hasta: string } | null; alEnviar: (desde: string, hasta: string) => void }) {
  const hoy = new Date()
  const iso = (x: Date) => x.toLocaleDateString('en-CA')
  const [desde, setDesde] = useState(sugerido?.desde || iso(new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate() + 1)))
  const [hasta, setHasta] = useState(sugerido?.hasta || iso(hoy))
  return (
    <form onSubmit={(e) => { e.preventDefault(); alEnviar(desde, hasta) }} className="aparecer flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-5">
      <p><strong>Tu archivo trae el total vendido de cada producto, pero no la fecha de cada venta.</strong> ¿De qué fecha a qué fecha son esas ventas? Es el rango que elegiste al sacar el informe.{sugerido ? ' Lo tomamos del título de tu informe: revísalo.' : ''}</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">Desde<input type="date" required className={claseEntrada} value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Hasta<input type="date" required className={claseEntrada} value={hasta} max={iso(hoy)} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>
      <Boton type="submit" variante="primario" className="self-start">Calcular con este periodo</Boton>
    </form>
  )
}
