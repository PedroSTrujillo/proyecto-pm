import type { Metadata } from 'next'
import { Restablecer } from '@/components/app/cuenta-formularios'

export const metadata: Metadata = { title: 'Contraseña nueva · SINESC' }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <Restablecer token={token} />
}
