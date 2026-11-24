'use client'

// Lo que la empresa escribe en su catálogo y cambia el sugerido (SP4 de docs/PLAN_ALPHA_02.md):
// familia, múltiplo de empaque, mínimo de pedido y, desde el SP7, desde cuántas semanas sobra; uno
// por uno en la ficha o pegados desde Excel.

import { useEffect, useState } from 'react'
import { api, textoErrores } from '@/lib/api'
import { cn } from '@/lib/utils'
import { numero, plural } from '@/lib/formato'
import type { Producto } from '@/lib/tipos'
import { useInventario } from './contexto'
import { Aviso, Boton, Campo, Desplegable, ErrorLista, claseEntrada } from './ui'

type FilaLote = { codigo: string; familia?: string; multiplo?: string; minimo?: string; sobra?: string }

// --- Uno por uno, en la ficha ----------------------------------------------------------------

export function EditarCatalogo({ p }: { p: Producto }) {
  const { recargar, inventario } = useInventario()
  const sobraGeneral = inventario?.umbrales.sobra ?? 12
  const inicial = () => ({ familia: p.familia || '', multiplo: p.multiplo ? String(p.multiplo) : '', minimo: p.minimoPedido ? String(p.minimoPedido) : '', sobra: p.sobraSemanas ? String(p.sobraSemanas) : '' })
  const [abierto, setAbierto] = useState(false)
  const [v, setV] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAbierto(false)
    setV(inicial())
    setError(null)
  }, [p.codigo, p.familia, p.multiplo, p.minimoPedido, p.sobraSemanas]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const resumen = [p.familia && `Familia: ${p.familia}`, p.multiplo && `se pide en cajas de ${numero(p.multiplo, 2)}`, p.minimoPedido && `mínimo de pedido ${numero(p.minimoPedido, 2)}`, p.sobraSemanas && `sobra desde ${numero(p.sobraSemanas, 1)} semanas`].filter(Boolean).join(' · ')
  if (!abierto) {
    return (
      <p className="-mt-2 text-chico text-muted-foreground">
        {resumen ? `${resumen}.` : 'Sin familia, caja, mínimo de pedido ni umbral propio de sobrestock.'}{' '}
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
      <Campo etiqueta="Se considera que sobra desde (semanas)" nota={`(vacío: ${numero(sobraGeneral)}, como los demás)`}>
        <input className={cn(claseEntrada, 'sm:max-w-40')} inputMode="decimal" value={v.sobra} onChange={(e) => setV({ ...v, sobra: e.target.value })} placeholder={String(sobraGeneral)} />
      </Campo>
      <p className="text-nota text-muted-foreground">Si alcanza para más semanas que esto, sale como sobrestock en Productos, en el panel y en el boletín, y no se sugiere pedirlo. Sirve para lo que se compra para muchos meses a propósito, o para lo que se daña pronto.</p>
      {error && <p className="text-sm text-rojo-texto">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="chico" variante="primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        <Boton tamano="chico" variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
    </form>
  )
}

// --- Varios a la vez, pegados desde Excel ------------------------------------------------------

// Cada fila: código, familia, caja, mínimo y semanas para que sobre, separados por tabulador (Excel)
// o punto y coma. Una celda vacía borra ese dato; una fila con solo el código no cambia nada.
function leerPegado(texto: string): FilaLote[] {
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const [codigo = '', familia, multiplo, minimo, sobra] = l.split(/\t|;/).map((x) => x.trim())
      return { codigo, ...(familia !== undefined ? { familia } : {}), ...(multiplo !== undefined ? { multiplo } : {}), ...(minimo !== undefined ? { minimo } : {}), ...(sobra !== undefined ? { sobra } : {}) }
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
      setListo(`Cambios guardados: ${plural(r.guardados, 'producto actualizado', 'productos actualizados')}. Las sugerencias ya los tienen en cuenta.`)
      setTexto('')
      recargar()
    } catch (e) {
      setError(textoErrores(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Desplegable titulo="Familia, caja, mínimo de pedido y sobrestock de muchos productos a la vez">
      <div className="flex flex-col gap-3">
        <p className="text-chico text-muted-foreground">
          Copie las columnas de Excel en este orden: código, familia, cajas de (múltiplo de empaque), mínimo de pedido y, si quiere, desde cuántas semanas sobra. Péguelas aquí. Una celda vacía borra ese dato; una columna que no pegue queda como estaba.
        </p>
        <textarea className={cn(claseEntrada, 'min-h-32 py-2 font-mono text-sm')} value={texto} onChange={(e) => { setTexto(e.target.value); setListo(null) }} placeholder={'TOR-0610\tTornillería\t100\t\nCIN-0048\tCintas\t12\t48'} spellCheck={false} aria-label="Código, familia, cajas de, mínimo y semanas para que sobre, una fila por producto" />
        {filas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse text-chico">
              <thead>
                <tr className="text-left text-nota text-muted-foreground">
                  <th scope="col" className="border-b border-border px-2 py-1.5 font-semibold">Código</th>
                  <th scope="col" className="border-b border-border px-2 py-1.5 font-semibold">Familia</th>
                  <th scope="col" className="border-b border-border px-2 py-1.5 text-right font-semibold">Cajas de</th>
                  <th scope="col" className="border-b border-border px-2 py-1.5 text-right font-semibold">Mínimo</th>
                  <th scope="col" className="border-b border-border px-2 py-1.5 text-right font-semibold">Sobra desde</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 5).map((f, i) => (
                  <tr key={i}>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5 font-semibold">{f.codigo}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5">{f.familia ?? <span className="text-muted-foreground">sin cambio</span>}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5 text-right tabular-nums">{f.multiplo ?? <span className="text-muted-foreground">sin cambio</span>}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5 text-right tabular-nums">{f.minimo ?? <span className="text-muted-foreground">sin cambio</span>}</td>
                    <td className="border-b border-[#f0f1ee] px-2 py-1.5 text-right tabular-nums">{f.sobra ?? <span className="text-muted-foreground">sin cambio</span>}</td>
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
