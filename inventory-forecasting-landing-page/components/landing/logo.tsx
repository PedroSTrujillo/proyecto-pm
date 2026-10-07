import Link from 'next/link'
import { PackageCheck } from 'lucide-react'

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="Pedido Sugerido, inicio">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <PackageCheck className="size-4" aria-hidden="true" />
      </span>
      <span>Pedido Sugerido</span>
    </Link>
  )
}
