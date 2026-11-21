import { Reportes } from '@/components/app/reportes'
import { SoloRol } from '@/components/app/solo-rol'

export default function Page() {
  return (
    <SoloRol permite={['gerente', 'administrador']}>
      <Reportes />
    </SoloRol>
  )
}
