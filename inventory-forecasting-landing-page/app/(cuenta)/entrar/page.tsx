import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Entrar } from '@/components/app/cuenta-formularios'

export const metadata: Metadata = { title: 'Entrar · SINESC' }

export default function Page() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  )
}
