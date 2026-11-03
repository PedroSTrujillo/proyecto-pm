import { CuentasEquipo } from '@/components/app/cuentas-equipo'
import { SoloEquipo } from '@/components/app/solo-equipo'

export default function Page() {
  return (
    <SoloEquipo>
      <CuentasEquipo />
    </SoloEquipo>
  )
}
