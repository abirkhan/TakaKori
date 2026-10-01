/**
 * Recurrence prediction.
 *
 * Pure functions, no database and no React, because this is where the subtle
 * bugs live and where they are cheapest to catch.
 *
 * The central problem is month-end clamping. A rent payment anchored on the
 * 31st must fall on 28 February in a common year and 29 February in a leap
 * year. Two wrong behaviours are easy to write and both are harmful:
 *
 *   - clamping to 28 always, so a leap-year February loses a day
 *   - overflowing into March, so February shows no payment and the totals
 *     silently shift a month
 */

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurrenceRule {
  frequency: Frequency
  /** Every N periods. 1 = every period, 2 = fortnightly or bimonthly. */
  interval: number
  /** YYYY-MM-DD the series is anchored to. For monthly, sets the day of month. */
  anchorDate: string
  /** Inclusive null means open-ended. */
  endsOn?: string | null
}

export interface Occurrence {
  date: string
  /** True when the day of month was clamped, e.g. the 31st landing on the 28th. */
  clamped: boolean
}

/** Days in a month, month being 1-based. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function parse(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Add months, clamping the day to the target month's length. */
function addMonthsClamped(
  year: number,
  month: number,
  day: number,
  deltaMonths: number,
): { y: number; m: number; d: number; clamped: boolean } {
  // Normalise via the 1st so a day-of-31 does not overflow during the arithmetic.
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1))
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth() + 1
  const max = daysInMonth(y, m)
  const d = Math.min(day, max)
  return { y, m, d, clamped: d !== day }
}

/**
 * The next occurrence on or after `from`, or null if the series has ended.
 *
 * Walks forward from the anchor one period at a time. That is O(occurrences)
 * rather than clever arithmetic, which matters: a daily rule over ten years is
 * ~3,600 steps, trivially fast, and the naive version cannot get the clamping
 * or the interval arithmetic wrong. Correctness beats cleverness here.
 */
export function nextOccurrence(rule: RecurrenceRule, from: string): Occurrence | null {
  const anchor = parse(rule.anchorDate)
  const start = parse(from)

  if (rule.endsOn && rule.endsOn < from) return null

  // Cap the walk so a pathological rule cannot spin forever.
  const MAX_STEPS = 4000

  if (rule.frequency === 'daily' || rule.frequency === 'weekly') {
    const anchorTime = Date.UTC(anchor.y, anchor.m - 1, anchor.d)
    const fromTime = Date.UTC(start.y, start.m - 1, start.d)
    const unitMs = rule.frequency === 'daily' ? 86_400_000 : 7 * 86_400_000

    if (fromTime <= anchorTime) {
      if (rule.endsOn && rule.anchorDate > rule.endsOn) return null
      return { date: rule.anchorDate, clamped: false }
    }

    // Smallest integer step count such that anchor + steps*interval >= from.
    // Must be at least 1: rounding the elapsed interval count to zero would
    // return the anchor, which is by definition before `from`.
    const elapsedUnits = (fromTime - anchorTime) / unitMs
    const steps = Math.max(1, Math.ceil(elapsedUnits / rule.interval))
    const target = new Date(anchorTime + steps * rule.interval * unitMs)
    const ymd = toYmd(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate())

    return rule.endsOn && ymd > rule.endsOn ? null : { date: ymd, clamped: false }
  }

  if (rule.frequency === 'yearly') {
    if (from <= rule.anchorDate) {
      return { date: rule.anchorDate, clamped: false }
    }
    for (let years = 0; years <= MAX_STEPS; years++) {
      const step = years * rule.interval
      const candidate = addMonthsClamped(anchor.y, anchor.m, anchor.d, step * 12)
      const ymd = toYmd(candidate.y, candidate.m, candidate.d)
      if (ymd < from) continue
      return rule.endsOn && ymd > rule.endsOn ? null : { date: ymd, clamped: candidate.clamped }
    }
    return null
  }

  // monthly
  for (let steps = 0; steps <= MAX_STEPS; steps++) {
    const candidate = addMonthsClamped(anchor.y, anchor.m, anchor.d, steps * rule.interval)
    const ymd = toYmd(candidate.y, candidate.m, candidate.d)
    if (ymd < from) continue
    if (rule.endsOn && ymd > rule.endsOn) return null
    return { date: ymd, clamped: candidate.clamped }
  }
  return null
}

/**
 * The next `count` occurrences on or after `from`, oldest first.
 */
export function upcomingOccurrences(
  rule: RecurrenceRule,
  from: string,
  count = 6,
): Occurrence[] {
  const out: Occurrence[] = []
  let cursor = from

  for (let i = 0; i < count; i++) {
    const next = nextOccurrence(rule, cursor)
    if (!next) break
    out.push(next)
    // Step past this occurrence so the next call cannot return it again.
    cursor = addDays(next.date, 1)
  }

  return out
}

/** Occurrences already due but not yet posted. */
export function dueOccurrences(
  rule: RecurrenceRule,
  from: string,
  through: string,
  lastPostedOn: string | null,
): Occurrence[] {
  const all = upcomingOccurrences(rule, from, 60)
  return all.filter((o) => {
    if (o.date > through) return false
    // Idempotency: an occurrence already posted must never be offered again.
    if (lastPostedOn && o.date <= lastPostedOn) return false
    return true
  })
}

function addDays(ymd: string, delta: number): string {
  const { y, m, d } = parse(ymd)
  const t = new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000)
  return toYmd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export { addDays };