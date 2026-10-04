'use client'

/**
 * Segmented control.
 *
 * The pattern for two or three mutually exclusive options that a user switches
 * between constantly: income / expense / transfer, period presets. It is a
 * segmented control rather than a `<select>` because the choice is one the user
 * makes many times a session, and on a phone a select costs three taps to
 * reveal two visible options.
 *
 * The input is a real radio, visually hidden, wrapped in its own label. That is
 * not only an accessibility win — it is also what makes keyboard arrow-key
 * navigation and the Playwright suite work. See the note in
 * `e2e/flows.spec.ts`: a `sr-only` input cannot be driven with `check()`, and
 * `check({ force: true })` silently dispatches a click at coordinates where
 * nothing is painted, so React never sees the change.
 */
export function SegmentedControl<T extends string>({
  name,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  name: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange?: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div
      className={options.length > 3 ? 'tk-segment-scroll' : 'tk-segment'}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <label key={option.value} className="tk-segment-item" data-active={selected}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange?.(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
