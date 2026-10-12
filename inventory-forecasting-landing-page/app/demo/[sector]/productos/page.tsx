import { Suspense } from 'react'
import { Productos } from '@/components/app/productos'

export default function Page() {
  return (
    <Suspense>
      <Productos />
    </Suspense>
  )
}
