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

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * Shift a `YYYY-MM-DD` by whole days and return a `YYYY-MM-DD`.
 *
 * The arithmetic happens on calendar fields in the user's timezone rather than
 * on a millisecond offset. Subtracting 86,400,000 from an instant is wrong
 * twice a year: across a DST transition the result lands on the same day or
 * skips one, and "the last day of last month" is a figure a user will check.
 */
export function addDaysTo(ymd: string, days: number, timeZone: string): string {
  const [y, m, d] = ymd.split('-').map(Number)

  // Calendar-field arithmetic on a UTC date, then re-read in the target zone.
  // Adding 86,400,000 ms to the *instant* is the bug this avoids: across a DST
  // boundary that instant is 23 or 25 hours later, so the same arithmetic
  // returns the day you started on.
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  const ymdShifted = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`

  // `todayIn` is what actually pins the result to the user's calendar, which is
  // what makes this correct in every zone including the half-hour ones.
  return todayIn(timeZone, startOfDayIn(timeZone, ymdShifted))
}

/**
 * The month name for a `YYYY-MM-DD` or `YYYY-MM` string, e.g. "October".
 *
 * Display only. A screen that labels a figure "October" is claiming a period,
 * and the boundary of that period has to come from `resolveRange` — not from
 * formatting whatever date happened to be passed in. This function names a
 * month; it never decides one.
 */
export function monthLabel(ym: string): string {
  const month = Number(ym.slice(5, 7))
  return MONTH_NAMES[month - 1] ?? ''
}

/**
 * How far back a date still gets a friendly name before it falls back to a date.
 *
 * A week, not a month: "Fri, 9 Oct" is a useful label for a while after the fact,
 * and beyond that the reader is looking at history rather than recalling a day.
 */
const FRIENDLY_WINDOW_DAYS = 7

/**
 * The name a person would use for a day: "Today", "Yesterday", "Fri, 9 Oct".
 *
 * **Raw `occurred_on` is a database value, not a date a person wrote.** It shipped
 * onto every transaction row — `2026-10-09 · Food` — which is both unreadable and
 * needlessly long in the one column that has to truncate at 390px.
 *
 * Relative for the last week, because that is the range people actually scan: this
 * morning's expenses are "Today", and "Yesterday" needs no thought. Beyond the
 * window it becomes `formatDayLabel`, which is already the format used elsewhere.
 *
 * **Future dates are never "Today".** A recurring rule or a typo can put a
 * transaction in the future, and `days === 0` is reached by comparison rather than
 * by assuming the value is not ahead of today.
 *
 * All arithmetic is on calendar fields in the target timezone, via `addDaysTo` —
 * subtracting 86,400,000ms from an instant lands on the wrong day twice a year.
 */
export function friendlyDayLabel(ymd: string, timeZone: string, now: Date = new Date()): string {
  const today = todayIn(timeZone, now)
  if (ymd === today) return 'Today'

  const yesterday = addDaysTo(today, -1, timeZone)
  if (ymd === yesterday) return 'Yesterday'

  /**
   * Days *ahead* are outside the relative window — "in 3 days" would be a claim the
   * ledger cannot support — but they still carry the **year**.
   *
   * A future date is *more* ambiguous than a recent past one, not less: "Fri, 25 Dec"
   * read in October could be this December or the next, and the reader has no way to
   * tell. Returning the bare `formatDayLabel` here was a case the tests caught on the
   * way in, and it is the reason both branches below use `formatDayWithYear` rather
   * than one of each.
   */
  if (ymd > today) return formatDayWithYear(ymd, timeZone)

  /**
   * Within a week it reads as a day ("Fri, 9 Oct"), which is what someone scanning
   * recent spending is matching against. Past that it carries the year, because
   * "9 Oct" alone is genuinely ambiguous between this year and the last — the same
   * ambiguity that made the reports table's "Oct 26" unreadable.
   */
  return daysBetween(ymd, today, timeZone) <= FRIENDLY_WINDOW_DAYS
    ? formatDayLabel(ymd, timeZone)
    : formatDayWithYear(ymd, timeZone)
}

/**
 * A dated label that says which year, e.g. "9 Oct 2025".
 *
 * Separate from `formatDayLabel` rather than a flag on it: the two are never
 * interchangeable, and a boolean argument would let a call site pick the ambiguous
 * one by accident — which is the defect this exists to close.
 */
export function formatDayWithYear(ymd: string, timeZone: string): string {
  const [year, , day] = ymd.split('-').map(Number)
  const monthShort = new Intl.DateTimeFormat('en-GB', { timeZone, month: 'short' })
    .format(startOfDayIn(timeZone, ymd))
    .replace('Sept', 'Sep')
  // The month name comes from the formatter, so it agrees with `formatDayLabel`
  // across locales. The year and day are read off the calendar fields instead: a
  // `date` carries no zone, so its own digits are the truth, and re-deriving them
  // from an instant is how the weekday drifts by one either side of UTC.
  return `${day} ${monthShort} ${year}`
}

/**
 * Whole calendar days from `from` to `to`, both `YYYY-MM-DD` in `timeZone`.
 *
 * Sign follows the calendar, not the instant: `to` before `from` is negative.
 */
function daysBetween(from: string, to: string, timeZone: string): number {
  let days = 0
  let cursor = from
  // Bounded so a malformed value cannot spin here. A `date` column cannot hold one,
  // but this function is also reachable from a row whose value failed validation.
  for (let i = 0; i < 3660; i += 1) {
    if (cursor === to) return days
    if (cursor > to) return -days
    cursor = addDaysTo(cursor, 1, timeZone)
    days += 1
  }
  return days
}

/**
 * A short human date for a header or a row, e.g. "Sun, 4 Oct".
 *
 * Rendered in the user's timezone so the weekday matches the day they acted on.
 * Formatting a `YYYY-MM-DD` with the default timezone instead would show the
 * weekday of the neighbouring day for every user east or west of UTC — a bug
 * that is invisible in UTC and obvious in Dhaka.
 */
export function formatDayLabel(ymd: string, timeZone: string): string {
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
      .format(startOfDayIn(timeZone, ymd))
      // ICU's short month is "Sept" in en-GB and "Sep" elsewhere. Normalising
      // keeps a label from changing width between users' browsers — and, more to
      // the point, keeps the test honest: a literal expected string would pass on
      // the build machine's ICU and fail on a user's.
      .replace(/^(\w+)\s/, '$1, ')
      .replace('Sept', 'Sep')
  )
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
