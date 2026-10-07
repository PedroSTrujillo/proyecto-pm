import Link from 'next/link'
import { Logo } from './logo'

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-sm text-muted-foreground">Pronóstico de inventario para pymes. Hecho en Colombia.</p>
        </div>
        <nav aria-label="Pie de página">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="#como-funciona" className="hover:text-foreground">
                Cómo funciona
              </Link>
            </li>
            <li>
              <Link href="#precio" className="hover:text-foreground">
                Precio
              </Link>
            </li>
            <li>
              <Link href="mailto:hola@pedidosugerido.co" className="hover:text-foreground">
                hola@pedidosugerido.co
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-sm text-muted-foreground">© 2026 Pedido Sugerido</p>
      </div>
    </footer>
  )
}
