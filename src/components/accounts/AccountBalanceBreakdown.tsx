'use client'

import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { getAccountBalances, getProfile, listAdjustments } from '@/lib/queries/client'
import { formatMinor, toMinor, type Minor } from '@/lib/money'
import type { Account } from '@/lib/queries/reference'

/**
 * Where an account's balance comes from, spelled out.
 *
 * **This exists because two numbers on this screen were different and neither said
 * so.** The row in the list shows a balance from `account_balances`. The field in the
 * sheet showed `opening_balance`. Verified against the real data: an account reading
 * ৳5,000.00 had `opening_balance` 0.00 and one transaction of +5,000.00. Both figures
 * were correct; only one was on screen, and it was not the one the field offered to
 * edit. A user comparing them sees an error, and edits the wrong number.
 *
 * So the sheet shows the arithmetic instead of the starting point:
 *
 *     balance today = opening balance + transactions + corrections
 *
 * **The opening balance comes from the account row the caller already holds**, not
 * from the balances view, which selects `balance` and does not include it. Reading a
 * column that is not in the result would have produced `undefined`, and `toMinor`
 * maps that to `0` — a line confidently reading ৳0.00 for an account that opened at
 * ৳5,000.00. A wrong figure that reconciles with the other two is the hardest kind to
 * notice, so the value is passed in rather than looked up.
 *
 * Each other line is a figure the database produced. The only arithmetic is one
 * subtraction between two of them, in integer minor units — not a sum over rows, which
 * is what the SQL-only rule is about. `toMinor` is exact, so the three lines reconcile
 * to the balance to the poisha.
 *
 * **From-transactions is derived by subtraction rather than re-queried.** Asking the
 * database for that total would mean a second read that could disagree with the first
 * under concurrent writes, and a breakdown that does not add up is worse than no
 * breakdown: it looks like the user made an arithmetic error.
 *
 * A correction is its own line rather than folded into "transactions" because it is not
 * one. That distinction is the whole reason `account_adjustments` is a separate table
 * (ADR-045), and hiding it here would put it back.
 */
export function AccountBalanceBreakdown({ account }: { account: Account }) {
  const profile = useQuery(keys.profile(), () => getProfile())
  const balances = useQuery(keys.balances(), () => getAccountBalances())
  const adjustments = useQuery(keys.adjustments(account.id), () => listAdjustments(account.id))

  const currency = profile.data?.currency ?? 'BDT'

  if (balances.loading || adjustments.loading) {
    return (
      <div className="tk-card-flat" aria-busy="true">
        <span className="tk-caption">Working out where this balance comes from…</span>
      </div>
    )
  }

  const row = balances.data?.find((b) => b.account_id === account.id)

  // No row means the view has not caught up or the read failed. Falling back to the
  // opening balance would show a plausible figure for an account that has moved; it is
  // better to admit the number is unavailable than to print one that looks real.
  if (!row) {
    return (
      <div className="tk-card-flat">
        <span className="tk-caption">This balance could not be loaded.</span>
      </div>
    )
  }

  const total: Minor = toMinor(row.balance)
  const opening: Minor = toMinor(account.opening_balance)
  const corrections: Minor = (adjustments.data ?? []).reduce((sum, a) => sum + toMinor(a.amount), 0)
  const fromTransactions: Minor = total - opening - corrections

  return (
    <div className="tk-card-flat flex flex-col gap-3">
      {/*
        The balance gets its own line, above the parts, rather than sharing a row with
        one of them.

        `.tk-money` is 2rem, which is a hero size, and a hero figure beside a 13px label
        in a `justify-between` row runs out of width at 320px: the sheet is 280px of
        content there, and `.tk-money` has no `white-space: nowrap`, so the figure wraps
        mid-number instead of overflowing — a total split across two lines, which reads
        as two numbers. Stacked, the figure has the full width and the parts below are
        small enough to share rows comfortably.
      */}
      <div className="flex flex-col" data-breakdown="total">
        <span className="tk-caption">
          Balance today
          {/* Read out for the same reason the parts are: it is the figure the other
              three lines add up to, which is not something a glance can work out. */}
          <span className="sr-only">. What this account holds now, including everything below.</span>
        </span>
        <span className="tk-money">{formatMinor(total, { currency })}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Line
          label="Opening balance"
          value={formatMinor(opening, { currency })}
          hint="What it started at."
        />
        <Line
          label="From transactions"
          value={formatMinor(fromTransactions, { currency })}
          hint="Income, spending and transfers in and out, all time."
        />
        {corrections !== 0 && (
          <Line
            label="Corrections"
            value={formatMinor(corrections, { currency })}
            hint="Recorded adjustments. Neither income nor spending."
          />
        )}
      </div>
    </div>
  )
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    /**
     * `data-breakdown` names the line so a test can find it by identity rather than by
     * its formatted text. Reading the number back out of `৳ 2,536.00` means stripping a
     * locale symbol and South Asian grouping before it can be compared — which is how
     * a formatting change becomes a spurious balance failure, and how a balance failure
     * hides behind a formatting change. The same convention as `[data-row-title]`.
     */
    <div className="flex items-baseline justify-between gap-3" data-breakdown={label}>
      <span className="tk-caption min-w-0">
        {label}
        {hint && <span className="sr-only">. {hint}</span>}
      </span>
      {/* `tk-amount-muted` is tabular with `nowrap`, so the figures align on the decimal
          and the column reads at a glance. A nowrap figure on the right of a `min-w-0`
          label is what keeps a long taka amount from pushing the row wide. */}
      <span className="tk-amount-muted">{value}</span>
    </div>
  )
}