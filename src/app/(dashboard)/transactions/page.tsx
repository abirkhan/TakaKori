import { TransactionData } from '@/components/transactions/TransactionData'

/**
 * Transactions.
 *
 * **The last screen whose figures came from the server.** With this, all seven
 * authenticated screens load their data in the browser, and the client data layer
 * covers every read in the app rather than six of seven.
 *
 * This file stays a Server Component so the route stays authenticated and
 * prerendered as a shell — the `tk-stack` and nothing else.
 *
 * **What is genuinely lost: the list no longer renders without JavaScript.** The
 * same trade as `/reports`, and the same reasoning. The header's Add link and
 * Export CSV are real `<a>` and `<Link>` elements and still work, and the sheets
 * are client components already. But the rows come from a query whose range is
 * resolved from the profile's timezone, and the profile is a browser read now —
 * so there is no honest way to render a list on the server without reintroducing
 * the duplicate profile read it was avoiding.
 *
 * Splitting the header out and leaving the rows behind would be worse than either
 * alternative: a screen titled "Transactions" with a period selector and no
 * transactions under it looks broken rather than unavailable.
 *
 * The pagination links are `<a>` elements carrying the current filters forward, so
 * paging is a real navigation and survives a slow bundle.
 */
export default function TransactionsPage() {
  return (
    <div className="tk-stack">
      <TransactionData />
    </div>
  )
}
