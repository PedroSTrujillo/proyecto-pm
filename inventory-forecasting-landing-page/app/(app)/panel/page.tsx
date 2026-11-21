import { Panel } from '@/components/app/panel'
import { SoloRol } from '@/components/app/solo-rol'

export default function Page() {
  return (
    <SoloRol permite={['gerente', 'administrador']}>
      <Panel />
    </SoloRol>
  )
}
