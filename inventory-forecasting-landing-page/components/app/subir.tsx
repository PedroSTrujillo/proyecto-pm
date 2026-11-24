'use client'

// Subir el export de ventas y existencias, con las preguntas que el lector puede necesitar:
// qué columna es cuál, qué documentos son ventas, qué ventas son de proyecto y de qué periodo son
// unas ventas sin fecha.
// Lo usan "Datos" y el paso 2 de un pedido.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, prepararArchivo, textoErrores } from '@/lib/api'
import { numero, plural } from '@/lib/formato'
import { GENERICA, SISTEMAS, sistemaPorId } from '@/lib/sistemas'
import type { RevisionCodigos, Usuario } from '@/lib/tipos'
import { Aviso, Boton, Desplegable, ErrorLista, claseEntrada } from './ui'

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
  documentos?: { prefijo: string; filas: number; ejemplo: string; sugerido: boolean; devolucion?: boolean }[]
  necesitaCanal?: boolean
  canal?: { columna: string; valores: { valor: string; filas: number; ejemplo: string }[] }
  resumen?: { productos: number; seAgotan: number; sobran: number }
  codigos?: RevisionCodigos
}

export const CAMPOS_EXPORT = [
  { campo: 'codigo', nombre: 'Código de producto' },
  { campo: 'nombre', nombre: 'Nombre (opcional)' },
  { campo: 'fecha', nombre: 'Fecha de la venta' },
  { campo: 'cantidad', nombre: 'Cantidad vendida' },
  { campo: 'existencias', nombre: 'Existencias' },
  { campo: 'entrada', nombre: 'Cantidad que entró (opcional, para devoluciones)' },
  { campo: 'documento', nombre: 'Tipo de documento (opcional)' },
  { campo: 'costo', nombre: 'Costo unitario (opcional)' },
  { campo: 'proveedor', nombre: 'Proveedor (opcional)' },
  { campo: 'familia', nombre: 'Familia o línea (opcional)' },
  { campo: 'canal', nombre: 'Centro de costo, proyecto o cliente (opcional)' },
]

// --- Guía por programa -----------------------------------------------------------------------

export function GuiaSistema({ id }: { id: string | null }) {
  const s = sistemaPorId(id)
  if (!s) return null
  if (s.plantilla) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-cuerpo">
          <li>Descargue la plantilla.</li>
          <li>En la hoja &quot;Productos&quot;, escriba una fila por producto: lo que tiene hoy y lo que vendió cada mes. Proveedor y costo son opcionales.</li>
          <li>Guárdela y súbala aquí abajo.</li>
        </ol>
        <a href="/plantillas/inventario.xlsx" download className="presionable inline-flex min-h-10 items-center gap-2 self-start rounded-xl border border-primary bg-primary px-4 text-cuerpo font-semibold text-primary-foreground hover:bg-primary-hover">
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
            <h3 className="flex flex-wrap items-center gap-2 text-cuerpo font-bold text-secondary-foreground">
              Lo más rápido: un solo informe
              <span className="rounded-full bg-card px-2 py-0.5 text-nota font-semibold">1 archivo</span>
            </h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-chico">{s.unInforme.map((p) => <li key={p}>{p}</li>)}</ol>
            {s.unInformeNota && <p className="text-sm text-muted-foreground">{s.unInformeNota}</p>}
          </div>
          {(s.ventas || s.existencias) && (
            <Desplegable className="text-chico" titulo={s.dosInformesTitulo || 'Con dos informes también se ve la venta de cada semana y la temporada'}>
              {dosInformes}
            </Desplegable>
          )}
        </>
      ) : dosInformes}
      <p className="text-sm text-muted-foreground">
        Súbalos tal como salen, con títulos y totales. Si el informe mezcla compras y ventas o no trae fechas, le preguntamos.
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
      <h3 className="text-cuerpo font-bold">{titulo}</h3>
      <ol className="list-decimal space-y-1.5 pl-5 text-chico">{pasos.map((p) => <li key={p}>{p}</li>)}</ol>
      {nota && <p className="text-sm text-muted-foreground">{nota}</p>}
    </div>
  )
}

export function SelectorSistema({ valor, onCambio }: { valor: string | null; onCambio: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 font-semibold">
      ¿Dónde lleva su inventario?
      <select className={cn(claseEntrada, 'font-semibold')} value={valor || ''} onChange={(e) => onCambio(e.target.value)}>
        <option value="">Elija una opción</option>
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
        <h3 className="text-lg font-bold">Indíquenos qué columna es cuál</h3>
        <p className="text-chico text-muted-foreground">Marcamos las que parecen correctas. Revíselas y confirme; la próxima vez este formato se lee solo.</p>
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
                  className={cn(claseEntrada, 'text-cuerpo')}
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
// Solo el equipo: ensayar con el archivo de un negocio de ejemplo, sin tener que descargarlo.
function EnsayoEquipo({ alSubir }: { alSubir: (f: File) => void }) {
  const [negocios, setNegocios] = useState<{ id: string; empresa: string; sector: string }[]>([])
  const [elegido, setElegido] = useState('')
  const [trayendo, setTrayendo] = useState(false)
  useEffect(() => {
    api<{ negocios: { id: string; empresa: string; sector: string }[] }>('GET', '/equipo/ejemplos').then((r) => setNegocios(r.negocios)).catch(() => {})
  }, [])
  if (!negocios.length) return null
  async function usar() {
    if (!elegido) return
    setTrayendo(true)
    try {
      const r = await fetch(`/api/equipo/ejemplos/negocios/${elegido}/archivo`)
      const nombre = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'ejemplo.xlsx'
      alSubir(new File([await r.blob()], nombre))
    } finally {
      setTrayendo(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-chico">
      <span className="font-semibold">Solo equipo · ensayar con un negocio de ejemplo:</span>
      <select className={cn(claseEntrada, 'h-10 w-auto min-w-56')} value={elegido} onChange={(e) => setElegido(e.target.value)} aria-label="Negocio de ejemplo">
        <option value="">Elija un negocio</option>
        {negocios.map((n) => <option key={n.id} value={n.id}>{n.empresa} · {n.sector}</option>)}
      </select>
      <Boton tamano="chico" onClick={usar} disabled={!elegido || trayendo}>{trayendo ? 'Trayendo…' : 'Usar su archivo'}</Boton>
    </div>
  )
}

export function SubirArchivos({ base, usuario, alGuardarSistema, alTerminar, textoBoton }: { base: string; usuario: Usuario | null; alGuardarSistema?: (u: Usuario) => void; alTerminar: (r: Resultado) => void; textoBoton?: ReactNode }) {
  const [sistema, setSistema] = useState<string | null>(usuario?.sistema ?? null)
  const [estado, setEstado] = useState<'listo' | 'leyendo'>('listo')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [encima, setEncima] = useState(false)
  // Casi ningún código de las ventas está en las existencias: antes de seguir se muestra cuáles.
  const [revisar, setRevisar] = useState<Resultado | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const respuesta = useRef<HTMLDivElement>(null)
  // Lo que responde el archivo (columnas, documentos, errores) queda debajo de la guía: se lleva
  // a la vista para que no parezca que no pasó nada.
  useEffect(() => {
    if (resultado || error) respuesta.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [resultado, error])

  async function procesar(promesa: Promise<Resultado>) {
    setEstado('leyendo')
    setError(null)
    setResultado(null)
    setRevisar(null)
    try {
      const r = await promesa
      if (r.ok && r.codigos?.alerta) setRevisar(r)
      else if (r.ok) alTerminar(r)
      else setResultado(r)
    } catch (e) {
      setError(textoErrores(e))
    } finally {
      setEstado('listo')
    }
  }

  function subir(archivos: FileList | File[] | null) {
    if (!archivos || !archivos.length) return
    const lista = [...archivos].slice(0, 24) // lo mismo que acepta el servidor
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
        <strong className="text-[1.05rem]">{estado === 'leyendo' ? 'Leyendo su archivo y calculando…' : textoBoton || 'Arrastre aquí sus archivos o haga clic para buscarlos'}</strong>
        <span className="text-chico text-muted-foreground">Excel o CSV, uno o varios, tal como salen del programa. Nosotros encontramos las columnas.</span>
        <input ref={input} type="file" multiple accept=".xlsx,.xls,.xlsm,.xlsb,.ods,.csv,.txt,.tsv,.prn,.xml,.htm,.html" className="sr-only" onChange={(e) => subir(e.target.files)} />
      </label>
      {sistema !== 'excel' && (
        <p className="text-chico text-muted-foreground">
          ¿No puede sacar esos informes? <a href="/plantillas/inventario.xlsx" download className="font-semibold text-primary hover:text-primary-hover">Descargue la plantilla</a>, llénela y súbala.
        </p>
      )}
      {usuario?.rol === 'equipo' && <EnsayoEquipo alSubir={(f) => subir([f])} />}

      <div ref={respuesta} className="scroll-mt-6" />
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      {revisar?.codigos && (
        <div className="aparecer flex flex-col gap-3">
          <Aviso tono="error" titulo={`Solo ${numero(revisar.codigos.coinciden)} de ${numero(revisar.codigos.ventas)} códigos de las ventas están en las existencias`}>
            Casi siempre es porque los dos informes escriben el código distinto (con guiones, ceros o un sufijo). Así, esos productos salen con 0 existencias y se sugiere pedirlos de más. Lo mejor es sacar los dos informes con el mismo código y subirlos otra vez.
          </Aviso>
          <CodigosQueNoCoinciden codigos={revisar.codigos} abierto />
          <Boton className="self-start" onClick={() => { const r = revisar; setRevisar(null); alTerminar(r) }}>Seguir con estos datos</Boton>
        </div>
      )}

      {resultado?.necesitaDocumentos && exportId && (
        <>
          <ColumnasLeidas hojas={resultado.hojas || []} alCambiar={(mapeo) => procesar(api<Resultado>('POST', `${base}/${exportId}/columnas`, { mapeo }))} />
          <PreguntaDocumentos documentos={resultado.documentos || []} alEnviar={(ventas, devoluciones, proyectos) => procesar(api<Resultado>('POST', `${base}/${exportId}/documentos`, { documentos: ventas, devoluciones, proyectos }))} />
        </>
      )}
      {resultado?.necesitaCanal && exportId && resultado.canal && (
        <PreguntaCanal canal={resultado.canal} alEnviar={(proyectos) => procesar(api<Resultado>('POST', `${base}/${exportId}/canales`, { proyectos }))} />
      )}
      {resultado?.necesitaPeriodo && exportId && (
        <PreguntaPeriodo sugerido={resultado.periodoSugerido} alEnviar={(desde, hasta) => procesar(api<Resultado>('POST', `${base}/${exportId}/periodo`, { desde, hasta }))} />
      )}
      {resultado && !resultado.necesitaDocumentos && !resultado.necesitaPeriodo && !resultado.necesitaCanal && (
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

// Los códigos que están en un informe y no en el otro, las parejas probables (el mismo código escrito
// distinto) y la lista para descargar y corregir en el programa contable.
export function CodigosQueNoCoinciden({ codigos, abierto = false }: { codigos: RevisionCodigos; abierto?: boolean }) {
  function descargarLista() {
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const filas = [
      ['Dónde está', 'Código', 'Nombre', 'Cantidad', 'Quizá es el mismo que'],
      ...codigos.soloVentas.map((f) => ['Solo en ventas', f.codigo, f.nombre, f.vendido, codigos.parejas.find((p) => p.ventas === f.codigo)?.existencias ?? '']),
      ...codigos.soloExistencias.map((f) => ['Solo en existencias', f.codigo, f.nombre, f.existencias, codigos.parejas.find((p) => p.existencias === f.codigo)?.ventas ?? '']),
    ]
    // Con punto y coma y BOM: así lo abre bien Excel en español.
    const csv = '\ufeff' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'codigos-que-no-coinciden.csv'
    a.click()
    URL.revokeObjectURL(url)
  }
  const lista = (titulo: string, filas: { codigo: string; nombre: string }[], total: number) => (
    <div className="min-w-0">
      <h4 className="font-semibold">{titulo} <span className="font-normal text-muted-foreground">({numero(total)})</span></h4>
      <ul className="mt-1 max-h-48 overflow-y-auto text-chico" data-privado>
        {filas.slice(0, 50).map((f) => <li key={f.codigo}><strong>{f.codigo}</strong> <span className="text-muted-foreground">{f.nombre}</span></li>)}
        {total > 50 && <li className="text-muted-foreground">y {numero(total - 50)} más en la lista para descargar</li>}
      </ul>
    </div>
  )
  return (
    <Desplegable abierto={abierto} tono={codigos.alerta ? 'ambar' : 'normal'} titulo={`Códigos que no coinciden: ${plural(codigos.totalSoloVentas, 'producto vendido no aparece', 'productos vendidos no aparecen')} en las existencias`}>
      <div className="flex flex-col gap-4 pt-1">
        {codigos.parejas.length > 0 && (
          <div>
            <h4 className="font-semibold">Parecen el mismo producto escrito distinto</h4>
            <ul className="mt-1 text-chico" data-privado>
              {codigos.parejas.slice(0, 20).map((p) => <li key={p.ventas}><strong>{p.ventas}</strong> en ventas y <strong>{p.existencias}</strong> en existencias{p.nombre ? ` · ${p.nombre}` : ''}</li>)}
            </ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {lista('Solo en las ventas', codigos.soloVentas, codigos.totalSoloVentas)}
          {lista('Solo en las existencias', codigos.soloExistencias, codigos.totalSoloExistencias)}
        </div>
        <Boton tamano="chico" className="self-start" onClick={descargarLista}><Download /> Descargar la lista</Boton>
      </div>
    </Desplegable>
  )
}

// Antes de preguntar por los documentos, se muestra qué columna se tomó para cada cosa: en un
// kardex la de unidades vendidas es la de salidas, que también trae traslados y ajustes; por eso
// se pregunta qué documentos son ventas. Si una columna no es la que se cree, se elige a mano.
const LEIDAS: { campo: string; nombre: string }[] = [
  { campo: 'codigo', nombre: 'Código' },
  { campo: 'fecha', nombre: 'Fecha' },
  { campo: 'cantidad', nombre: 'Unidades vendidas' },
  { campo: 'existencias', nombre: 'Existencias' },
  { campo: 'entrada', nombre: 'Unidades que entraron' },
  { campo: 'documento', nombre: 'Tipo de documento' },
]

function ColumnasLeidas({ hojas, alCambiar }: { hojas: HojaMapeo[]; alCambiar: (mapeo: Record<string, Record<string, number | null>>) => void }) {
  const [elegir, setElegir] = useState(false)
  const hoja = hojas.find((h) => h.columnas.documento !== null && h.columnas.documento !== undefined) || hojas[0]
  if (!hoja) return null
  const nombreDe = (i: number | null | undefined) => {
    if (i === null || i === undefined) return null
    const e = hoja.encabezados.find((x) => x.indice === i)
    if (!e) return null
    // En los informes de impresora (Helisa) el título queda corrido: se muestra el más cercano.
    const titulo = e.texto || hoja.encabezados.filter((x) => x.texto && Math.abs(x.indice - i) <= 4).sort((a, b) => Math.abs(a.indice - i) - Math.abs(b.indice - i))[0]?.texto
    return titulo ? `"${titulo}" (columna ${e.letra})` : `columna ${e.letra}`
  }
  const filas = LEIDAS.map((l) => ({ ...l, columna: nombreDe(hoja.columnas[l.campo]) })).filter((l) => l.columna)
  const salidas = nombreDe(hoja.columnas.cantidad)
  return (
    <div className="aparecer flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <p><strong>Así leímos su archivo</strong>{hojas.length > 1 ? ' (la hoja de ventas)' : ''}:</p>
      <dl className="grid gap-x-6 gap-y-1 text-cuerpo sm:grid-cols-[auto_1fr]">
        {filas.map((l) => (
          <div key={l.campo} className="contents">
            <dt className="text-muted-foreground">{l.nombre}</dt>
            <dd className="font-semibold">{l.columna}</dd>
          </div>
        ))}
      </dl>
      {salidas && (
        <p className="text-chico text-muted-foreground">
          La columna {salidas} trae todo lo que salió de su bodega: ventas, pero también traslados y ajustes. Por eso abajo le preguntamos qué documentos son ventas.
        </p>
      )}
      {!elegir ? (
        <button type="button" onClick={() => setElegir(true)} className="self-start text-chico font-semibold text-primary hover:text-primary-hover">
          ¿Alguna columna no es esa? Elíjalas a mano
        </button>
      ) : (
        <FormularioColumnas hojas={hojas} campos={CAMPOS_EXPORT} alEnviar={alCambiar} />
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
  AJ: 'ajuste de inventario', OC: 'orden de compra', NT: 'traslado entre bodegas',
  FCA: 'factura de venta (Helisa)', DFCA: 'devolución de una factura', EMC: 'entrada de mercancía (compra)', DSE: 'documento soporte de una compra', '(vacío)': 'sin tipo de documento',
}

type Uso = 'venta' | 'devolucion' | 'proyecto' | 'nada'
const USOS: { valor: Uso; texto: string }[] = [
  { valor: 'venta', texto: 'Venta' },
  { valor: 'devolucion', texto: 'Devolución' },
  { valor: 'proyecto', texto: 'De proyecto' },
  { valor: 'nada', texto: 'No cuenta' },
]

// Cada tipo de documento es una venta, una devolución de un cliente (se resta), una venta de
// proyecto (baja existencias, no cuenta en el promedio) o no cuenta.
function PreguntaDocumentos({ documentos, alEnviar }: { documentos: NonNullable<Resultado['documentos']>; alEnviar: (ventas: string[], devoluciones: string[], proyectos: string[]) => void }) {
  const [usos, setUsos] = useState<Record<string, Uso>>(() =>
    Object.fromEntries(documentos.map((d) => [d.prefijo, d.sugerido ? 'venta' : d.devolucion ? 'devolucion' : 'nada'])),
  )
  const [falta, setFalta] = useState(false)
  const con = (u: Uso) => Object.keys(usos).filter((k) => usos[k] === u)
  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!con('venta').length) return setFalta(true)
    alEnviar(con('venta'), con('devolucion'), con('proyecto'))
  }
  const orden = (d: NonNullable<Resultado['documentos']>[number]) => (d.sugerido ? 0 : d.devolucion ? 1 : 2)
  return (
    <form onSubmit={enviar} className="aparecer flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-5">
      <p>
        <strong>Su archivo trae varios tipos de documento.</strong> Díganos cuáles son ventas a sus clientes y cuáles devoluciones
        de clientes: las devoluciones se restan de lo vendido. Si un tipo es de ventas para proyectos u obras, márquelo «De proyecto»:
        baja las existencias, pero no cuenta en el promedio. Dejamos marcado lo que suele ser cada uno. Lo preguntamos una sola vez.
      </p>
      <ul className="flex flex-col divide-y divide-[#cfe5e1]">
        {[...documentos].sort((a, b) => orden(a) - orden(b) || b.filas - a.filas).map((d) => (
          <li key={d.prefijo} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong>{d.prefijo}</strong>
              {QUE_ES[d.prefijo] && <span className="text-chico"> · suele ser {QUE_ES[d.prefijo]}</span>}
              <span className="block text-sm text-muted-foreground">{plural(d.filas, 'fila', 'filas')}{d.ejemplo ? `, por ejemplo "${d.ejemplo}"` : ''}</span>
            </span>
            <span role="radiogroup" aria-label={`Qué es ${d.prefijo}`} className="inline-flex shrink-0 self-start rounded-lg border border-border bg-card p-0.5 sm:self-auto">
              {USOS.map((u) => (
                <button
                  key={u.valor}
                  type="button"
                  role="radio"
                  aria-checked={usos[d.prefijo] === u.valor}
                  onClick={() => { setUsos((x) => ({ ...x, [d.prefijo]: u.valor })); setFalta(false) }}
                  className={cn(
                    'presionable rounded-md px-3 py-1.5 text-sm font-semibold',
                    usos[d.prefijo] === u.valor ? (u.valor === 'devolucion' ? 'bg-ambar-fondo text-ambar' : u.valor === 'venta' ? 'bg-primary text-primary-foreground' : u.valor === 'proyecto' ? 'bg-azul-fondo text-azul-texto' : 'bg-muted text-foreground') : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {u.texto}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {falta && <Aviso tono="error">Marque al menos un tipo como venta.</Aviso>}
      <Boton type="submit" variante="primario" className="self-start">Continuar</Boton>
    </form>
  )
}

// Una columna dice de dónde vino cada venta (centro de costo, OT, proyecto o cliente) y trae pocos
// valores: se marcan los que son proyectos. Puede no ser ninguno.
function PreguntaCanal({ canal, alEnviar }: { canal: NonNullable<Resultado['canal']>; alEnviar: (proyectos: string[]) => void }) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(canal.valores.filter((v) => /PROYECTO|OBRA|\bOT\b|LICITACI/.test(v.valor)).map((v) => v.valor)))
  const cambiar = (v: string, si: boolean) => setMarcados((m) => { const s = new Set(m); if (si) s.add(v); else s.delete(v); return s })
  return (
    <form onSubmit={(e) => { e.preventDefault(); alEnviar([...marcados]) }} className="aparecer flex flex-col gap-3 rounded-2xl border border-[#cfe5e1] bg-secondary p-5">
      <p>
        <strong>La {canal.columna} dice de dónde vino cada venta.</strong> Marque las que son proyectos u obras que no se repiten:
        bajan las existencias, pero no cuentan para el promedio de venta ni para lo sugerido. Si no hay proyectos, deje todo sin marcar. Lo preguntamos una sola vez.
      </p>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {canal.valores.map((v) => (
          <li key={v.valor}>
            <label className="flex items-start gap-2.5 py-1.5">
              <input type="checkbox" checked={marcados.has(v.valor)} onChange={(e) => cambiar(v.valor, e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
              <span>{v.ejemplo || v.valor}<span className="block text-sm text-muted-foreground">{plural(v.filas, 'fila', 'filas')}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <Boton type="submit" variante="primario" className="self-start">{marcados.size ? `Continuar: ${plural(marcados.size, 'es de proyecto', 'son de proyecto')}` : 'Continuar: ninguna es de proyecto'}</Boton>
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
      <p><strong>Su archivo trae el total vendido de cada producto, pero no la fecha de cada venta.</strong> ¿De qué fecha a qué fecha son esas ventas? Es el rango que eligió al sacar el informe.{sugerido ? ' Lo tomamos del título de su informe: revíselo.' : ''}</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">Desde<input type="date" required className={claseEntrada} value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Hasta<input type="date" required className={claseEntrada} value={hasta} max={iso(hoy)} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>
      <Boton type="submit" variante="primario" className="self-start">Calcular con este periodo</Boton>
    </form>
  )
}
