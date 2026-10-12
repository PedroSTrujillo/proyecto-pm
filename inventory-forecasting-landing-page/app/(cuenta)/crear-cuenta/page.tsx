import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CrearCuenta } from '@/components/app/cuenta-formularios'

export const metadata: Metadata = { title: 'Crear cuenta · SINESC' }

export default function Page() {
  return (
    <Suspense>
      <CrearCuenta />
    </Suspense>
  )
}
