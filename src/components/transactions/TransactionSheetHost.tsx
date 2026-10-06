'use client'

import type { Account, Category } from '@/lib/queries/reference'
import { useUrlSheet } from '@/components/ui/useUrlSheet'
import { AddTransactionSheet } from '@/components/transactions/AddTransactionSheet'

/**
 * Hosts the add-transaction sheet, keeping the URL in sync with it.
 *
 * Mounted on `/transactions` only, so the accounts and categories the form needs
 * are fetched on that one page rather than on every page of the app.
 *
 * The open state is read client-side from `?sheet=add` rather than passed down
 * as a prop. The server already knows the flag — but a client component that
 * receives its own open state as a prop and can also navigate has two sources of
 * truth, and the moment they disagree the sheet is stuck. Reading the URL
 * directly means there is one.
 */
export function TransactionSheetHost({
  accounts,
  categories,
  today,
}: {
  accounts: Account[]
  categories: Category[]
  today: string
}) {
  const sheet = useUrlSheet('add')

  return (
    <AddTransactionSheet
      accounts={accounts}
      categories={categories}
      today={today}
      open={sheet.open}
      onClose={sheet.close}
    />
  )
}
