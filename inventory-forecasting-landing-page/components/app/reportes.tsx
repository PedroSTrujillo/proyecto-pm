'use client'

// Reportes por rango de fechas (T8 de docs/PLAN_CAMBIOS_SINESC.md): una tarjeta por reporte, con su
// periodo al lado y dos botones, "Ver" (una tabla debajo) y "Descargar" (Excel). El servidor arma
// todo (server/reportes.js); aquí solo se piden y se dibujan. Solo informan: no cambian nada.

import { useState } from 'react'
import { Download, Eye, EyeOff } from 'lucide-react'
import { api, textoErrores } from '@/lib/api'
import { bajar } from '@/lib/descargar'
import { numero, plata, sumarDias } from '@/lib/formato'
import { Boton, Campo, ErrorLista, Pildoras, Tarjeta, Titulo, claseEntrada } from './ui'

type Reporte = { titulo: string; subtitulo: string; columnas: string[]; formatos: string[]; filas: (string | number)[][] }
type Periodo = '7' | '30' | '90' | 'fechas'

const REPORTES = [
  { id: 'mas-vendidos', titulo: 'Productos más vendidos', sub: 'Los 50 que más salieron en esas fechas, con lo que hay y lo que ya se pidió.' },
  { id: 'menos-vendidos', titulo: 'Productos menos vendidos', sub: 'Los 50 que menos salieron, empezando por los que no vendieron nada.' },
  { id: 'proyectos', titulo: 'Ventas de proyectos', sub: 'Lo que se vendió a clientes por proyecto, de más a menos.' },
  { id: 'venta-unica', titulo: 'Productos de venta única', sub: 'Los que se vendieron de una sola vez y no volvieron a salir.' },
  { id: 'pedidos', titulo: 'Pedidos', sub: 'Los pedidos cerrados en esas fechas, un producto por fila.' },
]

// shortcut: en pantalla van las primeras 300 filas; el Excel trae todas. Paginar si lo piden.
const MAX_FILAS = 300

function celda(v: string | number, formato: string) {
  if (typeof v !== 'number') return v
  return formato === 'plata' ? plata(v) : numero(v, 2)
}

function TarjetaReporte({ id, titulo, sub, hoy }: { id: string; titulo: string; sub: string; hoy: string }) {
  const [periodo, setPeriodo] = useState<Periodo>('30')
  const [desde, setDesde] = useState(() => sumarDias(hoy, -29))
  const [hasta, setHasta] = useState(hoy)
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const rango = periodo === 'fechas' ? { desde, hasta } : { desde: sumarDias(hoy, 1 - Number(periodo)), hasta: hoy }
  const malo = !rango.desde || !rango.hasta || rango.desde > rango.hasta
  const consulta = `desde=${rango.desde}&hasta=${rango.hasta}`

  async function hacer(accion: () => Promise<void>) {
    setOcupado(true)
    setError(null)
    try { await accion() } catch (e) { setError(textoErrores(e)) } finally { setOcupado(false) }
  }
  // Al cambiar el periodo se quita la tabla: no se deja a la vista una con otras fechas.
  const cambiar = (poner: () => void) => { poner(); setReporte(null); setError(null) }

  return (
    <Tarjeta className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-bold">{titulo}</h2>
        <p className="text-muted-foreground">{sub}</p>
      </div>
      <Pildoras
        etiqueta={`Periodo de ${titulo}`}
        valor={periodo}
        onCambio={(p) => cambiar(() => setPeriodo(p))}
        opciones={[{ id: '7', texto: 'Últimos 7 días' }, { id: '30', texto: '30 días' }, { id: '90', texto: '3 meses' }, { id: 'fechas', texto: 'Entre fechas' }]}
      />
      {periodo === 'fechas' && (
        <div className="grid max-w-lg gap-3 sm:grid-cols-2">
          <Campo etiqueta="Desde"><input type="date" className={claseEntrada} value={desde} max={hasta || hoy} onChange={(e) => cambiar(() => setDesde(e.target.value))} /></Campo>
          <Campo etiqueta="Hasta"><input type="date" className={claseEntrada} value={hasta} max={hoy} onChange={(e) => cambiar(() => setHasta(e.target.value))} /></Campo>
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        <Boton variante={reporte ? 'secundario' : 'primario'} aria-pressed={Boolean(reporte)} disabled={ocupado || (!reporte && malo)} onClick={() => (reporte ? setReporte(null) : hacer(async () => setReporte(await api<Reporte>('GET', `/reportes/${id}?${consulta}`))))}>{reporte ? <><EyeOff /> Ocultar</> : <><Eye /> Ver</>}</Boton>
        <Boton disabled={ocupado || malo} onClick={() => hacer(() => bajar(`/reportes/${id}.xlsx?${consulta}`, `${id}.xlsx`))}><Download /> Descargar</Boton>
      </div>
      {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
      {reporte && (
        <div className="aparecer flex flex-col gap-2">
          <p className="text-nota text-muted-foreground">{reporte.subtitulo}</p>
          {reporte.filas.length === 0 ? <p className="text-muted-foreground">No hay nada en esas fechas.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate border-spacing-0 text-cuerpo" data-privado>
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    {reporte.columnas.map((c, i) => <th key={c} scope="col" className={`border-b border-border px-2 py-2 font-semibold${reporte.formatos[i] ? ' text-right' : ''}`}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {reporte.filas.slice(0, MAX_FILAS).map((f, k) => (
                    <tr key={k}>
                      {f.map((v, i) => <td key={i} className={`border-b border-[#f0f1ee] px-2 py-2.5${reporte.formatos[i] ? ' text-right tabular-nums' : ''}`}>{celda(v, reporte.formatos[i])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {reporte.filas.length > MAX_FILAS && <p className="text-nota text-muted-foreground">Se muestran las primeras {MAX_FILAS}; el Excel trae todas.</p>}
        </div>
      )}
    </Tarjeta>
  )
}

export function Reportes() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return (
    <>
      <Titulo sub="Elija el reporte y las fechas, véalo aquí o descárguelo en Excel. Los reportes solo informan: no cambian las existencias ni los pedidos.">Reportes</Titulo>
      {REPORTES.map((r) => <TarjetaReporte key={r.id} {...r} hoy={hoy} />)}
    </>
  )
}
