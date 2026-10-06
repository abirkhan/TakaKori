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
 * The second line of a transaction row: date, plus one label.
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
 */
export function transactionSubtitle(t: SubtitleSource): string {
  if (t.type === 'transfer') {
    return `${t.occurred_on} · → ${t.counterparty_account?.name ?? 'Unknown account'}`
  }
  if (t.description) {
    const label = t.category?.name
    return label ? `${t.occurred_on} · ${label}` : t.occurred_on
  }
  const account = t.account?.name
  return account ? `${t.occurred_on} · ${account}` : t.occurred_on
}
