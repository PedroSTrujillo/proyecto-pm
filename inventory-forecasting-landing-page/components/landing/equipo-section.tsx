import { ArrowLeftRight, BadgeCheck, BarChart3, Mail, UserPlus } from 'lucide-react'
import { SectionHeading } from './section-heading'

// Cuentas de empresa, perfiles y aprobación de Alpha 0.2 (docs/PLAN_ALPHA_02.md, SP6 y SP7). Sale
// de las entrevistas: el operativo carga y prepara, un líder revisa y aprueba, y las alertas
// llegan según el rol (Hitos 5 y 6 de docs/Retroalimentación Pruebas.md).
const roles = [
  {
    icon: ArrowLeftRight,
    title: 'Quien lleva la bodega',
    body: 'Lleva al día las entradas, ventas y conteos. Ve las existencias actualizadas y lo que se va a agotar.',
  },
  {
    icon: BarChart3,
    title: 'Quien prepara el pedido',
    body: 'Parte de lo sugerido, agrupado por proveedor, y modifica cada línea que haga falta. También controla el dinero quieto y los tiempos de entrega, mínimos y múltiplos de cada proveedor.',
  },
  {
    icon: BadgeCheck,
    title: 'Quien aprueba',
    body: 'Recibe el pedido para revisión, lo modifica si hace falta y lo aprueba o lo devuelve con un comentario. Cada cambio queda registrado con el nombre de quien lo hizo.',
  },
]

export function EquipoSection() {
  return (
    <section id="equipo" aria-labelledby="equipo-title" className="scroll-mt-20 border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          id="equipo-title"
          eyebrow="Para todo su equipo"
          title="Cada persona trabaja sobre el mismo inventario."
          description="Quien registra lo que entra y sale, quien prepara el pedido y quien lo aprueba entran con su propia cuenta a la misma empresa. Cada uno ve lo que necesita para su tarea."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {roles.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-background p-6">
              <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <r.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-semibold">{r.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{r.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex gap-4 rounded-2xl bg-secondary p-6 text-secondary-foreground">
            <Mail className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-semibold">Un boletín con lo que conviene atender</h3>
              <p className="mt-1 leading-relaxed">
                Llega por correo los días en que hay algo que decidir: qué pedir ya, qué se va a agotar y qué pedidos
                esperan aprobación. Cada persona elige qué avisos recibe y con qué frecuencia.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-2xl bg-secondary p-6 text-secondary-foreground">
            <UserPlus className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-semibold">Su equipo entra con una invitación</h3>
              <p className="mt-1 leading-relaxed">
                Quien administra la cuenta envía un enlace a cada persona. Al entrar, ve el inventario de la empresa con
                todo lo que ya se registró.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
