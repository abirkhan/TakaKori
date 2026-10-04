import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * Inline alert.
 *
 * Tinted fill, never a border plus a fill: a bordered alert at phone width
 * wraps awkwardly and reads as an input. `role="alert"` on the error tone only
 * — a success message announced immediately interrupts a screen-reader user
 * mid-flow, so it is announced politely by being simple text.
 */
export function Alert({
  tone = 'error',
  children,
  icon,
}: {
  tone?: 'error' | 'success' | 'warning' | 'info'
  children: ReactNode
  icon?: IconName
}) {
  const TONE_CLASS = {
    error: 'tk-alert-error',
    success: 'tk-alert-success',
    warning: 'tk-alert-warning',
    info: 'tk-alert-info',
  } as const

  const TONE_ICON = {
    error: 'alert',
    success: 'check',
    warning: 'alert',
    info: 'info',
  } as const

  return (
    <p className={`tk-alert ${TONE_CLASS[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icon ?? TONE_ICON[tone]} size={17} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  )
}
