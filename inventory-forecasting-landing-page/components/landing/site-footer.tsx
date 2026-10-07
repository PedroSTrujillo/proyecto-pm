import Link from 'next/link'
import { URL_ENTRAR } from '@/lib/app'
import { Logo } from './logo'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-sm text-muted-foreground">Rotación de inventario para distribuidoras. Hecho en Colombia.</p>
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
              <Link href="#preguntas" className="hover:text-foreground">
                Preguntas
              </Link>
            </li>
            <li>
              <a href={URL_ENTRAR} className="hover:text-foreground">
                Entrar
              </a>
            </li>
          </ul>
        </nav>
        <p className="text-sm text-muted-foreground">© 2026 Rotación de inventario</p>
      </div>
    </footer>
  )
}
