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
