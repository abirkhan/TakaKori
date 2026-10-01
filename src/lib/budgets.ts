/**
 * Budget progress and pace.
 *
 * Pure functions so the arithmetic can be tested without a database or a clock.
 *
 * The interesting part is pace. A budget page that only shows "3,000 of 10,000
 * spent" is not actionable: someone who has spent half their monthly budget on
 * the 5th needs to know that, because the spend rate implies they will blow
 * through it. That projection is what makes a budget useful rather than
 * decorative.
 */

import type { Minor } from './money'

export interface BudgetProgress {
  /** Limit for the month, in minor units. */
  limit: Minor
  /** Spent so far this month, in minor units. */
  spent: Minor
  /** limit - spent. Negative when overspent. */
  remaining: Minor
  /** spent / limit as a percentage. 0 when limit is 0. */
  percentUsed: number
  /** Whether spend has passed the limit. */
  overspent: boolean
  /**
   * Projected spend if the current daily rate holds to the end of the month.
   * Null when there is not enough information (zero limit or no spend yet).
   */
  projected: Minor | null
  /** True when the projection exceeds the limit. */
  onTrackToOverspend: boolean
  /**
   * Average daily spend so far this month, in minor units per day.
   * Uses days elapsed, not days in the month, so the pace reflects where we are.
   */
  dailyRate: Minor
}

export interface BudgetProgressOptions {
  /** First day of the month, YYYY-MM-DD. */
  monthStart: string
  /** YYYY-MM-DD of "now" in the user's timezone. */
  today: string
  /** Total days in this month. */
  daysInMonth: number
}

/**
 * Compute progress and pace for one budget.
 *
 * `daysElapsed` runs from 1 to `daysInMonth`, never 0, so the daily rate is not
 * divided by zero on the first of the month.
 */
export function computeBudgetProgress(
  limit: Minor,
  spent: Minor,
  options: BudgetProgressOptions,
): BudgetProgress {
  // Inclusive of today: on 5 October, five days of the month have been lived
  // through, even though 5 October minus 1 October is only four. Counting
  // exclusively understates the daily rate and makes early-month pace look
  // safer than it is.
  const daysElapsed = daysBetween(options.monthStart, options.today) + 1
  // Clamp: a "today" from a stale client clock must not divide by zero or
  // produce a negative rate.
  const safeElapsed = Math.min(Math.max(daysElapsed, 1), options.daysInMonth)

  const remaining = limit - spent
  const percentUsed = limit > 0 ? (spent / limit) * 100 : 0
  const overspent = spent > limit

  const dailyRate = Math.round(spent / safeElapsed)

  // Projected only when there is a limit and some spending to project from.
  const projected = spent > 0 ? Math.round((spent / safeElapsed) * options.daysInMonth) : null

  return {
    limit,
    spent,
    remaining,
    percentUsed,
    overspent,
    projected,
    onTrackToOverspend: projected !== null && projected > limit,
    dailyRate,
  }
}

/** Whole days between two YYYY-MM-DD dates. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** First day of the month containing `ymd`. */
export function monthStartOf(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}
