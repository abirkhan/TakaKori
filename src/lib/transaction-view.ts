/**
 * Row view-models for transactions.
 *
 * Shared because `/dashboard` and `/transactions` render the same record through
 * the same `Row` component, and they were deriving the subtitle differently: the
 * dashboard showed the source account, the list showed the destination and
 * dropped the source. Two screens describing one transaction two ways is the
 * kind of drift that makes an app feel like several apps, and it is invisible in
 * any single screenshot.
 *
 * Everything here is presentation. Money crosses the server/client boundary as
 * a finished string (ADR-004) — no `numeric` is read here, and no arithmetic
 * happens here.
 */

/** The fields the subtitle depends on. Structural, so either query's row fits. */
export interface SubtitleSource {
  description: string | null
  type: 'income' | 'expense' | 'transfer'
  occurred_on: string
  category?: { name: string } | null
  account?: { name: string } | null
  counterparty_account?: { name: string } | null
}

/**
 * The row's date, in the form a person would say it.
 *
 * **This is presentation, so the caller supplies the label rather than this module
 * reaching for a clock.** The two screens that render these rows each already hold
 * `profiles.timezone` (it is what their ranges are resolved in), and a helper that
 * called `todayIn` itself would either need that timezone threaded in anyway or
 * would silently fall back to the device's — which is the exact bug `dates.ts`
 * exists to prevent, reintroduced one layer up.
 */
export interface SubtitleContext {
  /**
   * "Today" / "Yesterday" / "Fri, 9 Oct", in the user's timezone — or `null` when
   * the screen already shows the day somewhere it cannot scroll away.
   *
   * `null` is not a formatting shortcut. `/transactions` prints the day on a sticky
   * group header, and repeating it in every row underneath would say "Today" seven
   * times under a header that already says it.
   */
  dayLabel: string | null
}

/**
 * The second line of a transaction row: the day, plus one label.
 *
 * It used to be `date · category · account` — 24 characters before any of it
 * says anything useful. At 390px that truncated part-way through the *date*, so
 * the most valuable word on the line was the one that disappeared.
 *
 * Which second label is a judgement about what the row is already saying:
 *
 *   - **Transfer** — the destination. Which account received the money is the
 *     question a transfer row raises; the icon already says "transfer".
 *   - **Has a description** — the category. The description is the title, so the
 *     category is the one piece of context it does not carry.
 *   - **No description** — the account. The title *is* the category here, so
 *     repeating it would be noise and the account is what is left.
 *
 * **The date is passed in, already formatted.** It used to be interpolated from
 * `occurred_on` here, which put `2026-10-09` on every row in the app — a database
 * value in the one column that has to survive truncation at 390px. See
 * `SubtitleContext` for why the caller formats it.
 */
export function transactionSubtitle(t: SubtitleSource, ctx: SubtitleContext): string {
  /**
   * Joins the parts with ` · `, skipping the date when the caller has already
   * placed it. Building the list and joining once is what keeps a `null` date from
   * leaving a leading or trailing separator — the failure mode of interpolating
   * `day` directly, which is what this replaced.
   */
  const parts: string[] = []
  if (ctx.dayLabel) parts.push(ctx.dayLabel)

  if (t.type === 'transfer') {
    parts.push(`→ ${t.counterparty_account?.name ?? 'Unknown account'}`)
  } else if (t.description) {
    if (t.category?.name) parts.push(t.category.name)
  } else if (t.account?.name) {
    parts.push(t.account.name)
  }

  return parts.join(' · ')
}
