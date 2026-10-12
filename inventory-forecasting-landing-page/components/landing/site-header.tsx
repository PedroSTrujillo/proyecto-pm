import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { URL_CREAR_CUENTA, URL_ENTRAR } from '@/lib/app'
import { cn } from '@/lib/utils'
import { Logo } from './logo'

const navLinks = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#calculo', label: 'El cálculo' },
  { href: '#calculadora', label: 'Pruébalo' },
  { href: '#precio', label: 'Precio' },
  { href: '#preguntas', label: 'Preguntas' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 md:px-6">
        <Logo />
        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-6 text-sm text-muted-foreground">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-4">
          <a href={URL_ENTRAR} className="hidden text-sm font-medium text-primary hover:text-primary-hover sm:inline">
            Entrar
          </a>
          <a href={URL_CREAR_CUENTA} className={cn(buttonVariants({ size: 'lg' }), 'px-4')}>
            Crear cuenta
          </a>
        </div>
      </div>
    </header>
  )
}
