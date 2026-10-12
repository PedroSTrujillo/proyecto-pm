import type { Metadata } from 'next'
import { Olvide } from '@/components/app/cuenta-formularios'

export const metadata: Metadata = { title: 'Olvidé mi contraseña · SINESC' }

export default function Page() {
  return <Olvide />
}
