'use client'

// Datos: el último archivo, subir uno nuevo, cuánto tarda cada proveedor y el historial.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '@/lib/api'
import { duracion, fecha, fechaHora, numero, plural } from '@/lib/formato'
import { nombrePrograma } from '@/lib/sistemas'
import type { Inventario, RevisionCodigos } from '@/lib/tipos'
import { useInventario, useSesion } from './contexto'
import { CodigosQueNoCoinciden, GuiaSistema, SelectorSistema, SubirArchivos } from './subir'
import { Aviso, Boton, Cargando, Contador, ErrorLista, Tarjeta, Titulo, claseEntrada } from './ui'

export function Datos() {
  const { inventario, cargando, error, fuente } = useInventario()
  if (cargando) return <Cargando texto="Cargando sus datos…" />
  if (error) return <ErrorLista mensaje={error} />
  return <DatosCon inv={inventario} />
}

function DatosCon({ inv }: { inv: Inventario | null }) {
  const { fuente, recargar, perfil, respuesta } = useInventario()
  const { usuario, fijar } = useSesion()
  const demo = fuente.tipo === 'demo'
  // Un operador sube el archivo solo si quien administra se lo marcó (el servidor también lo exige).
  const puedeSubir = respuesta?.puedeSubir !== false
  const [listo, setListo] = useState<string | null>(null)
  const [codigos, setCodigos] = useState<RevisionCodigos | null>(null)

  return (
    <>
      <Titulo sub="El inventario es de su empresa y queda guardado. Súbalo de nuevo cuando quiera ponerlo al día.">Datos</Titulo>
      {!demo && (
        <Aviso tono="info" titulo="Dos formas de llevar el inventario, y se combinan">
          Suba el archivo de su programa contable (cada mes o cuando quiera) o registre las entradas y salidas de cada día en <Link href="/movimientos" className="font-semibold underline underline-offset-2">Movimientos</Link>. Lo registrado después de la fecha del archivo se suma encima. Lo que sugiere SINESC es tan bueno como sus datos: si pasan días sin registrar ventas ni entradas, las existencias y lo sugerido se quedan atrás.
        </Aviso>
      )}

      {inv && <UltimaCarga inv={inv} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Tarjeta aria-labelledby="t-subir" className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <h2 id="t-subir" className="text-xl font-bold">{inv ? 'Actualizar datos' : 'Suba su inventario'}</h2>
          {demo ? <SubirDemo inv={inv} /> : !puedeSubir ? (
            <p className="text-cuerpo text-muted-foreground">Pídale a quien administra la empresa que le dé permiso para subir datos. Mientras tanto puede registrar las entradas y salidas del día en <Link href="/movimientos" className="font-semibold text-primary underline underline-offset-2">Movimientos</Link>.</p>
          ) : (
            <>
              {listo && <Aviso tono="ok">{listo}</Aviso>}
              {codigos && codigos.totalSoloVentas > 0 && <CodigosQueNoCoinciden codigos={codigos} />}
              <SubirArchivos
                base="/inventario/export"
                usuario={usuario}
                alGuardarSistema={fijar}
                alTerminar={(r) => {
                  setListo(`Listo: leímos ${plural(r.resumen?.productos ?? 0, 'producto', 'productos')}. El panel ya está al día.`)
                  setCodigos(r.codigos ?? null)
                  recargar()
                }}
              />
            </>
          )}
        </Tarjeta>
        {inv && perfil === 'operador' && (
          <Tarjeta className="flex min-w-0 flex-col gap-2 p-5 sm:p-6">
            <h2 className="text-xl font-bold">Ajustes de su empresa</h2>
            <p className="text-cuerpo">Un producto se va a agotar si alcanza para menos de <strong>{duracion(inv.umbrales.seAgota)}</strong>. Si el proveedor no está dicho, se asume que tarda <strong>{duracion(inv.ajustes.entregaPorDefecto)}</strong>, y se pide cada <strong>{duracion(inv.ajustes.cadaCuanto)}</strong>.</p>
            <p className="text-chico text-muted-foreground">Los tiempos de cada proveedor y estos ajustes los cambia quien administra la empresa.</p>
          </Tarjeta>
        )}
        {inv && perfil !== 'operador' && (
          <div className="flex min-w-0 flex-col gap-5">
            <UmbralAgota inv={inv} />
          </div>
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
          <h2 id="t-ultima" className="text-lg font-bold">Archivo subido el {fecha(f.fecha)}</h2>
          <p className="text-cuerpo text-muted-foreground">
            {[nombrePrograma(f.programa), f.archivos?.length ? plural(f.archivos.length, 'archivo', 'archivos') : null, `${numero(inv.resumen.productos)} productos`, f.totales ? 'ventas totales del periodo' : `ventas del ${fecha(f.desde)} al ${fecha(f.hasta)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        {f.filasVenta ? <Dato titulo="Filas de ventas" valor={numero(f.filasVenta)} /> : null}
        <Dato titulo="Semanas de ventas en el archivo" valor={numero(Math.floor(f.semanas))} />
        <Dato titulo="Meses fuera de lo normal (recortados)" valor={numero(inv.resumen.picosRecortados)} />
        <Dato titulo="Productos que empezaron hace poco" valor={numero(inv.resumen.productosNuevos)} />
      </div>
    </Tarjeta>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <span className="block text-nota text-muted-foreground">{titulo}</span>
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
        <span className="max-w-md text-chico text-muted-foreground">Cree su cuenta y suba los archivos de su programa contable tal como salen.</span>
        <a href="/crear-cuenta" className="presionable mt-1 inline-flex min-h-10 items-center rounded-xl border border-primary bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover">Crear mi cuenta</a>
      </div>
    </div>
  )
}

// Con cuántas semanas un producto sale como "se agota". Lo usan el panel, la lista de productos
// y el reporte de los archivos que suba de aquí en adelante; los reportes anteriores no cambian.
function UmbralAgota({ inv }: { inv: Inventario }) {
  const { guardarAjustes } = useInventario()
  const [valor, setValor] = useState(inv.umbrales.seAgota)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState<string | null>(null)

  useEffect(() => setValor(inv.umbrales.seAgota), [inv])

  async function guardar() {
    setGuardando(true)
    try {
      await guardarAjustes({ semanasAgota: valor })
      setGuardado('Listo: el panel ya usa este número.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Tarjeta aria-labelledby="t-umbral" className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 id="t-umbral" className="text-xl font-bold">¿Cuándo avisar que algo se agota?</h2>
        <p className="mt-1 text-cuerpo text-muted-foreground">Si a un producto le queda menos tiempo que esto, sale como «se agota». Si no lo cambia, son {duracion(2)}.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <strong className="block text-cuerpo">Avisar con menos de</strong>
          <span className="text-nota text-muted-foreground">Los pedidos que ya hizo se quedan como los vio.</span>
        </div>
        <Contador valor={valor} etiqueta="el tiempo para avisar" unidad="tiempo" onMover={(d) => { setGuardado(null); setValor((v) => Math.min(11, Math.max(1, v + d))) }} paso={1} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Boton variante="primario" onClick={guardar} disabled={valor === inv.umbrales.seAgota || guardando}>{guardando ? 'Recalculando…' : 'Guardar y recalcular'}</Boton>
        {guardado && <span className="aparecer text-chico font-semibold text-verde">{guardado}</span>}
      </div>
    </Tarjeta>
  )
}

type Carga = { id: number; subidoEn: string; estado: string; pedidoId: number | null; productos: number | null; archivos: string[]; subidoPor?: string | null }

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
            <span className="text-chico text-muted-foreground tabular-nums">{c.productos !== null ? `${numero(c.productos)} productos` : ''}{c.pedidoId ? ` · pedido #${c.pedidoId}` : ''}{c.subidoPor ? ` · lo subió ${c.subidoPor}` : ''}</span>
            <span className={c.id === vigente?.id ? 'rounded-full bg-secondary px-2.5 py-0.5 text-nota font-bold text-secondary-foreground' : c.estado === 'ok' ? 'rounded-full bg-muted px-2.5 py-0.5 text-nota font-bold text-foreground/70' : 'rounded-full bg-rojo-fondo px-2.5 py-0.5 text-nota font-bold text-rojo-texto'}>
              {c.id === vigente?.id ? 'En uso' : c.estado === 'ok' ? 'Anterior' : 'No se pudo leer'}
            </span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  )
}
