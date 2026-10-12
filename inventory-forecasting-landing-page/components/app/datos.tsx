'use client'

// Datos: el último archivo, subir uno nuevo, cuánto tarda cada proveedor y el historial.

import { useEffect, useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { fecha, fechaHora, numero, plural, semanas } from '@/lib/formato'
import { nombrePrograma } from '@/lib/sistemas'
import type { Inventario } from '@/lib/tipos'
import { useInventario, useSesion } from './contexto'
import { GuiaSistema, SelectorSistema, SubirArchivos } from './subir'
import { Aviso, Boton, Cargando, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'
import { SinInventario } from './sin-inventario'

export function Datos() {
  const { inventario, cargando, error, respuesta, fuente } = useInventario()
  if (cargando) return <Cargando texto="Cargando tus datos…" />
  if (error) return <ErrorLista mensaje={error} />
  if (!inventario && fuente.tipo === 'cuenta' && !respuesta?.puedeSubir) return <SinInventario puedeSubir={false} />
  return <DatosCon inv={inventario} />
}

function DatosCon({ inv }: { inv: Inventario | null }) {
  const { fuente, recargar } = useInventario()
  const { usuario, fijar } = useSesion()
  const demo = fuente.tipo === 'demo'
  const [listo, setListo] = useState<string | null>(null)

  return (
    <>
      <Titulo sub="Tu inventario queda guardado. Súbelo de nuevo cuando quieras ponerlo al día.">Datos</Titulo>

      {inv && <UltimaCarga inv={inv} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Tarjeta aria-labelledby="t-subir" className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <h2 id="t-subir" className="text-xl font-bold">{inv ? 'Actualizar datos' : 'Sube tu inventario'}</h2>
          {demo ? <SubirDemo inv={inv} /> : (
            <>
              {listo && <Aviso tono="ok">{listo}</Aviso>}
              <SubirArchivos
                base="/inventario/export"
                usuario={usuario}
                alGuardarSistema={fijar}
                alTerminar={(r) => {
                  setListo(`Listo: leímos ${plural(r.resumen?.productos ?? 0, 'producto', 'productos')}. El panel ya está al día.`)
                  recargar()
                }}
              />
            </>
          )}
        </Tarjeta>
        {inv && inv.alcance !== 'prueba' && <Proveedores inv={inv} />}
        {inv && inv.alcance === 'prueba' && (
          <Tarjeta className="flex flex-col gap-2 p-5 sm:p-6">
            <h2 className="text-xl font-bold">Tus proveedores</h2>
            <p className="text-[0.95rem] text-muted-foreground">Cuando termine tu prueba vas a poder decir cuánto tarda cada proveedor. Con eso te avisamos qué pedir antes de que sea tarde y cuánto pedir.</p>
          </Tarjeta>
        )}
      </div>

      <Historial inv={inv} />
    </>
  )
}

function UltimaCarga({ inv }: { inv: Inventario }) {
  const f = inv.fuente
  return (
    <Tarjeta aria-labelledby="t-ultima" className="flex flex-wrap items-center justify-between gap-5 p-5">
      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-verde-fondo text-verde"><Check className="size-5" /></span>
        <div>
          <h2 id="t-ultima" className="text-lg font-bold">Al día desde el {fecha(f.fecha)}</h2>
          <p className="text-[0.95rem] text-muted-foreground">
            {[nombrePrograma(f.programa), f.archivos?.length ? plural(f.archivos.length, 'archivo', 'archivos') : null, `${numero(inv.resumen.productos)} productos`, f.totales ? 'ventas totales del periodo' : `ventas del ${fecha(f.desde)} al ${fecha(f.hasta)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        {f.filasVenta ? <Dato titulo="Filas de ventas" valor={numero(f.filasVenta)} /> : null}
        <Dato titulo="Semanas de historia" valor={numero(Math.floor(f.semanas))} />
        <Dato titulo="Meses de proyecto recortados" valor={numero(inv.resumen.picosRecortados)} />
        <Dato titulo="Productos nuevos" valor={numero(inv.resumen.productosNuevos)} />
      </div>
    </Tarjeta>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <span className="block text-[0.82rem] text-muted-foreground">{titulo}</span>
      <strong className="text-lg tabular-nums">{valor}</strong>
    </div>
  )
}

function SubirDemo({ inv }: { inv: Inventario | null }) {
  const [sistema, setSistema] = useState<string | null>(null)
  const programa = inv?.fuente.programa
  useEffect(() => {
    const ids: Record<string, string> = { 'Siigo Nube': 'siigo-nube', 'World Office': 'world-office', Helisa: 'helisa', Alegra: 'alegra' }
    if (programa && ids[programa]) setSistema(ids[programa])
  }, [programa])
  return (
    <div className="flex flex-col gap-5">
      <SelectorSistema valor={sistema} onCambio={setSistema} />
      <GuiaSistema id={sistema} />
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input bg-muted p-6 text-center">
        <strong>En la demo no se sube nada</strong>
        <span className="max-w-md text-[0.93rem] text-muted-foreground">Crea tu cuenta gratis y sube tus archivos tal como salen de tu programa: el panel queda con tus productos en un minuto.</span>
        <a href="/crear-cuenta" className="presionable mt-1 inline-flex min-h-10 items-center rounded-xl border border-primary bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover">Crear mi cuenta</a>
      </div>
    </div>
  )
}

type Tiempos = { entregas: Record<string, number>; entregaPorDefecto: number; cadaCuanto: number }
type Prefijo = { prefijo: string; proveedor: string }

function Proveedores({ inv }: { inv: Inventario }) {
  const { guardarAjustes } = useInventario()
  const inicial = (): Tiempos => ({
    entregas: { ...Object.fromEntries(inv.proveedores.filter((p) => p.nombre !== 'Sin proveedor').map((p) => [p.nombre, p.entrega])), ...inv.ajustes.entregas },
    entregaPorDefecto: inv.ajustes.entregaPorDefecto,
    cadaCuanto: inv.ajustes.cadaCuanto,
  })
  const [aj, setAj] = useState<Tiempos>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const cambiado = JSON.stringify(aj) !== JSON.stringify(inicial())

  useEffect(() => setAj(inicial()), [inv]) // eslint-disable-line react-hooks/exhaustive-deps

  function mover(nombre: string, delta: number) {
    setGuardado(null)
    setAj((a) => {
      const actual = nombre === '*' ? a.entregaPorDefecto : a.entregas[nombre] ?? a.entregaPorDefecto
      const nuevo = Math.min(26, Math.max(0.5, Math.round((actual + delta) * 2) / 2))
      return nombre === '*' ? { ...a, entregaPorDefecto: nuevo } : { ...a, entregas: { ...a.entregas, [nombre]: nuevo } }
    })
  }

  async function guardar(extra: Partial<{ prefijos: Prefijo[] }> = {}, mensaje = 'Listo: el panel y el pedido ya usan estos tiempos.') {
    setGuardando(true)
    try {
      await guardarAjustes({ ...aj, ...extra })
      setGuardado(mensaje)
    } finally {
      setGuardando(false)
    }
  }

  const nombres = Object.keys(aj.entregas).sort((a, b) => {
    const pa = inv.proveedores.find((p) => p.nombre === a)?.productos ?? 0
    const pb = inv.proveedores.find((p) => p.nombre === b)?.productos ?? 0
    return pb - pa || a.localeCompare(b, 'es')
  })
  const sinProveedor = inv.resumen.sinProveedor

  return (
    <Tarjeta aria-labelledby="t-prov" className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 id="t-prov" className="text-xl font-bold">¿Cuánto tarda cada proveedor?</h2>
        <p className="mt-1 text-[0.95rem] text-muted-foreground">Desde que pides hasta que llega a tu bodega. Con esto sabemos qué pedir antes de que sea tarde.</p>
      </div>
      <ul className="flex flex-col">
        {nombres.map((nombre) => {
          const info = inv.proveedores.find((p) => p.nombre === nombre)
          return (
            <FilaTiempo
              key={nombre}
              nombre={nombre}
              detalle={info ? `${plural(info.productos, 'producto', 'productos')}${info.pideYa ? ` · ${info.pideYa} para pedir ya` : ''}` : 'Todavía sin productos'}
              valor={aj.entregas[nombre] ?? aj.entregaPorDefecto}
              onMover={(d) => mover(nombre, d)}
            />
          )
        })}
        <FilaTiempo
          nombre={nombres.length ? 'Los demás' : 'Tu proveedor'}
          detalle={sinProveedor ? `${plural(sinProveedor, 'producto', 'productos')} sin proveedor` : 'Si aparece un producto sin proveedor'}
          valor={aj.entregaPorDefecto}
          onMover={(d) => mover('*', d)}
        />
        <li className="flex items-center gap-3 border-t border-[#f0f1ee] py-3">
          <div className="min-w-0 flex-1">
            <strong className="block text-[0.95rem]">Cada cuánto haces pedido</strong>
            <span className="text-[0.85rem] text-muted-foreground">Lo sugerido alcanza hasta el siguiente.</span>
          </div>
          <Contador valor={aj.cadaCuanto} etiqueta="cada cuánto pides" onMover={(d) => { setGuardado(null); setAj((a) => ({ ...a, cadaCuanto: Math.min(26, Math.max(1, a.cadaCuanto + d)) })) }} paso={1} />
        </li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Boton variante="primario" onClick={() => guardar()} disabled={!cambiado || guardando}>{guardando ? 'Recalculando…' : 'Guardar y recalcular'}</Boton>
        {!agregando && <Boton variante="fantasma" onClick={() => setAgregando(true)}><Plus /> Agregar proveedor</Boton>}
        {guardado && <span className="aparecer text-[0.93rem] font-semibold text-verde">{guardado}</span>}
      </div>
      {agregando && (
        <NuevoProveedor
          prefijos={inv.ajustes.prefijos}
          alCancelar={() => setAgregando(false)}
          alGuardar={async (nombre, semanasEntrega, prefijo) => {
            const entregas = { ...aj.entregas, [nombre]: semanasEntrega }
            setAj((a) => ({ ...a, entregas }))
            const prefijos = prefijo ? [...inv.ajustes.prefijos.filter((x) => x.prefijo !== prefijo.toUpperCase()), { prefijo, proveedor: nombre }] : inv.ajustes.prefijos
            setGuardando(true)
            try {
              await guardarAjustes({ ...aj, entregas, prefijos })
              setGuardado(prefijo ? `Listo: los códigos que empiezan por "${prefijo}" son de ${nombre}.` : `Listo: ${nombre} agregado. Asígnale productos desde su ficha.`)
              setAgregando(false)
            } finally {
              setGuardando(false)
            }
          }}
        />
      )}
      {inv.ajustes.prefijos.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[#f0f1ee] pt-3">
          <strong className="text-[0.9rem]">Por el comienzo del código</strong>
          <ul className="flex flex-wrap gap-2">
            {inv.ajustes.prefijos.map((x) => (
              <li key={x.prefijo} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1 pl-3 text-[0.85rem]">
                <span><strong>{x.prefijo}…</strong> → {x.proveedor}</span>
                <button
                  type="button"
                  aria-label={`Quitar la regla ${x.prefijo}`}
                  className="inline-flex size-6 items-center justify-center rounded-full hover:bg-card"
                  onClick={() => guardar({ prefijos: inv.ajustes.prefijos.filter((y) => y.prefijo !== x.prefijo) }, 'Listo: regla quitada.')}
                >
                  <Minus className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
  )
}

function NuevoProveedor({ prefijos, alGuardar, alCancelar }: { prefijos: Prefijo[]; alGuardar: (nombre: string, semanas: number, prefijo: string | null) => Promise<void>; alCancelar: () => void }) {
  const [nombre, setNombre] = useState('')
  const [tiempo, setTiempo] = useState(2)
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
          <Contador valor={tiempo} etiqueta="el tiempo del proveedor nuevo" onMover={(d) => setTiempo((t) => Math.min(26, Math.max(0.5, t + d)))} paso={0.5} />
        </div>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
          <span>Sus códigos empiezan por <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <input className={claseEntrada} value={prefijo} onChange={(e) => setPrefijo(e.target.value.slice(0, 30))} placeholder="Ej.: TOR-" />
        </label>
      </div>
      {ya && <p className="text-[0.85rem] text-ambar-texto">Ese comienzo ya es de {ya.proveedor}: se cambiará a este proveedor.</p>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" variante="primario" tamano="chico" disabled={!nombre.trim()}>Agregar</Boton>
        <Boton tamano="chico" variante="fantasma" onClick={alCancelar}>Cancelar</Boton>
      </div>
    </form>
  )
}

function FilaTiempo({ nombre, detalle, valor, onMover }: { nombre: string; detalle: string; valor: number; onMover: (d: number) => void }) {
  return (
    <li className="flex items-center gap-3 border-t border-[#f0f1ee] py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <strong className="block text-[0.95rem] leading-snug">{nombre}</strong>
        <span className="text-[0.85rem] text-muted-foreground">{detalle}</span>
      </div>
      <Contador valor={valor} etiqueta={`el tiempo de ${nombre}`} onMover={onMover} paso={0.5} />
    </li>
  )
}

function Contador({ valor, etiqueta, onMover, paso }: { valor: number; etiqueta: string; onMover: (d: number) => void; paso: number }) {
  return (
    <span className="flex items-center gap-2">
      <button type="button" aria-label={`Bajar ${etiqueta}`} onClick={() => onMover(-paso)} className="presionable inline-flex size-9 items-center justify-center rounded-lg border border-input bg-card hover:bg-muted"><Minus className="size-4" /></button>
      <span className="w-20 text-center">
        <strong className="text-[1.05rem] tabular-nums">{semanas(valor)}</strong>
        <span className="block text-xs text-muted-foreground">{valor === 1 ? 'semana' : 'semanas'}</span>
      </span>
      <button type="button" aria-label={`Subir ${etiqueta}`} onClick={() => onMover(paso)} className="presionable inline-flex size-9 items-center justify-center rounded-lg border border-input bg-card hover:bg-muted"><Plus className="size-4" /></button>
    </span>
  )
}

type Carga = { id: number; subidoEn: string; estado: string; pedidoId: number | null; productos: number | null; archivos: string[] }

function Historial({ inv }: { inv: Inventario | null }) {
  const { fuente } = useInventario()
  const [cargas, setCargas] = useState<Carga[] | null>(null)
  useEffect(() => {
    if (fuente.tipo === 'demo') {
      if (!inv) return
      const d = (dias: number) => new Date(new Date(`${inv.fuente.fecha}T13:00:00Z`).getTime() - dias * 86400000).toISOString()
      const a = inv.fuente.archivos || []
      setCargas([
        { id: 3, subidoEn: d(0), estado: 'ok', pedidoId: null, productos: inv.resumen.productos, archivos: a },
        { id: 2, subidoEn: d(14), estado: 'ok', pedidoId: 4, productos: inv.resumen.productos - 1, archivos: a },
        { id: 1, subidoEn: d(28), estado: 'ok', pedidoId: 3, productos: inv.resumen.productos - 2, archivos: a },
      ])
      return
    }
    api<{ cargas: Carga[] }>('GET', '/inventario/cargas').then((r) => setCargas(r.cargas)).catch(() => setCargas([]))
  }, [fuente.tipo, inv])

  if (!cargas || !cargas.length) return null
  const vigente = cargas.find((c) => c.estado === 'ok')
  return (
    <Tarjeta aria-labelledby="t-historial" className="flex flex-col p-5 sm:p-6">
      <h2 id="t-historial" className="mb-2 text-xl font-bold">Cargas anteriores</h2>
      <ul className="flex flex-col">
        {cargas.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[#f0f1ee] py-3 first:border-t-0">
            <strong className="w-full shrink-0 tabular-nums sm:w-60">{fechaHora(c.subidoEn)}</strong>
            <span className="min-w-0 flex-1 basis-full truncate text-foreground/85 sm:basis-auto">{c.archivos.join(' · ') || '—'}</span>
            <span className="text-[0.93rem] text-muted-foreground tabular-nums">{c.productos !== null ? `${numero(c.productos)} productos` : ''}{c.pedidoId ? ` · pedido #${c.pedidoId}` : ''}</span>
            <span className={c.id === vigente?.id ? 'rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground' : c.estado === 'ok' ? 'rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground/70' : 'rounded-full bg-rojo-fondo px-2.5 py-0.5 text-xs font-bold text-rojo-texto'}>
              {c.id === vigente?.id ? 'En uso' : c.estado === 'ok' ? 'Anterior' : 'No se pudo leer'}
            </span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  )
}
