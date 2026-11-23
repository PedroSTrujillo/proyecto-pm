'use client'

// Existencias de hoy: las del último archivo más los movimientos registrados después. Al abrir un
// producto se ve su historial con el saldo después de cada movimiento. "Hacer un conteo" guarda lo
// que se contó como movimientos de tipo conteo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, textoErrores } from '@/lib/api'
import { claveCodigo, dia, numero } from '@/lib/formato'
import type { Existencias as TExistencias, Movimiento, ProductoCatalogo } from '@/lib/tipos'
import { useInventario, useSesion } from './contexto'
import { puedeRegistrar } from './vista'
import { TEXTO_TIPO } from './movimientos'
import { Aviso, Boton, BotonEnlace, Cargando, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'

type Kardex = { producto: ProductoCatalogo; inicial: { fecha: string; existencias: number } | null; filas: (Movimiento & { cuenta: boolean; saldo: number | null })[]; existencias: number }

const MAX_FILAS = 300


// Para qué sirve el conteo, dicho antes de que la persona lo use.
const CONTEO = 'Si lo que hay en la bodega no coincide, haga un conteo: las existencias quedan en lo que usted cuente.'

export function Existencias() {
  const { inventario, recargar } = useInventario()
  const { usuario } = useSesion()
  const puedeContar = puedeRegistrar(usuario, 'conteo')
  const puedeMovimientos = puedeContar || puedeRegistrar(usuario, 'venta')
  const [datos, setDatos] = useState<TExistencias | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [contando, setContando] = useState(false)
  const [conteo, setConteo] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok?: string; error?: ReturnType<typeof textoErrores>; avisos?: string[] } | null>(null)

  const cargar = useCallback(() => {
    api<TExistencias>('GET', '/existencias').then(setDatos).catch((e) => setError(textoErrores(e).mensaje))
  }, [])
  useEffect(cargar, [cargar])

  // El estado de cada producto (se agota, sobra…) sale del inventario calculado.
  const estados = useMemo(() => new Map((inventario?.productos ?? []).map((p) => [claveCodigo(p.codigo), p])), [inventario])
  const filas = useMemo(() => {
    if (!datos) return []
    const t = q.trim().toLowerCase()
    return datos.productos.filter((p) => !t || p.codigo.toLowerCase().includes(t) || p.nombre.toLowerCase().includes(t))
  }, [datos, q])

  if (error) return <ErrorLista mensaje={error} />
  if (!datos) return <Cargando />

  const contados = Object.entries(conteo).filter(([, v]) => v.trim() !== '')
  async function guardarConteo() {
    setMsg(null)
    try {
      const r = await api<{ guardados: number; avisos: string[] }>('POST', '/movimientos', { movimientos: contados.map(([codigo, cantidad]) => ({ codigo, cantidad, tipo: 'conteo', fecha: datos!.hoy, nota: 'Conteo físico' })) })
      setMsg({ ok: r.guardados === 1 ? 'Conteo guardado para 1 producto.' : `Conteo guardado para ${r.guardados} productos.`, avisos: r.avisos })
      setConteo({})
      setContando(false)
      cargar()
      recargar()
    } catch (e) {
      setMsg({ error: textoErrores(e) })
    }
  }

  return (
    <>
      <Titulo
        sub={
          datos.base
            ? `Las del archivo con ventas hasta el ${dia(datos.base.hasta)}${datos.movimientos ? `, más ${datos.movimientos === 1 ? '1 movimiento registrado' : `${numero(datos.movimientos)} movimientos registrados`} después` : ''}. ${CONTEO}`
            : datos.movimientos ? `Salen solo de los movimientos registrados. ${CONTEO}` : 'Todavía no hay archivo ni movimientos.'
        }
        acciones={
          <>
            {puedeMovimientos && <BotonEnlace href="/movimientos" variante="primario">Registrar movimientos</BotonEnlace>}
            {puedeContar && <Boton onClick={() => setContando((v) => !v)} aria-pressed={contando}><ClipboardCheck /> {contando ? 'Cancelar conteo' : 'Hacer un conteo'}</Boton>}
          </>
        }
      >
        Existencias
      </Titulo>
      {datos.ignorados > 0 && <Aviso tono="cuidado">{datos.ignorados === 1 ? 'Hay 1 movimiento' : `Hay ${datos.ignorados} movimientos`} del día del archivo o de antes: ese día ya está en el archivo, así que no {datos.ignorados === 1 ? 'cuenta' : 'cuentan'}.</Aviso>}
      {datos.negativos > 0 && <Aviso tono="cuidado">{datos.negativos === 1 ? '1 producto está' : `${datos.negativos} productos están`} en negativo. Casi siempre falta registrar una entrada; un conteo lo corrige.</Aviso>}
      {msg?.ok && <Aviso tono="ok">{msg.ok}</Aviso>}
      {msg?.avisos?.map((a) => <Aviso key={a} tono="cuidado">{a}</Aviso>)}
      {msg?.error && <ErrorLista mensaje={msg.error.mensaje} lista={msg.error.lista} />}
      {contando && (
        <Aviso tono="info" titulo="Conteo físico">
          Escriba lo que contó en cada producto (los que deje vacíos no cambian). Al guardar, las existencias quedan en esa cantidad con fecha de hoy.
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Boton variante="primario" tamano="chico" disabled={!contados.length} onClick={guardarConteo}>Guardar conteo{contados.length ? ` (${contados.length})` : ''}</Boton>
          </div>
        </Aviso>
      )}

      <div className={cn('grid grid-cols-1 items-start gap-5', abierto && 'xl:grid-cols-[minmax(0,1fr)_24rem]')}>
        <Tarjeta className="p-4 sm:p-5">
          <input className={cn(claseEntrada, 'mb-3')} placeholder="Buscar por código o nombre" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
          {filas.length === 0 ? <p className="text-muted-foreground">No hay productos{q ? ' con esa búsqueda' : ''}.</p> : (
            <div className="overflow-x-auto">
              {/* En el celular cabe sin deslizar de lado: "Pedido" pasa debajo del nombre (solo al contar hace falta más ancho). */}
              <table className={cn('w-full border-separate border-spacing-0 text-cuerpo', contando && 'min-w-[520px]')} data-privado>
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th scope="col" className="border-b border-border px-2 py-2 font-semibold">Producto</th>
                    <th scope="col" className="border-b border-border px-2 py-2 text-right font-semibold">Existencias</th>
                    <th scope="col" className="hidden border-b border-border px-2 py-2 text-right font-semibold sm:table-cell">Pedido</th>
                    {contando && <th scope="col" className="border-b border-border px-2 py-2 text-right font-semibold">Conteo</th>}
                    <th scope="col" className="hidden border-b border-border px-2 py-2 font-semibold sm:table-cell">Último movimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, MAX_FILAS).map((p) => {
                    const inv = estados.get(claveCodigo(p.codigo))
                    const v = conteo[p.codigo] ?? ''
                    const diferencia = v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) - p.existencias : null
                    return (
                      <tr key={p.codigo} className={cn('cursor-pointer hover:bg-muted/60', abierto === p.codigo && 'bg-secondary')} onClick={() => !contando && setAbierto(p.codigo)}>
                        <td className="border-b border-[#f0f1ee] px-2 py-2.5">
                          <button type="button" className="text-left" onClick={() => setAbierto(p.codigo)}>
                            <strong>{p.codigo}</strong> <span className="text-muted-foreground">{p.nombre}</span>
                          </button>
                          {inv && inv.estado === 'agota' && <span className="block text-nota font-semibold text-rojo-texto">{inv.existencias <= 0 ? 'Agotado' : 'Se va a agotar'}</span>}
                          {(inv?.enCamino || inv?.pedidoReciente) && <span className="block text-nota text-muted-foreground sm:hidden">{inv.enCamino ? `En camino: ${numero(inv.enCamino.cantidad, 2)}` : `Pedido: ${numero(inv.pedidoReciente!.cantidad, 2)} (ya entró)`}</span>}
                        </td>
                        <td className={cn('border-b border-[#f0f1ee] px-2 py-2.5 text-right font-semibold tabular-nums', p.existencias < 0 && 'text-rojo')}>{numero(p.existencias, 2)}{p.unidad ? <span className="ml-1 text-sm font-normal text-muted-foreground">{p.unidad}</span> : null}</td>
                        <td
                          className="hidden border-b border-[#f0f1ee] px-2 py-2.5 text-right text-sm tabular-nums text-muted-foreground sm:table-cell"
                          title={inv?.pedidoReciente ? `Pedido ${inv.pedidoReciente.numero}${inv.pedidoReciente.por ? ` de ${inv.pedidoReciente.por}` : ''}, ${dia(inv.pedidoReciente.fecha)}${inv.enCamino ? `. Faltan por entrar ${numero(inv.enCamino.cantidad, 2)}.` : '. Ya entró.'}` : undefined}
                        >
                          {inv?.enCamino ? `En camino: ${numero(inv.enCamino.cantidad, 2)}` : inv?.pedidoReciente ? `Pedido: ${numero(inv.pedidoReciente.cantidad, 2)} (ya entró)` : ''}
                        </td>
                        {contando && (
                          <td className="border-b border-[#f0f1ee] px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <input className={cn(claseEntrada, 'ml-auto min-h-9 w-24 text-right')} inputMode="decimal" value={v} onChange={(e) => setConteo((c) => ({ ...c, [p.codigo]: e.target.value }))} aria-label={`Conteo de ${p.codigo}`} />
                            {diferencia !== null && diferencia !== 0 && <span className={cn('block text-nota font-semibold', diferencia < 0 ? 'text-rojo-texto' : 'text-azul-texto')}>{diferencia > 0 ? '+' : ''}{numero(diferencia, 2)}</span>}
                          </td>
                        )}
                        <td className="hidden border-b border-[#f0f1ee] px-2 py-2.5 text-sm text-muted-foreground sm:table-cell">{p.ultimo ? `${TEXTO_TIPO[p.ultimo.tipo]} de ${numero(p.ultimo.cantidad, 2)} · ${dia(p.ultimo.fecha)}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filas.length > MAX_FILAS && <p className="mt-2 text-sm text-muted-foreground">Se muestran {MAX_FILAS} de {numero(filas.length)}. Use el buscador para encontrar los demás.</p>}
            </div>
          )}
        </Tarjeta>
        {abierto && <FichaKardex codigo={abierto} cerrar={() => setAbierto(null)} />}
      </div>
    </>
  )
}

function FichaKardex({ codigo, cerrar }: { codigo: string; cerrar: () => void }) {
  const [k, setK] = useState<Kardex | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setK(null)
    api<Kardex>('GET', `/existencias/${encodeURIComponent(codigo)}`).then(setK).catch((e) => setError(textoErrores(e).mensaje))
  }, [codigo])
  return (
    <Tarjeta className="entrar-lado flex flex-col gap-3 p-4 sm:p-5 xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{codigo}</h2>
          {k && <p className="text-sm text-muted-foreground">{k.producto.nombre}</p>}
        </div>
        <Boton tamano="chico" variante="fantasma" onClick={cerrar}><X /><span className="sr-only">Cerrar</span></Boton>
      </div>
      {error ? <ErrorLista mensaje={error} /> : !k ? <Cargando /> : (
        <>
          <p><span className="text-muted-foreground">Existencias hoy</span> <strong className="font-display text-2xl tabular-nums">{numero(k.existencias, 2)}</strong></p>
          <ol className="flex flex-col divide-y divide-border text-chico" data-privado>
            {k.filas.length === 0 && <li className="py-2 text-muted-foreground">Sin movimientos registrados.</li>}
            {k.filas.map((f) => (
              <li key={f.id} className={cn('flex items-baseline justify-between gap-3 py-2', !f.cuenta && 'text-muted-foreground')}>
                <span className={cn(f.anulado && 'line-through')}>
                  {dia(f.fecha)} · {TEXTO_TIPO[f.tipo]} de {numero(f.cantidad, 2)}
                  {!f.cuenta && <span className="block text-nota no-underline">{f.anulado ? 'Anulado' : 'Ya estaba en el archivo'}</span>}
                </span>
                <strong className="tabular-nums">{f.saldo === null ? '' : numero(f.saldo, 2)}</strong>
              </li>
            ))}
            {k.inicial && (
              <li className="flex items-baseline justify-between gap-3 py-2 text-muted-foreground">
                <span>{dia(k.inicial.fecha)} · Según el archivo</span>
                <strong className="tabular-nums">{numero(k.inicial.existencias, 2)}</strong>
              </li>
            )}
          </ol>
        </>
      )}
    </Tarjeta>
  )
}
