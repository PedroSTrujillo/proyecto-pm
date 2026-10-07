import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  eyebrow: string
  title: string
  description?: string
  id?: string
  className?: string
}

export function SectionHeading({ eyebrow, title, description, id, className }: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <p className="font-mono text-xs font-medium uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
