import { Suspense } from 'react'
import { Existencias } from '@/components/app/existencias'

export default function Page() {
  return (
    <Suspense>
      <Existencias />
    </Suspense>
  )
}
