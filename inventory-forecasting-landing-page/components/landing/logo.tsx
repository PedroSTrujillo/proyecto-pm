import Link from 'next/link'

// El mismo ícono de la barra de la aplicación.
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="SINESC, inicio">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="7" className="fill-primary" />
        <path d="M8 22h4v-6H8zm6 0h4V10h-4zm6 0h4v-9h-4z" className="fill-primary-foreground" />
      </svg>
      <span>SINESC</span>
    </Link>
  )
}
