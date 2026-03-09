import type { PropsWithChildren, ReactNode } from 'react'
import { cn } from '../utils'

type CatalogPageProps = PropsWithChildren<{
  title: string
  description: string
  className?: string
}>

export function CatalogPage({
  title,
  description,
  className,
  children
}: CatalogPageProps): ReactNode {
  return (
    <div className={cn('min-h-screen bg-background text-foreground', className)}>
      <div className="mx-auto flex max-w-7xl flex-col gap-8 p-8">
        <header className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            xNet Storybook
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm leading-6 text-foreground-muted">{description}</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

type CatalogSectionProps = PropsWithChildren<{
  title: string
  description?: string
  className?: string
}>

export function CatalogSection({
  title,
  description,
  className,
  children
}: CatalogSectionProps): ReactNode {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-foreground-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

type CatalogGridProps = PropsWithChildren<{
  columns?: 2 | 3
  className?: string
}>

export function CatalogGrid({ columns = 2, className, children }: CatalogGridProps): ReactNode {
  return (
    <div
      className={cn('grid gap-4', columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2', className)}
    >
      {children}
    </div>
  )
}

type CatalogCardProps = PropsWithChildren<{
  title: string
  description?: string
  className?: string
}>

export function CatalogCard({
  title,
  description,
  className,
  children
}: CatalogCardProps): ReactNode {
  return (
    <article
      className={cn(
        'rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm',
        className
      )}
    >
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs leading-5 text-foreground-muted">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </article>
  )
}

type InlinePreviewProps = PropsWithChildren<{
  className?: string
}>

export function InlinePreview({ className, children }: InlinePreviewProps): ReactNode {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-xl border border-dashed border-border/70 bg-background-subtle p-4',
        className
      )}
    >
      {children}
    </div>
  )
}
