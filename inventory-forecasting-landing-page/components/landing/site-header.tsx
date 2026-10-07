import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from './logo'

const navLinks = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#metodo', label: 'El método' },
  { href: '#descuentos', label: 'Descuentos' },
  { href: '#precio', label: 'Precio' },
  { href: '#preguntas', label: 'Preguntas' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 md:px-6">
        <Logo />
        <nav aria-label="Principal" className="hidden md:block">
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
        <Link href="#piloto" className={cn(buttonVariants({ size: 'lg' }), 'px-4')}>
          Pedir piloto gratis
        </Link>
      </div>
    </header>
  )
}
