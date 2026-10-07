'use client'

import { useId, useState } from 'react'
import { Icon } from './Icon'
import { fieldClass } from './button'

/**
 * Form fields.
 *
 * Every input in the app goes through one of these three. The reason is not
 * tidiness: a field's label, its error, and the control's `aria-invalid` and
 * `aria-describedby` have to agree, and hand-rolling that in eight forms is how
 * a validation message ends up visible to a sighted user and invisible to a
 * screen reader.
 *
 * Label above the control, always. A right-aligned label beside a field is
 * tidier on a desktop form and worse on a phone, where it either wraps or
 * squeezes the input.
 */

export function TextField({
  name,
  label,
  type = 'text',
  hint,
  error,
  money = false,
  className = '',
  ...rest
}: {
  name: string
  label: string
  type?: 'text' | 'email' | 'date' | 'number'
  hint?: React.ReactNode
  error?: string
  /** Display treatment for a taka figure. See `.tk-field-money`. */
  money?: boolean
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'type' | 'className'>) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="tk-label">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        name={name}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={money ? `${fieldClass()} tk-field-money` : fieldClass()}
      />
      {error ? (
        <p id={errorId} className="tk-field-error">
          {error}
        </p>
      ) : (
        hint && <p className="tk-caption">{hint}</p>
      )}
    </div>
  )
}

/**
 * Password field with a reveal toggle.
 *
 * A reveal toggle is a genuine accessibility feature, not a convenience:
 * retyping a password because you cannot see the last character is how a user
 * ends up locked out, and the field is a password field precisely when the
 * stakes are highest.
 */
export function PasswordField({
  name,
  label,
  hint,
  error,
  autoComplete,
  ...rest
}: {
  name: string
  label: string
  hint?: React.ReactNode
  error?: string
  autoComplete?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'type' | 'className'>) {
  const id = useId()
  const errorId = `${id}-error`
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="tk-label">
        {label}
      </label>
      <div className="relative">
        <input
          {...rest}
          id={id}
          name={name}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${fieldClass()} pr-11`}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          className="rounded-pill text-subtle hover:text-content absolute inset-y-0 right-1.5 grid w-9 place-items-center transition-colors"
        >
          <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      {error ? (
        <p id={errorId} className="tk-field-error">
          {error}
        </p>
      ) : (
        hint && <p className="tk-caption">{hint}</p>
      )}
    </div>
  )
}

export function SelectField({
  name,
  label,
  error,
  className = '',
  children,
  ...rest
}: {
  name: string
  label: string
  error?: string
  className?: string
  children: React.ReactNode
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'className'>) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="tk-label">
        {label}
      </label>
      <select
        {...rest}
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={fieldClass(true)}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="tk-field-error">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * A checkbox, for the one place this app needs one.
 *
 * **A real `<input type="checkbox">` at 22px, not a styled `<div>` with a hidden
 * input.** Rule 7 forbids any field computing under 16px — iOS zooms on focus and
 * never zooms back out, which leaves the tab bar sitting over the content and the
 * page scrollable sideways. That rule exists because `sr-only` inputs are the usual
 * way this goes wrong, so the honest way to satisfy it is to not hide the input at
 * all. A native checkbox also brings the platform's own keyboard and screen-reader
 * behaviour for free, which a `role="checkbox"` div would have to re-derive.
 *
 * The label wraps the input rather than sitting beside it with a `for`, so the
 * whole row is one tap target and the accessible name comes from the label text
 * without any `aria-labelledby` wiring.
 */
export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
  checked,
  onChange,
  value = 'on',
}: {
  name: string
  /** The visible label, and the input's accessible name. */
  label: string
  /** Optional second line explaining the consequence of ticking it. */
  hint?: string
  defaultChecked?: boolean
  /**
   * Controlled mode. Needed for exactly one caller: the Google button is outside
   * the sign-in `<form>`, so it cannot read the checkbox from `FormData` and has
   * to be told. Leaving both `checked` and `defaultChecked` unset keeps every
   * other caller uncontrolled.
   */
  checked?: boolean
  onChange?: (next: boolean) => void
  /** Sent when ticked. A checkbox posts nothing when unticked, so `remember`
      distinguishes "off" from "the field was missing". */
  value?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const controlled = checked !== undefined

  return (
    <div className="flex items-start gap-2.5">
      <input
        type="checkbox"
        id={id}
        name={name}
        value={value}
        defaultChecked={controlled ? undefined : defaultChecked}
        checked={controlled ? checked : undefined}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        aria-describedby={hint ? hintId : undefined}
        className="tk-check mt-0.5"
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="tk-body block">{label}</span>
        {hint && (
          <span id={hintId} className="tk-caption mt-0.5 block">
            {hint}
          </span>
        )}
      </label>
    </div>
  )
}
