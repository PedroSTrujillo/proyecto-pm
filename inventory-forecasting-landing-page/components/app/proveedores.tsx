'use client'

// Proveedores (T12 de docs/PLAN_CAMBIOS_SINESC.md): cuánto tarda cada uno, en la unidad que le sirve, y cada
// cuánto se hace pedido. Lo ven el gerente y el administrador.

import { useEffect, useState } from 'react'
import { ArrowLeft, Minus, Plus } from 'lucide-react'
import { api, textoErrores } from '@/lib/api'
import { DIAS_POR_MES, claveCodigo, numero, plural, unidadDeTiempo } from '@/lib/formato'
import type { Condiciones, Inventario } from '@/lib/tipos'
import { cn } from '@/lib/utils'
import { useInventario } from './contexto'
import { Aviso, Boton, Cargando, Contador, ErrorLista, Pildoras, Tarjeta, Titulo, claseEntrada } from './ui'

export function ProveedoresPantalla() {
  const { inventario, cargando, error } = useInventario()
  const [abierto, setAbierto] = useState<string | null>(null)
  if (cargando) return <Cargando texto="Cargando sus proveedores…" />
  if (error) return <ErrorLista mensaje={error} />
  if (inventario && abierto) return <FichaProveedor inv={inventario} nombre={abierto} alVolver={() => setAbierto(null)} />
  return (
    <>
      <Titulo sub="Cuánto tarda cada proveedor en entregar y qué productos son de cada uno. Con esto SINESC sabe qué pedir antes de que sea tarde.">Proveedores</Titulo>
      {inventario ? <><Proveedores inv={inventario} alVer={setAbierto} /><Importaciones inv={inventario} /></> : <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">Suba primero el inventario en Datos y aquí aparecen sus proveedores.</p>}
    </>
  )
}

// El tiempo de entrega se escribe en días hábiles (lunes a viernes) y el servidor lo pasa a semanas
// (÷ 5). Los proveedores guardados antes en semanas se muestran convertidos.
// Cada proveedor lo escribe en su unidad (valores + unidades) y se guarda siempre en días hábiles.
type Unidad = 'habiles' | 'calendario' | 'semanas'
type Tiempos = { valores: Record<string, number>; unidades: Record<string, Unidad>; diasDefecto: number; cadaCuanto: number; cadaCuantoProv: Record<string, number> }
const UNIDADES: { id: Unidad; texto: string }[] = [{ id: 'habiles', texto: 'Días hábiles' }, { id: 'calendario', texto: 'Días calendario' }, { id: 'semanas', texto: 'Semanas' }]
const deHabiles = (h: number, u: Unidad) => (u === 'calendario' ? Math.round((h * 7) / 5) : u === 'semanas' ? h / 5 : h)
const aHabiles = (v: number, u: Unidad) => Math.round(u === 'calendario' ? (v * 5) / 7 : u === 'semanas' ? v * 5 : v)
type Prefijo = { prefijo: string; proveedor: string }
const MAX_DIAS = 130
const aDias = (semanasEntrega: number) => Math.round(semanasEntrega * 5)

// Un paso de "cada cuánto pide" en la unidad elegida: un día, una semana o un mes (en semanas).
function pasoCadaCuanto() {
  const u = unidadDeTiempo()
  return u === 'dias' ? 1 / 7 : u === 'meses' ? DIAS_POR_MES / 7 : 1
}

function Proveedores({ inv, alVer }: { inv: Inventario; alVer: (nombre: string) => void }) {
  const { guardarAjustes } = useInventario()
  const inicial = (): Tiempos => {
    const nombres = [...new Set([...inv.proveedores.filter((p) => p.nombre !== 'Sin proveedor').map((p) => p.nombre), ...Object.keys(inv.ajustes.entregas)])]
    const unidades = Object.fromEntries(nombres.map((n) => [n, inv.ajustes.unidades?.[n] ?? 'habiles'])) as Record<string, Unidad>
    const habiles = (n: string) => inv.ajustes.entregasDias?.[n] ?? aDias(inv.ajustes.entregas[n] ?? inv.proveedores.find((p) => p.nombre === n)?.entrega ?? inv.ajustes.entregaPorDefecto)
    return {
      valores: Object.fromEntries(nombres.map((n) => [n, deHabiles(habiles(n), unidades[n])])),
      unidades,
      diasDefecto: inv.ajustes.entregaPorDefectoDias ?? aDias(inv.ajustes.entregaPorDefecto),
      cadaCuanto: inv.ajustes.cadaCuanto,
      cadaCuantoProv: inv.ajustes.cadaCuantoProv ?? {},
    }
  }
  const [aj, setAj] = useState<Tiempos>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const cambiado = JSON.stringify(aj) !== JSON.stringify(inicial())

  useEffect(() => setAj(inicial()), [inv]) // eslint-disable-line react-hooks/exhaustive-deps

  function mover(nombre: string, delta: number) {
    setGuardado(null)
    setAj((a) => {
      if (nombre === '*') return { ...a, diasDefecto: Math.min(MAX_DIAS, Math.max(0, a.diasDefecto + delta)) }
      const u = a.unidades[nombre] ?? 'habiles'
      const actual = a.valores[nombre] ?? deHabiles(a.diasDefecto, u)
      const nuevo = Math.round(Math.min(deHabiles(MAX_DIAS, u), Math.max(0, actual + delta)) * 10) / 10
      return { ...a, valores: { ...a.valores, [nombre]: nuevo } }
    })
  }

  // "Cada cuánto pide" (en semanas): el de un proveedor, o el general ('*') para los productos sin proveedor.
  function moverCada(nombre: string, delta: number) {
    setGuardado(null)
    const limitar = (v: number) => Math.round(Math.min(26, Math.max(1, v)) * 1000) / 1000
    setAj((a) => nombre === '*'
      ? { ...a, cadaCuanto: limitar(a.cadaCuanto + delta) }
      : { ...a, cadaCuantoProv: { ...a.cadaCuantoProv, [nombre]: limitar((a.cadaCuantoProv[nombre] ?? a.cadaCuanto) + delta) } })
  }

  // Cambiar la unidad conserva el mismo tiempo, escrito de otra forma.
  function cambiarUnidad(nombre: string, u: Unidad) {
    setGuardado(null)
    setAj((a) => {
      const antes = a.unidades[nombre] ?? 'habiles'
      const h = aHabiles(a.valores[nombre] ?? deHabiles(a.diasDefecto, antes), antes)
      return { ...a, unidades: { ...a.unidades, [nombre]: u }, valores: { ...a.valores, [nombre]: deHabiles(h, u) } }
    })
  }

  const enviar = (a: Tiempos) => ({
    entregasDias: Object.fromEntries(Object.entries(a.valores).map(([n, v]) => [n, aHabiles(v, a.unidades[n] ?? 'habiles')])),
    unidades: a.unidades,
    entregaPorDefectoDias: a.diasDefecto,
    cadaCuanto: a.cadaCuanto,
    cadaCuantoProv: a.cadaCuantoProv,
  })

  async function guardar(extra: Partial<{ prefijos: Prefijo[] }> = {}, mensaje = 'Cambios guardados. El panel y el pedido ya usan estos tiempos.') {
    setGuardando(true)
    try {
      await guardarAjustes({ ...enviar(aj), ...extra })
      setGuardado(mensaje)
    } finally {
      setGuardando(false)
    }
  }

  const nombres = Object.keys(aj.valores).sort((a, b) => {
    const pa = inv.proveedores.find((p) => p.nombre === a)?.productos ?? 0
    const pb = inv.proveedores.find((p) => p.nombre === b)?.productos ?? 0
    return pb - pa || a.localeCompare(b, 'es')
  })
  const sinProveedor = inv.resumen.sinProveedor

  return (
    <>
      <Tarjeta aria-labelledby="t-prov" className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 id="t-prov" className="text-xl font-bold">Sus proveedores</h2>
          <p className="mt-1 text-cuerpo text-muted-foreground">Cuánto tarda cada uno en entregar (desde que se pide hasta que llega a su bodega; los días hábiles son de lunes a viernes) y cada cuánto se le pide. Con esto sabemos qué pedir antes de que sea tarde.</p>
          <p className="mt-1 text-chico text-muted-foreground">Por ejemplo, un distribuidor de Bogotá recibe en 1 día lo de Bogotá, en 2 lo de Cali y en 3 o 4 lo de Barranquilla; casi nada tarda más de 8.</p>
        </div>
        {nombres.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">Todavía no hay proveedores. Agregue el primero abajo.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead className="bg-muted text-nota text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Proveedor</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Productos</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Tarda en llegar</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Cada cuánto se le pide</th>
                </tr>
              </thead>
              <tbody>
                {nombres.map((nombre) => {
                  const info = inv.proveedores.find((p) => p.nombre === nombre)
                  const u = aj.unidades[nombre] ?? 'habiles'
                  return (
                    <tr key={nombre} className="border-t border-[#f0f1ee] align-middle">
                      <th scope="row" className="px-3 py-2.5 text-left font-normal">
                        <strong className="block text-cuerpo leading-snug">{nombre}{inv.ajustes.importaciones && inv.ajustes.condiciones?.[nombre]?.internacional ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-nota font-semibold text-muted-foreground">Internacional</span> : null}</strong>
                        <button type="button" onClick={() => alVer(nombre)} className="text-chico font-semibold text-primary underline underline-offset-2 hover:text-primary-hover">Ver y asignar productos</button>
                      </th>
                      <td className="px-3 py-2.5 tabular-nums">
                        <strong className="text-cuerpo">{numero(info?.productos ?? 0)}</strong>
                        {info?.pideYa ? <span className="block text-nota text-muted-foreground">{info.pideYa} para pedir ya</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <select className={claseEntrada} aria-label={`La unidad del tiempo de ${nombre}`} value={u} onChange={(e) => cambiarUnidad(nombre, e.target.value as Unidad)}>
                            {UNIDADES.map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}
                          </select>
                          <Contador valor={aj.valores[nombre] ?? aj.diasDefecto} etiqueta={`el tiempo de ${nombre}`} unidad={u === 'habiles' ? 'dias-habiles' : u === 'calendario' ? 'dias-calendario' : 'semanas'} onMover={(d) => mover(nombre, d)} paso={1} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Contador valor={aj.cadaCuantoProv[nombre] ?? aj.cadaCuanto} etiqueta={`cada cuánto se le pide a ${nombre}`} unidad="tiempo" onMover={(d) => moverCada(nombre, d * pasoCadaCuanto())} paso={1} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      <Tarjeta aria-labelledby="t-sin" className="flex min-w-0 flex-col gap-3 p-5 sm:p-6">
        <div>
          <h2 id="t-sin" className="text-xl font-bold">Productos sin proveedor</h2>
          <p className="mt-1 text-cuerpo text-muted-foreground">{sinProveedor ? `${plural(sinProveedor, 'producto', 'productos')} sin proveedor usan` : 'Cualquier producto sin proveedor toma'} estos tiempos. También valen para un proveedor al que no se le haya puesto uno propio.</p>
        </div>
        <ul className="flex flex-col">
          <li className="flex flex-wrap items-center gap-3 py-2">
            <strong className="min-w-0 flex-1 text-cuerpo">Cuánto tardan en llegar</strong>
            <Contador valor={aj.diasDefecto} etiqueta="el tiempo de los productos sin proveedor" unidad="dias-habiles" onMover={(d) => mover('*', d)} paso={1} />
          </li>
          <li className="flex flex-wrap items-center gap-3 border-t border-[#f0f1ee] py-2">
            <div className="min-w-0 flex-1">
              <strong className="block text-cuerpo">Cada cuánto se hace pedido</strong>
              <span className="text-nota text-muted-foreground">Lo sugerido alcanza hasta el siguiente.</span>
            </div>
            <Contador valor={aj.cadaCuanto} etiqueta="cada cuánto pide" unidad="tiempo" onMover={(d) => moverCada('*', d * pasoCadaCuanto())} paso={1} />
          </li>
        </ul>
      </Tarjeta>
      <Tarjeta className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Boton variante="primario" onClick={() => guardar()} disabled={!cambiado || guardando}>{guardando ? 'Recalculando…' : 'Guardar y recalcular'}</Boton>
        {!agregando && <Boton variante="fantasma" onClick={() => setAgregando(true)}><Plus /> Agregar proveedor</Boton>}
        {guardado && <span className="aparecer text-chico font-semibold text-verde">{guardado}</span>}
      </div>
      {agregando && (
        <NuevoProveedor
          prefijos={inv.ajustes.prefijos}
          alCancelar={() => setAgregando(false)}
          alGuardar={async (nombre, diasEntrega, prefijo) => {
            const nuevo = { ...aj, valores: { ...aj.valores, [nombre]: diasEntrega }, unidades: { ...aj.unidades, [nombre]: 'habiles' as Unidad } }
            setAj(nuevo)
            const prefijos = prefijo ? [...inv.ajustes.prefijos.filter((x) => x.prefijo !== prefijo.toUpperCase()), { prefijo, proveedor: nombre }] : inv.ajustes.prefijos
            setGuardando(true)
            try {
              await guardarAjustes({ ...enviar(nuevo), prefijos })
              setGuardado(prefijo ? `Regla guardada: los códigos que empiezan por "${prefijo}" son de ${nombre}.` : `Proveedor agregado: ${nombre}. Abra su ficha para asignarle productos.`)
              setAgregando(false)
            } finally {
              setGuardando(false)
            }
          }}
        />
      )}
      {inv.ajustes.prefijos.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[#f0f1ee] pt-3">
          <strong className="text-chico">Por el comienzo del código</strong>
          <ul className="flex flex-wrap gap-2">
            {inv.ajustes.prefijos.map((x) => (
              <li key={x.prefijo} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1 pl-3 text-nota">
                <span><strong>{x.prefijo}…</strong> → {x.proveedor}</span>
                <button
                  type="button"
                  aria-label={`Quitar la regla ${x.prefijo}`}
                  className="inline-flex size-6 items-center justify-center rounded-full hover:bg-card"
                  onClick={() => guardar({ prefijos: inv.ajustes.prefijos.filter((y) => y.prefijo !== x.prefijo) }, 'La regla se eliminó.')}
                >
                  <Minus className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
    </>
  )
}

function NuevoProveedor({ prefijos, alGuardar, alCancelar }: { prefijos: Prefijo[]; alGuardar: (nombre: string, dias: number, prefijo: string | null) => Promise<void>; alCancelar: () => void }) {
  const [nombre, setNombre] = useState('')
  const [tiempo, setTiempo] = useState(5)
  const [prefijo, setPrefijo] = useState('')
  const ya = prefijos.find((x) => x.prefijo === prefijo.trim().toUpperCase())
  return (
    <form
      className="aparecer flex flex-col gap-3 rounded-xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (nombre.trim()) alGuardar(nombre.trim(), tiempo, prefijo.trim() || null)
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Nombre del proveedor
        <input className={claseEntrada} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Tornillería Central" autoFocus />
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 text-sm font-semibold">
          Tarda
          <Contador valor={tiempo} etiqueta="el tiempo del proveedor nuevo" unidad="dias-habiles" onMover={(d) => setTiempo((t) => Math.min(MAX_DIAS, Math.max(0, t + d)))} paso={1} />
        </div>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
          <span>Sus códigos empiezan por <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <input className={claseEntrada} value={prefijo} onChange={(e) => setPrefijo(e.target.value.slice(0, 30))} placeholder="Ej.: TOR-" />
        </label>
      </div>
      {ya && <p className="text-nota text-ambar-texto">Ese comienzo ya es de {ya.proveedor}: se cambiará a este proveedor.</p>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante="primario" tamano="chico" disabled={!nombre.trim()}>Agregar</Boton>
        <Boton tamano="chico" variante="fantasma" onClick={alCancelar}>Cancelar</Boton>
      </div>
    </form>
  )
}

type Filtro = 'todos' | 'sin' | 'otro'
const MAX_VISIBLES = 200 // shortcut: con miles de productos se escribe en el buscador para llegar al resto; se podría paginar
const ORIGEN: Record<string, string> = { producto: 'asignado a mano', archivo: 'viene del archivo', prefijo: 'por el comienzo de su código' }

// La ficha de un proveedor: sus productos y cómo agregarle otros, de varios en varios. Asignar es
// escribir en ajustes.asignaciones, que manda sobre el archivo y sobre el comienzo del código.
function FichaProveedor({ inv, nombre, alVolver }: { inv: Inventario; nombre: string; alVolver: () => void }) {
  const { guardarAjustes, recargar } = useInventario()
  const [cambios, setCambios] = useState<Record<string, { multiplo: string; minimo: string; medidas: string }>>({})
  const [guardandoCat, setGuardandoCat] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const suyos = inv.productos.filter((p) => p.proveedor === nombre)
  const otros = inv.productos.filter((p) => p.proveedor !== nombre)
  const q = busca.trim().toLowerCase()
  const visibles = otros
    .filter((p) => filtro === 'todos' || (filtro === 'sin' ? p.proveedor === 'Sin proveedor' : p.proveedor !== 'Sin proveedor'))
    .filter((p) => !q || p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
  const cuantos = (f: (p: (typeof otros)[number]) => boolean) => otros.filter(f).length
  const info = inv.proveedores.find((p) => p.nombre === nombre)

  // El paquete y el mínimo son de cada producto: se escriben aquí y se guardan en su catálogo, como en su ficha.
  const importa = Boolean(inv.ajustes.importaciones)
  const internacional = importa && Boolean(inv.ajustes.condiciones?.[nombre]?.internacional) // los nacionales no llevan medidas
  const original = (p: (typeof suyos)[number]) => ({ multiplo: p.multiplo ? String(p.multiplo) : '', minimo: p.minimoPedido ? String(p.minimoPedido) : '', medidas: p.medidas ? p.medidas.replaceAll('x', ' × ') : '' })
  const valorDe = (p: (typeof suyos)[number]) => cambios[p.codigo] ?? original(p)
  const pendientes = suyos.filter((p) => {
    const c = cambios[p.codigo]
    const o = original(p)
    return c && (c.multiplo !== o.multiplo || c.minimo !== o.minimo || (internacional && c.medidas !== o.medidas))
  })
  function editar(p: (typeof suyos)[number], campo: 'multiplo' | 'minimo' | 'medidas', valor: string) {
    setAviso(null)
    setCambios((c) => ({ ...c, [p.codigo]: { ...valorDe(p), [campo]: valor } }))
  }
  async function guardarCatalogo() {
    setGuardandoCat(true)
    try {
      await api('POST', '/catalogo/lote', { filas: pendientes.map((p) => ({ codigo: p.codigo, multiplo: cambios[p.codigo].multiplo, minimo: cambios[p.codigo].minimo, ...(internacional ? { medidas: cambios[p.codigo].medidas } : {}) })) })
      setAviso({ ok: true, texto: `Cambios guardados: ${plural(pendientes.length, 'producto actualizado', 'productos actualizados')}. Las sugerencias ya los tienen en cuenta.` })
      setCambios({})
      recargar()
    } catch (e) {
      const t = textoErrores(e)
      setAviso({ ok: false, texto: t.lista[0] || t.mensaje })
    } finally {
      setGuardandoCat(false)
    }
  }

  function marcar(codigo: string, si: boolean) {
    setMarcados((m) => {
      const n = new Set(m)
      if (si) n.add(codigo)
      else n.delete(codigo)
      return n
    })
  }

  async function asignar() {
    const elegidos = otros.filter((p) => marcados.has(p.codigo))
    const cambiados = elegidos.filter((p) => p.proveedor !== 'Sin proveedor').length
    setGuardando(true)
    try {
      const asignaciones = { ...inv.ajustes.asignaciones }
      for (const p of elegidos) asignaciones[claveCodigo(p.codigo)] = nombre
      await guardarAjustes({ asignaciones })
      setAviso({ ok: true, texto: `Cambios guardados: ${plural(elegidos.length, 'producto', 'productos')} ${elegidos.length === 1 ? 'quedó asignado' : 'quedaron asignados'} a ${nombre}${cambiados ? ` (${cambiados} cambiaron de proveedor)` : ''}.` })
      setMarcados(new Set())
      setAgregando(false)
    } catch {
      setAviso({ ok: false, texto: 'No se pudo guardar. Inténtelo de nuevo.' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Titulo sub={`${plural(suyos.length, 'producto', 'productos')}${info?.entrega !== undefined ? ` · tarda ${inv.ajustes.entregasDias?.[nombre] ?? Math.round(info.entrega * 5)} días hábiles` : ''}`} acciones={<Boton tamano="chico" onClick={alVolver}><ArrowLeft /> Todos los proveedores</Boton>}>{nombre}</Titulo>
      {aviso && <Aviso tono={aviso.ok ? 'ok' : 'error'} titulo={aviso.texto} />}
      <CondicionesProveedor inv={inv} nombre={nombre} />
      <Tarjeta className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Sus productos</h2>
            <p className="mt-1 text-chico text-muted-foreground">El paquete en que se pide y el mínimo de pedido son de cada producto: escríbalos aquí.</p>
          </div>
          {!agregando && <Boton variante="primario" onClick={() => { setAviso(null); setAgregando(true) }}><Plus /> Agregar productos</Boton>}
        </div>
        {suyos.length === 0 ? (
          <p className="text-cuerpo text-muted-foreground">Todavía no tiene productos. Use “Agregar productos” para asignarle varios a la vez.</p>
        ) : (
          <ul className="flex flex-col">
            {suyos.slice(0, MAX_VISIBLES).map((p) => (
              <li key={p.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#f0f1ee] py-2 first:border-t-0">
                <strong className="text-cuerpo">{p.codigo}</strong>
                <span className="min-w-0 flex-1 text-cuerpo">{p.nombre}<span className="block text-nota text-muted-foreground">{p.origenProveedor ? ORIGEN[p.origenProveedor] : ''}</span></span>
                <label className="flex flex-col text-nota font-semibold">
                  Paquete de
                  <input className={cn(claseEntrada, 'w-24')} inputMode="decimal" value={valorDe(p).multiplo} onChange={(e) => editar(p, 'multiplo', e.target.value)} placeholder="—" />
                </label>
                <label className="flex flex-col text-nota font-semibold">
                  Mínimo
                  <input className={cn(claseEntrada, 'w-24')} inputMode="decimal" value={valorDe(p).minimo} onChange={(e) => editar(p, 'minimo', e.target.value)} placeholder="—" />
                </label>
                {importa && internacional && (
                  <label className="flex flex-col text-nota font-semibold">
                    Medidas del paquete (cm){p.volumenPaquete ? <span className="font-normal text-muted-foreground"> · {numero(p.volumenPaquete, 3)} m³</span> : null}
                    <input className={cn(claseEntrada, 'w-40')} value={valorDe(p).medidas} onChange={(e) => editar(p, 'medidas', e.target.value)} placeholder="largo × ancho × alto" />
                  </label>
                )}
              </li>
            ))}
            {suyos.length > MAX_VISIBLES && <li className="pt-2 text-nota text-muted-foreground">Se muestran {MAX_VISIBLES} de {numero(suyos.length)}.</li>}
          </ul>
        )}
        {pendientes.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Boton variante="primario" onClick={guardarCatalogo} disabled={guardandoCat}>{guardandoCat ? 'Guardando…' : `Guardar ${plural(pendientes.length, 'producto', 'productos')}`}</Boton>
            <Boton variante="fantasma" onClick={() => setCambios({})} disabled={guardandoCat}>Descartar cambios</Boton>
          </div>
        )}
      </Tarjeta>
      {agregando && (
        <Tarjeta className="aparecer flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-bold">Agregar productos a {nombre}</h2>
            <p className="mt-1 text-cuerpo text-muted-foreground">Marque los que quiera. Si un producto ya tenía otro proveedor, pasa a ser de {nombre}.</p>
          </div>
          <Pildoras
            etiqueta="Filtrar por proveedor actual"
            valor={filtro}
            onCambio={setFiltro}
            opciones={[
              { id: 'todos', texto: 'Todos', cuenta: otros.length },
              { id: 'sin', texto: 'Sin proveedor', cuenta: cuantos((p) => p.proveedor === 'Sin proveedor') },
              { id: 'otro', texto: 'Con otro proveedor', cuenta: cuantos((p) => p.proveedor !== 'Sin proveedor') },
            ]}
          />
          <input type="search" className={claseEntrada} placeholder="Buscar por código o nombre" aria-label="Buscar producto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <label className="flex items-center gap-2.5 text-cuerpo font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={visibles.length > 0 && visibles.slice(0, MAX_VISIBLES).every((p) => marcados.has(p.codigo))}
              onChange={(e) => setMarcados((m) => { const n = new Set(m); for (const p of visibles.slice(0, MAX_VISIBLES)) { if (e.target.checked) n.add(p.codigo); else n.delete(p.codigo) } return n })}
            />
            Marcar los {numero(Math.min(visibles.length, MAX_VISIBLES))} que se ven
          </label>
          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">No hay productos con ese filtro.</p>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto rounded-xl border border-border">
              {visibles.slice(0, MAX_VISIBLES).map((p) => (
                <li key={p.codigo} className="border-t border-[#f0f1ee] first:border-t-0">
                  <label className="flex cursor-pointer flex-wrap items-baseline gap-x-3 px-3 py-2 hover:bg-muted">
                    <input type="checkbox" className="size-4 self-center accent-[var(--primary)]" checked={marcados.has(p.codigo)} onChange={(e) => marcar(p.codigo, e.target.checked)} />
                    <strong className="text-cuerpo">{p.codigo}</strong>
                    <span className="min-w-0 flex-1 text-cuerpo">{p.nombre}</span>
                    <span className="text-nota text-muted-foreground">{p.proveedor === 'Sin proveedor' ? 'Sin proveedor' : `Hoy: ${p.proveedor}`}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {visibles.length > MAX_VISIBLES && <p className="text-nota text-muted-foreground">Se muestran {MAX_VISIBLES} de {numero(visibles.length)}. Escriba en el buscador para llegar a los demás.</p>}
          <div className="flex flex-wrap gap-2">
            <Boton variante="primario" onClick={asignar} disabled={!marcados.size || guardando}>{guardando ? 'Guardando…' : marcados.size ? `Asignar ${plural(marcados.size, 'producto', 'productos')} a ${nombre}` : 'Marque al menos un producto'}</Boton>
            <Boton variante="fantasma" onClick={() => { setAgregando(false); setMarcados(new Set()) }}>Cancelar</Boton>
          </div>
        </Tarjeta>
      )}
    </>
  )
}

// Lo que pide este proveedor (T13): el mínimo de todo el envío. El paquete y el mínimo por producto se
// escriben en cada producto, arriba. Si la empresa encendió las importaciones (T14), también cuántos contenedores
// piensa contratar para este proveedor.
function CondicionesProveedor({ inv, nombre }: { inv: Inventario; nombre: string }) {
  const { guardarAjustes } = useInventario()
  const importa = Boolean(inv.ajustes.importaciones)
  const c = inv.ajustes.condiciones?.[nombre]
  const inicial = () => ({ internacional: Boolean(c?.internacional), envio: c?.minimoEnvio ? String(c.minimoEnvio) : '', contenedores: c?.contenedores ? String(c.contenedores) : '', tipo: c?.tipoContenedor ?? '40' })
  const [v, setV] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  useEffect(() => setV(inicial()), [inv, nombre]) // eslint-disable-line react-hooks/exhaustive-deps
  const cambiado = JSON.stringify(v) !== JSON.stringify(inicial())
  const poner = (cambio: Partial<typeof v>) => { setGuardado(false); setV({ ...v, ...cambio }) }

  async function guardar() {
    setGuardando(true)
    try {
      const envio = Number(v.envio.replace(',', '.'))
      const contenedores = Math.round(Number(v.contenedores))
      const nueva: Condiciones = {}
      if (envio > 0) nueva.minimoEnvio = envio
      if (!importa) Object.assign(nueva, c?.internacional ? { internacional: true, contenedores: c.contenedores, tipoContenedor: c.tipoContenedor } : {}) // apagado: se conserva lo guardado
      else if (v.internacional) Object.assign(nueva, { internacional: true }, contenedores > 0 ? { contenedores, tipoContenedor: v.tipo } : {})
      const condiciones = { ...inv.ajustes.condiciones }
      if (Object.keys(nueva).length) condiciones[nombre] = nueva
      else delete condiciones[nombre]
      await guardarAjustes({ condiciones })
      setGuardado(true)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="text-xl font-bold">Cómo se le pide</h2>
      <div className="flex flex-wrap gap-4">
        <label className="flex max-w-xs flex-col gap-1 text-sm font-semibold">
          Unidades mínimas por envío
          <input className={claseEntrada} inputMode="decimal" value={v.envio} onChange={(e) => poner({ envio: e.target.value })} placeholder="Sin mínimo" />
          <span className="text-nota font-normal text-muted-foreground">Si el pedido a este proveedor no llega, se avisa al preparar el pedido. No se agregan unidades solas.</span>
        </label>
        {importa && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Tipo de proveedor
            <select className={claseEntrada} value={v.internacional ? 'internacional' : 'nacional'} onChange={(e) => poner({ internacional: e.target.value === 'internacional' })}>
              <option value="nacional">Nacional</option>
              <option value="internacional">Internacional</option>
            </select>
            <span className="max-w-xs text-nota font-normal text-muted-foreground">Solo los internacionales llevan contenedores y medidas.</span>
          </label>
        )}
        {importa && v.internacional && (
          <div className="flex flex-col gap-1 text-sm font-semibold">
            Contenedores que piensa contratar
            <div className="flex gap-2">
              <input className={cn(claseEntrada, 'w-24')} inputMode="numeric" aria-label="Cuántos contenedores" value={v.contenedores} onChange={(e) => poner({ contenedores: e.target.value })} placeholder="Ninguno" />
              <select className={claseEntrada} aria-label="Tamaño del contenedor" value={v.tipo} onChange={(e) => poner({ tipo: e.target.value as '20' | '40' })}>
                <option value="20">de 20 pies</option>
                <option value="40">de 40 pies</option>
              </select>
            </div>
            <span className="max-w-xs text-nota font-normal text-muted-foreground">El pedido a este proveedor se recorta para que quepa, según las medidas de cada producto (abajo).</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Boton variante="primario" onClick={guardar} disabled={!cambiado || guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
        {guardado && <span className="aparecer text-chico font-semibold text-verde">Guardado.</span>}
      </div>
    </Tarjeta>
  )
}

// Extensión opcional (T14): las empresas con solo envíos nacionales no la ven más que como esta casilla discreta.
function Importaciones({ inv }: { inv: Inventario }) {
  const { guardarAjustes } = useInventario()
  const [guardando, setGuardando] = useState(false)
  const activa = Boolean(inv.ajustes.importaciones)
  async function cambiar(valor: boolean) {
    setGuardando(true)
    try {
      await guardarAjustes({ importaciones: valor })
    } finally {
      setGuardando(false)
    }
  }
  return (
    <label className="flex items-start gap-2.5 rounded-2xl border border-dashed border-border p-4 text-cuerpo">
      <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={activa} disabled={guardando} onChange={(e) => cambiar(e.target.checked)} />
      <span>
        <strong>Mi empresa importa y quiere calcular contenedores.</strong>
        <span className="block text-chico text-muted-foreground">Es opcional. Si la activa, en cada proveedor podrá marcar si es nacional o internacional; solo a los internacionales les pedirá cuántos contenedores contrata y las medidas de sus productos, y el pedido se ajustará para que quepa.</span>
      </span>
    </label>
  )
}
