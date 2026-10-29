'use client'

// Lo que la empresa escribe en su catálogo y cambia el sugerido (SP4 de docs/PLAN_ALPHA_02.md):
// familia, múltiplo de empaque y mínimo de pedido, uno por uno en la ficha o pegados desde Excel.
// Y "Cómo se calcula": el sugerido explicado en orden con los números del propio producto.

import { useEffect, useState, type ReactNode } from 'react'
import { api, textoErrores } from '@/lib/api'
import { cn } from '@/lib/utils'
import { alcance, duracion, numero, plural, ventasSemana } from '@/lib/formato'
import type { Inventario, Producto } from '@/lib/tipos'
import { useInventario } from './contexto'
import { Aviso, Boton, Campo, Desplegable, ErrorLista, claseEntrada } from './ui'

type FilaLote = { codigo: string; familia?: string; multiplo?: string; minimo?: string }

// --- Uno por uno, en la ficha ----------------------------------------------------------------

export function EditarCatalogo({ p }: { p: Producto }) {
  const { recargar } = useInventario()
  const inicial = () => ({ familia: p.familia || '', multiplo: p.multiplo ? String(p.multiplo) : '', minimo: p.minimoPedido ? String(p.minimoPedido) : '' })
  const [abierto, setAbierto] = useState(false)
  const [v, setV] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAbierto(false)
    setV(inicial())
    setError(null)
  }, [p.codigo, p.familia, p.multiplo, p.minimoPedido]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      await api('POST', '/catalogo/lote', { filas: [{ codigo: p.codigo, ...v }] })
      setAbierto(false)
      recargar()
    } catch (e) {
      const t = textoErrores(e)
      setError(t.lista[0] || t.mensaje)
    } finally {
      setGuardando(false)
    }
  }

  const resumen = [p.familia && `Familia: ${p.familia}`, p.multiplo && `se pide en cajas de ${numero(p.multiplo, 2)}`, p.minimoPedido && `mínimo de pedido ${numero(p.minimoPedido, 2)}`].filter(Boolean).join(' · ')
  if (!abierto) {
    return (
      <p className="-mt-2 text-chico text-muted-foreground">
        {resumen ? `${resumen}.` : 'Sin familia, caja ni mínimo de pedido.'}{' '}
        <button type="button" className="font-semibold text-primary hover:text-primary-hover" onClick={() => setAbierto(true)}>{resumen ? 'Cambiar' : 'Escribirlos'}</button>
      </p>
    )
  }
  return (
    <form className="aparecer flex flex-col gap-3 rounded-xl border border-border p-3" onSubmit={(e) => { e.preventDefault(); guardar() }}>
      <Campo etiqueta="Familia o línea" nota="(opcional)">
        <input className={claseEntrada} value={v.familia} onChange={(e) => setV({ ...v, familia: e.target.value })} placeholder="Ej.: Tornillería" maxLength={80} autoFocus />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Se pide en cajas de">
          <input className={claseEntrada} inputMode="decimal" value={v.multiplo} onChange={(e) => setV({ ...v, multiplo: e.target.value })} placeholder="Ej.: 80" />
        </Campo>
        <Campo etiqueta="Mínimo de pedido">
          <input className={claseEntrada} inputMode="decimal" value={v.minimo} onChange={(e) => setV({ ...v, minimo: e.target.value })} placeholder="Ej.: 200" />
        </Campo>
      </div>
      <p className="text-nota text-muted-foreground">Lo sugerido se redondea hacia arriba a cajas completas y, si queda por debajo del mínimo, pasa al mínimo. Vacío: no aplica.</p>
      {error && <p className="text-sm text-rojo-texto">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="chico" variante="primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        <Boton tamano="chico" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
    </form>
  )
}

// --- Varios a la vez, pegados desde Excel ------------------------------------------------------

// Cada fila: código, familia, caja y mínimo, separados por tabulador (Excel) o punto y coma. Una
// celda vacía borra ese dato; una fila con solo el código no cambia nada.
function leerPegado(texto: string): FilaLote[] {
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const [codigo = '', familia, multiplo, minimo] = l.split(/\t|;/).map((x) => x.trim())
      return { codigo, ...(familia !== undefined ? { familia } : {}), ...(multiplo !== undefined ? { multiplo } : {}), ...(minimo !== undefined ? { minimo } : {}) }
    })
    // Una fila de títulos copiada con los datos.
    .filter((f, i) => !(i === 0 && /c[oó]digo|referencia|sku/i.test(f.codigo)))
}

export function CatalogoEnLote() {
  const { recargar } = useInventario()
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<ReturnType<typeof textoErrores> | null>(null)
  const [listo, setListo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const filas = leerPegado(texto)

  async function guardar() {
    setGuardando(true)
    setError(null)
    setListo(null)
    try {
      const r = await api<{ guardados: number }>('POST', '/catalogo/lote', { filas })
      setListo(`Listo: ${plural(r.guardados, 'producto actualizado', 'productos actualizados')}. Lo sugerido ya los tiene en cuenta.`)
      setTexto('')
      recargar()
    } catch (e) {
      setError(textoErrores(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Desplegable titulo="Familia, caja y mínimo de pedido de muchos productos a la vez">
      <div className="flex flex-col gap-3">
        <p className="text-chico text-muted-foreground">
          Copie cuatro columnas de Excel en este orden: código, familia, cajas de (múltiplo de empaque) y mínimo de pedido, y péguelas aquí. Una celda vacía borra ese dato.
        </p>
        <textarea className={cn(claseEntrada, 'min-h-32 py-2 font-mono text-sm')} value={texto} onChange={(e) => { setTexto(e.target.value); setListo(null) }} placeholder={'TOR-0610\tTornillería\t100\t\nCIN-0048\tCintas\t12\t48'} spellCheck={false} aria-label="Código, familia, cajas de y mínimo, una fila por producto" />
        {filas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-chico">
              <thead>
                <tr className="text-left text-nota text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-1.5 font-semibold">Código</th>
                  <th scope="col" className="border-b border-border px-2 py-1.5 font-semibold">Familia</th>
                  <th scope="col" className="border-b border-border px-2 py-1.5 text-right font-semibold">Cajas de</th>
                  <th scope="col" className="border-b border-border px-2 py-1.5 text-right font-semibold">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 5).map((f, i) => (
                  <tr key={i}>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5 font-semibold">{f.codigo}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5">{f.familia ?? <span className="text-muted-foreground">sin cambio</span>}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5 text-right tabular-nums">{f.multiplo ?? <span className="text-muted-foreground">sin cambio</span>}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5 text-right tabular-nums">{f.minimo ?? <span className="text-muted-foreground">sin cambio</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length > 5 && <p className="px-2 pt-1.5 text-nota text-muted-foreground">Y {plural(filas.length - 5, 'fila más', 'filas más')}.</p>}
          </div>
        )}
        {error && <ErrorLista mensaje={error.mensaje} lista={error.lista} />}
        {listo && <Aviso tono="ok">{listo}</Aviso>}
        <Boton variante="primario" className="self-start" disabled={guardando || !filas.length} onClick={guardar}>
          {guardando ? 'Guardando…' : filas.length ? `Guardar ${plural(filas.length, 'producto', 'productos')}` : 'Guardar'}
        </Boton>
        <p className="text-nota text-muted-foreground">Si una fila tiene un error, no se guarda ninguna: corríjala y guarde de nuevo.</p>
      </div>
    </Desplegable>
  )
}

// --- Cómo se calcula ---------------------------------------------------------------------------

// Con un decimal solo lo pequeño: "1,4 unidades" sí, "625,6 unidades" no.
const n1 = (x: number | null | undefined) => (Math.abs(x ?? 0) < 10 ? numero(x ?? 0, 1) : numero(Math.round(x ?? 0)))

// El sugerido de un producto, en el orden en que se calcula y con sus propios números (pedido de
// Jose en las pruebas: que se entienda de dónde sale cada cifra).
export function ComoSeCalcula({ p, inv, titulo = 'Cómo se calcula', children }: { p: Producto; inv: Inventario; titulo?: string; children?: ReactNode }) {
  const x = p.explicacion
  const d = p.detalleSugerido
  const totales = inv.fuente.totales
  const conDoble = !totales && x.vendidoReciente > 0 && x.semanasRecientes > 0
  return (
    <Desplegable titulo={titulo}>
      <ol className="flex list-decimal flex-col gap-2.5 pl-5 text-chico text-foreground/85">
        <li>
          <strong>Venta por semana.</strong>{' '}
          {p.semanas === null && !(p.ventasSemana > 0) ? (
            'No tiene ventas en el periodo del archivo, así que no hay promedio.'
          ) : totales ? (
            <>Vendió {n1(x.vendido)} en {n1(inv.fuente.semanas)} semanas: {n1(x.vendido)} ÷ {n1(inv.fuente.semanas)} = <strong>{ventasSemana(p.ventasSemana)}</strong> por semana.</>
          ) : conDoble ? (
            <>
              Vendió {n1(x.vendidoAjustado)} en {n1(x.semanasProducto)} semanas, y lo de los últimos 3 meses ({n1(x.vendidoReciente)} en {n1(x.semanasRecientes)} semanas) cuenta doble:
              ({n1(x.vendidoAjustado)} + {n1(x.vendidoReciente)}) ÷ ({n1(x.semanasProducto)} + {n1(x.semanasRecientes)}) = <strong>{ventasSemana(p.ventasSemana)}</strong> por semana.
            </>
          ) : (
            <>Vendió {n1(x.vendidoAjustado)} en {n1(x.semanasProducto)} semanas: <strong>{ventasSemana(p.ventasSemana)}</strong> por semana.</>
          )}
          {p.pico && <> Un mes con una venta fuera de lo normal se contó como 3 veces lo normal ({numero(p.pico.contado)} en vez de {numero(p.pico.vendido)}).</>}
          {p.senales.includes('producto_nuevo') && <> Como empezó a venderse hace poco, se promedia desde su primera venta.</>}
          {(x.vendidoProyecto ?? 0) > 0 && <> No se cuentan {n1(x.vendidoProyecto)} unidades vendidas para proyectos: bajaron las existencias, pero no se repiten.</>}
        </li>
        {p.semanas !== null && (
          <li>
            <strong>Para cuánto alcanza.</strong> Hay {numero(p.existencias, 2)}: {numero(Math.max(p.existencias, 0), 2)} ÷ {ventasSemana(p.ventasSemana)} = <strong>{alcance(p.semanas)}</strong>.
          </li>
        )}
        {p.ventaUnica ? (
          <li><strong>Sin sugerido.</strong> Todo lo vendido cayó en una o dos semanas: parece un proyecto, y repetirlo no es lo normal.</li>
        ) : d ? (
          <>
            <li>
              <strong>Temporada.</strong>{' '}
              {inv.temporada ? 'Su negocio vende más en unos meses que en otros: las próximas semanas se ajustan con la temporada de todo su catálogo.' : 'Con menos de 18 meses de ventas no se ajusta por temporada: se supone que las próximas semanas se venden como las de ahora.'}
            </li>
            <li>
              <strong>Lo que se puede vender.</strong> El pedido tiene que cubrir {duracion(d.semanasCubrir)}: lo que tarda {p.proveedor === 'Sin proveedor' ? 'el proveedor' : p.proveedor} ({p.entregaDias != null ? `${plural(p.entregaDias, 'día hábil', 'días hábiles')}` : duracion(p.entrega)}) más {duracion(inv.ajustes.cadaCuanto)} hasta el siguiente pedido.
              Lo más probable es vender {n1(d.media)}{d.bajo !== undefined ? `; en 8 de cada 10 casos, entre ${n1(d.bajo)} y ${n1(d.alto)}` : ''}.
            </li>
            <li>
              <strong>Sugerido.</strong> Para que alcance en 9 de cada 10 casos hacen falta {n1(d.alto)}. Hay {numero(Math.max(p.existencias, 0), 2)}, así que faltan {numero(d.falta ?? Math.max(0, Math.ceil(d.alto - p.existencias)), 2)}.
              {d.loteOrigen === 'catalogo' && d.lote && d.lote !== 1 ? <> Redondeado a cajas de {numero(d.lote, 2)}.</> : null}
              {d.loteOrigen === 'ventas' && d.lote && d.lote > 1 ? <> Siempre se vende de a {numero(d.lote)}: redondeado a paquetes completos.</> : null}
              {d.minimoPedido ? <> Quedaba por debajo del mínimo de pedido ({numero(d.minimoPedido, 2)}), así que pasa al mínimo.</> : null}
              {p.estado === 'sobra' ? <> Pero alcanza para más de {duracion(inv.umbrales.sobra)}: no se sugiere pedir.</> : <> Resultado: <strong>{numero(p.sugerido ?? 0, 2)}</strong>.</>}
            </li>
          </>
        ) : null}
      </ol>
      {children}
    </Desplegable>
  )
}
