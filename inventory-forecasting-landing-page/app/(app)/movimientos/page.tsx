import { Suspense } from 'react'
import { Movimientos } from '@/components/app/movimientos'

export default function Page() {
  return (
    <Suspense>
      <Movimientos />
    </Suspense>
  )
}
