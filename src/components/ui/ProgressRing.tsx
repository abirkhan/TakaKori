import type { ReactNode } from 'react'

/**
 * Donut chart.
 *
 * One number, one ring. A ring answers "how much of the whole is this" in a
 * glance in a way a bar cannot, which makes it the right form for a share or a
 * completion ratio and the wrong form for comparing several values — use
 * `MonthlyTrend` for that.
 *
 * The ring is decorative: `role="img"` with a label that states the percentage
 * in words, and the exact figures rendered as text in the middle, so the value
 * is never conveyed by arc length alone.
 */
export function ProgressRing({
  value,
  label,
  caption,
  size = 208,
  stroke = 18,
  tone = 'brand',
  children,
}: {
  /** 0–1. Clamped, so an over-budget figure never draws past the track. */
  value: number
  /** Accessible description of what the ring measures. */
  label: string
  /** Eyebrow above the figure in the middle. */
  caption?: ReactNode
  tone?: 'brand' | 'sky' | 'amber' | 'rose' | 'violet' | 'teal'
  /** Outer diameter in px. Keep the content inside the middle third. */
  size?: number
  /** Track thickness in px. Thicker reads better on a low-density phone. */
  stroke?: number
  children?: ReactNode
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${Math.round(clamped * 100)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true" focusable="false">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          // The CSS variable rather than a `stroke-brand-600` utility: the token
          // re-points to a lighter step in dark mode, where the light-mode step
          // would be a dark green ring on a dark track — technically visible and
          // completely illegible.
          style={{ stroke: `var(--hue-${tone})` }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
        {caption && <p className="tk-eyebrow">{caption}</p>}
        {children ?? <p className="tk-money-lg">{Math.round(clamped * 100)}%</p>}
      </div>
    </div>
  )
}
