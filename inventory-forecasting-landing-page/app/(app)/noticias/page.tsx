import { Noticias } from '@/components/app/noticias'
import { SoloRol } from '@/components/app/solo-rol'

export default function Page() {
  return (
    <SoloRol permite={['gerente']}>
      <Noticias />
    </SoloRol>
  )
}
