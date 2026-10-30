import { cn } from '@/lib/utils'

export function AppLogo({
  className,
  label
}: {
  className?: string
  label?: string
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('shrink-0 text-status-success', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-app-logo="z"
      fill="currentColor"
    >
      <path d="M4 4h16v4L9 16h11v4H4v-4L15 8H4z" />
    </svg>
  )
}
