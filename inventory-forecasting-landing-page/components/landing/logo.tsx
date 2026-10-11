import Link from 'next/link'

// El monograma S de SINESC: el mismo ícono de la barra de la aplicación.
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="SINESC, inicio">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="7" className="fill-primary" />
        <path
          d="M22 9.5h-8.5a3.25 3.25 0 0 0 0 6.5h5a3.25 3.25 0 0 1 0 6.5H10"
          className="stroke-primary-foreground"
          fill="none"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>SINESC</span>
    </Link>
  )
}
