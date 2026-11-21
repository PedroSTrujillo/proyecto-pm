import { Empresa } from '@/components/app/empresa'
import { SoloRol } from '@/components/app/solo-rol'

export default function Page() {
  return (
    <SoloRol permite={['gerente', 'administrador']}>
      <Empresa />
    </SoloRol>
  )
}
