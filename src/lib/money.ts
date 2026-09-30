/**
 * Money handling.
 *
 * Why this module exists:
 *
 * PostgreSQL `numeric` crosses the PostgREST boundary as a JSON *string*:
 *   { "amount": "3500.00" }   ← not 3500, not 3500.00
 *
 * Naive arithmetic on that string silently produces garbage:
 *   "3500.00" + 100  ===  "3500.00100"   (string concatenation)
 *   "0.1" + "0.2"    ===  "0.10.2"       (not 0.3)
 *
 * Rules enforced here:
 *   1. Money crosses the app boundary as `Minor` (integer, safe in JS).
 *   2. All *aggregation* happens in SQL, never in JavaScript.
 *   3. Display formatting is the only place a decimal string is produced.
 *
 * BDT has 2 decimal places (poisha). Other currencies may differ, so the
 * scale lives in one place rather than being scattered through components.
 */
import Decimal from 'decimal.js'

/** Integer minor units. 3500.00 BDT is represented as 350000. */
export type Minor = number

/** Currency minor-unit exponent. BDT = 2, JPY = 0. */
export const CURRENCY_SCALE: Record<string, number> = {
  BDT: 2,
  INR: 2,
  PKR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
}

export function scaleFor(currency: string): number {
  return CURRENCY_SCALE[currency] ?? 2
}

/**
 * Parse a value from the database (string or number) into minor units.
 *
 * This is the ONLY safe entry point for money read from Postgres.
 */
export function toMinor(value: string | number | null | undefined): Minor {
  if (value === null || value === undefined || value === '') return 0
  return new Decimal(value).mul(10 ** scaleFor('BDT')).toDecimalPlaces(0).toNumber()
}

/**
 * Parse a user-entered amount (from a form field) into minor units.
 *
 * Rejects values that cannot be represented exactly, so a user never ends up
 * with a balance that is off by a poisha.
 */
export function parseAmount(input: string, currency = 'BDT'): Minor {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new MoneyError('Amount is required')
  }
  if (!/^-?\d*\.?\d*$/.test(trimmed)) {
    throw new MoneyError(`Amount "${input}" is not a valid number`)
  }

  const scale = scaleFor(currency)
  const decimal = new Decimal(trimmed).mul(10 ** scale)
  if (!decimal.isInteger()) {
    throw new MoneyError(
      `Amount "${input}" has more than ${scale} decimal places and cannot be stored exactly`,
    )
  }
  return decimal.toNumber()
}

/** Convert minor units back to the decimal string Postgres expects on insert. */
export function toNumericString(minor: Minor, currency = 'BDT'): string {
  const scale = scaleFor(currency)
  return new Decimal(minor).div(10 ** scale).toFixed(scale)
}

/** Sum minor units. Only for display/derived values — prefer SUM() in SQL. */
export function sumMinor(values: Minor[]): Minor {
  return values.reduce((total, value) => total + value, 0)
}

/** Subtract b from a, both in minor units. */
export function subtractMinor(a: Minor, b: Minor): Minor {
  return a - b
}

/**
 * Locale used for numeric formatting.
 *
 * `en-BD` looks like the obvious choice but is wrong. Node's ICU data has no
 * BDT symbol for it, so Intl silently falls back to `en` and produces
 * "BDT 125,000.00" — Western grouping, no taka sign.
 *
 * `bn-BD` carries the correct BDT symbol and South Asian grouping, but its
 * default digits are Bengali (১,২৫,০০০). Pinning numberingSystem to 'latn'
 * gives the target format: ৳ 1,25,000.00 with Latin digits.
 */
const DEFAULT_LOCALE = 'bn-BD'

/** Currency symbol per currency, since ICU lacks some of these. */
const SYMBOLS: Record<string, string> = {
  BDT: '৳',
  INR: '₹',
  PKR: 'Rs',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

export function formatMinor(
  minor: Minor,
  options: { currency?: string; locale?: string; withSymbol?: boolean } = {},
): string {
  const { currency = 'BDT', locale = DEFAULT_LOCALE, withSymbol = true } = options

  if (!Number.isFinite(minor)) {
    throw new MoneyError(`Cannot format non-finite amount: ${minor}`)
  }

  const scale = scaleFor(currency)
  const amount = new Decimal(minor).div(10 ** scale).toNumber()

  const digits = new Intl.NumberFormat(locale, {
    style: 'decimal',
    numberingSystem: 'latn',
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(Math.abs(amount))

  const sign = amount < 0 ? '−' : ''
  const symbol = withSymbol ? (SYMBOLS[currency] ?? `${currency} `) : ''

  return `${sign}${symbol}${digits}`
}

/**
 * Format with an explicit + / − sign, for transaction lists.
 *
 * Uses U+2212 MINUS SIGN rather than a hyphen, so negative amounts align
 * correctly in a monospace table.
 */
export function formatSignedMinor(minor: Minor, currency = 'BDT'): string {
  const sign = minor < 0 ? '−' : '+'
  return `${sign}${formatMinor(Math.abs(minor), { currency })}`
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}