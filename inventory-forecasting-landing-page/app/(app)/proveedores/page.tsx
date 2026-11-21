import { ProveedoresPantalla } from '@/components/app/proveedores'
import { SoloRol } from '@/components/app/solo-rol'

export default function Page() {
  return (
    <SoloRol permite={['gerente', 'administrador']}>
      <ProveedoresPantalla />
    </SoloRol>
  )
}
