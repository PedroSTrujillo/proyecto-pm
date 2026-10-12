import { Suspense } from 'react'
import { PedidoFlujo } from '@/components/app/pedido-flujo'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <PedidoFlujo id={Number(id)} />
    </Suspense>
  )
}
