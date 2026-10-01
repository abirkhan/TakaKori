/**
 * Date-range helpers.
 *
 * Every range is computed in the *user's* timezone, never UTC.
 *
 * Why this matters: a user in Asia/Dhaka (UTC+6) creating an expense at
 * 00:30 local time writes occurred_on = '2026-09-30'. If the dashboard then
 * computes "this month" with `new Date().toISOString()` in UTC, and the server
 * clock says 2026-09-29T19:00Z, the transaction falls into the previous month
 * and the user sees their expense missing from the current total.
 *
 * The same class of bug appears for India (UTC+5:30) and any US timezone.
 * `occurred_on` is a `date` (no time, no zone) precisely so that the user's
 * calendar day is preserved; these helpers convert that day into the correct
 * half-open range for querying.
 */

export type DateRangePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'

export interface DateRange {
  /** Inclusive start, as YYYY-MM-DD. */
  from: string
  /** Inclusive end, as YYYY-MM-DD. */
  to: string
}

/** Current calendar date in the given IANA timezone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the wire format we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Format a Date as YYYY-MM-DD in the given timezone. */
export function formatDateIn(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Resolve a preset to a concrete date range in the user's timezone.
 *
 * Ranges are inclusive on both ends, matching how `occurred_on` behaves.
 */
export function resolveRange(
  preset: DateRangePreset,
  timeZone: string,
  now: Date = new Date(),
  custom?: { from: string; to: string },
): DateRange | null {
  if (preset === 'all') return null

  if (preset === 'custom') {
    if (!custom) throw new Error('A custom range requires from and to dates')
    return { from: custom.from, to: custom.to }
  }

  if (preset === 'today') {
    const day = todayIn(timeZone, now)
    return { from: day, to: day }
  }

  // Get the offset parts in the target timezone so that arithmetic on
  // calendar fields happens in the user's frame of reference.
  const parts = calendarPartsIn(timeZone, now)

  if (preset === 'week') {
    // Weeks start on Saturday in Bangladesh. Deriving the weekday from the
    // calendar date is safe: a plain calendar day has no offset ambiguity.
    const dow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
    // getUTCDay: Sunday=0 ... Saturday=6. Remap so Saturday=0.
    const daysSinceStart = (dow + 1) % 7
    const start = addDays(parts, -daysSinceStart)
    return { from: start, to: formatDateIn(timeZone, now) }
  }

  if (preset === 'month') {
    const from = `${parts.year}-${pad(parts.month)}-01`
    const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
    const to = `${parts.year}-${pad(parts.month)}-${pad(lastDay)}`
    return { from, to }
  }

  if (preset === 'quarter') {
    // Calendar quarters: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec.
    const firstMonthOfQuarter = Math.floor((parts.month - 1) / 3) * 3 + 1
    const from = `${parts.year}-${pad(firstMonthOfQuarter)}-01`
    // Month index is 1-based here, so month 12 becomes month 0 of year+1.
    const lastDay = new Date(Date.UTC(parts.year, firstMonthOfQuarter + 2, 0)).getUTCDate()
    const to = `${parts.year}-${pad(firstMonthOfQuarter + 2)}-${pad(lastDay)}`
    return { from, to }
  }

  // 'year'
  return { from: `${parts.year}-01-01`, to: `${parts.year}-12-31` }
}

/**
 * The first day of the month N months before the month containing `reference`.
 *
 * Used to anchor a rolling window such as "last 6 months" without depending on
 * a database or on the exact day of the month.
 */
export function startOfMonthOffset(reference: string, monthsBack: number): string {
  const [y, m] = reference.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - monthsBack, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}

interface CalendarParts {
  year: number
  month: number
  day: number
}

function calendarPartsIn(timeZone: string, now: Date): CalendarParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

function addDays(parts: CalendarParts, delta: number): string {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day) + delta * 86_400_000
  const d = new Date(utc)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Convert a user-entered YYYY-MM-DD into a Date at the *start* of that day in
 * the user's timezone. Used for export/report boundaries, never for storage.
 */
export function startOfDayIn(timeZone: string, ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  // Construct in UTC then adjust by the zone's actual offset for that date,
  // which handles DST transitions correctly.
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
  const offset = zoneOffsetMs(timeZone, guess)
  return new Date(guess.getTime() - offset)
}

function zoneOffsetMs(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  return asUtc - date.getTime()
}
