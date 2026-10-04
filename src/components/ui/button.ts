/**
 * Class-name helpers for the primitives in `globals.css`.
 *
 * These exist so the pairing — which variant goes with which size, and which
 * variants are block-level — is stated once. Passing `'tk-btn-primary'` around
 * by hand is how a screen ends up with a 32px-tall primary action next to a
 * 48px one, which is invisible in code review and obvious on a phone.
 *
 * Deliberately not a `<Button>` component: almost every button here submits a
 * Server Action from a Server Component, and a component wrapper would only add
 * a layer between the form and the action.
 */

export type ButtonVariant = 'primary' | 'soft' | 'quiet' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'tk-btn-primary',
  soft: 'tk-btn-soft',
  quiet: 'tk-btn-quiet',
  ghost: 'tk-btn-ghost',
  danger: 'tk-btn-danger',
}

export function buttonClass(
  variant: ButtonVariant = 'primary',
  options: { size?: 'md' | 'sm'; block?: boolean } = {},
): string {
  const { size = 'md', block = false } = options
  return [
    'tk-btn',
    VARIANTS[variant],
    size === 'sm' ? 'tk-btn-sm' : '',
    block ? 'tk-btn-block' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Inputs, selects and textareas. One class so a form cannot half-adopt. */
export function fieldClass(select = false): string {
  return select ? 'tk-field tk-select' : 'tk-field'
}

/**
 * Money with the right tone.
 *
 * `type` is the transaction type, and transfers are neither income nor expense
 * (ADR-005) — they get the neutral tone rather than being coerced into one of
 * the other two, which is what makes a transfer list misread as spending.
 */
export function amountClass(type: 'income' | 'expense' | 'transfer'): string {
  if (type === 'income') return 'tk-amount tk-income'
  if (type === 'expense') return 'tk-amount tk-expense'
  return 'tk-amount tk-neutral'
}

/** The sign that goes in front of a money figure in a list. */
export function amountSign(type: 'income' | 'expense' | 'transfer'): string {
  if (type === 'income') return '+'
  if (type === 'expense') return '−'
  return ''
}
