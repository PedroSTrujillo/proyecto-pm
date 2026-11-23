import { Actividad } from '@/components/app/actividad'
import { SoloRol } from '@/components/app/solo-rol'

export default function Page() {
  return (
    <SoloRol permite={['gerente']}>
      <Actividad />
    </SoloRol>
  )
}
