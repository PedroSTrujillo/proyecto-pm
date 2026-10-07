import { SEMANAS_EJEMPLO, productoEjemplo } from '@/lib/ejemplo'
import { SEMANAS_SE_AGOTA, SEMANAS_SOBRA, numero, semanas, ventasSemana } from '@/lib/rotacion'

const ejemplo = productoEjemplo('TOR-0610')

const pieces = [
  {
    label: 'Semanas de ventas',
    body: 'Contamos desde la primera hasta la última fecha de tu archivo. Lo ideal es que traiga uno o dos años.',
    example: `${SEMANAS_EJEMPLO * 7} días = ${SEMANAS_EJEMPLO} semanas`,
  },
  {
    label: 'Ventas por semana',
    body: 'Todo lo que vendiste del producto en ese tiempo, dividido entre esas semanas. Las devoluciones se restan.',
    example: `${numero(ejemplo.vendido)} ÷ ${SEMANAS_EJEMPLO} = ${ventasSemana(ejemplo.promedioSemanal)}`,
  },
  {
    label: 'Semanas de inventario',
    body: 'Lo que tienes hoy dividido entre lo que vendes por semana. Si el producto está en varias bodegas, se suma todo.',
    example: `${numero(ejemplo.existencias)} ÷ ${ventasSemana(ejemplo.promedioSemanal)} = ${semanas(ejemplo.semanasInventario)}`,
  },
  {
    label: 'Se agota o sobra',
    body: `Menos de ${SEMANAS_SE_AGOTA} semanas: se agota y va arriba, en rojo. Más de ${SEMANAS_SOBRA} semanas, o sin ventas: sobra, en azul.`,
    example: `${semanas(ejemplo.semanasInventario)} → se agota`,
  },
]

export function MethodSection() {
  return (
    <section
      id="calculo"
      aria-labelledby="calculo-title"
      className="scroll-mt-20 bg-primary text-primary-foreground"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-secondary">El cálculo</p>
            <h2 id="calculo-title" className="mt-3 text-balance text-3xl font-bold tracking-tight md:text-4xl">
              Un número que puedes explicarle a tu jefe.
            </h2>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-primary-foreground/85">
              No hay fórmulas escondidas ni nada que configurar. Son dos divisiones con los datos de tu propio archivo,
              y en el reporte te mostramos la cuenta hecha con uno de tus productos.
            </p>
            <div className="mt-8 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-5">
              <p className="text-sm text-primary-foreground/75">¿Por qué usamos todo el histórico?</p>
              <p className="mt-2 leading-relaxed">
                Si un producto se vende una vez cada mes y medio y solo miras las últimas cuatro semanas, la mitad de
                las veces te va a salir en cero. Con un año de ventas eso casi no pasa, y no das por muerto algo que sí
                se mueve.
              </p>
            </div>
          </div>
          <ol className="flex flex-col gap-3">
            {pieces.map((piece, index) => (
              <li
                key={piece.label}
                className="grid gap-3 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-start sm:gap-5"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{piece.label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-primary-foreground/80">{piece.body}</p>
                </div>
                <span className="font-mono text-sm whitespace-nowrap text-secondary sm:text-right">{piece.example}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
