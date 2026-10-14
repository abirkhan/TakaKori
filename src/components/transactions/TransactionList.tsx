'use client'

import { useState } from 'react'
import { deleteTransactionAction } from '@/actions/transactions'
import { Row } from '@/components/ui/Row'
import { Icon } from '@/components/ui/Icon'
import { amountClass } from '@/components/ui/button'
import { RowActionsSheet } from '@/components/ui/RowActionsSheet'
import { ConfirmDeleteSheet } from '@/components/ui/ConfirmDeleteSheet'
import { EditTransactionSheet } from './EditTransactionSheet'

/**
 * The transaction list.
 *
 * Client, because it owns the sheets: one per list, not one per row. Fifty rows
 * of closed `<dialog>` elements with a full edit form inside each is tens of
 * kilobytes of duplicated form markup in the initial HTML, to render exactly one
 * of them.
 *
 * Three sheets, one per state, so only one is ever mounted and open:
 * the row's action menu, the edit form, and the delete confirmation. Selecting
 * Edit from the menu swaps `acting` for `editing` in a single state transition
 * rather than stacking two dialogs.
 *
 * Rows arrive as display-ready strings rather than database values. The server
 * does all money conversion and formatting; this component decides which sheet
 * is open and nothing else. Passing raw `numeric` across the boundary would put
 * an arithmetic decision inside a client component, which is exactly what
 * `lib/money.ts` exists to prevent (ADR-004).
 */
export interface TransactionRowView {
  id: string
  /** A display string such as "৳1,234.56". Already formatted, never recomputed. */
  formattedAmount: string
  sign: string
  tone: 'income' | 'expense' | 'transfer'
  title: string
  subtitle: string
  occurredOn: string
  /**
   * "Today" / "Yesterday" / "9 Oct 2025" — the day this row belongs to, already
   * resolved in the user's timezone by the caller.
   *
   * **Carried rather than computed here** for the same reason the subtitle's date is:
   * only the caller holds `profiles.timezone`, and a `friendlyDayLabel` call inside
   * this component would need it threaded in or would fall back to the device's.
   */
  dayLabel: string
  /** The editable value for the sheet: a decimal string, per the Server Action. */
  editAmount: string
  description: string | null
}

type Open = { kind: 'actions' } | { kind: 'edit' } | { kind: 'delete' }

export function TransactionList({ rows }: { rows: TransactionRowView[] }) {
  const [selected, setSelected] = useState<TransactionRowView | null>(null)
  const [open, setOpen] = useState<Open | null>(null)

  const dismiss = () => setOpen(null)
  const select = (kind: Open['kind']) => () => setOpen({ kind })

  /**
   * Consecutive rows sharing a day under one header.
   *
   * **Relies on the caller's ordering, which is the database's** (`occurred_on desc,
   * id desc`). This does not sort: a second sort here could only disagree with the
   * server about order, and a list that groups by one order and displays another
   * puts a day's rows under the wrong heading.
   *
   * Each day is its own `<ul>` rather than one list with header rows, because a
   * heading inside a list is announced as an item. Separate lists also give the
   * header something to stick to while its own rows scroll under it.
   */
  const groups: { day: string; label: string; rows: TransactionRowView[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    // Keyed on `occurredOn`, not `dayLabel`: two different days can share a label
    // ("Today" in two timezones is one day here, but a label collision would
    // silently merge two headings if it were ever the grouping key).
    if (last && last.day === row.occurredOn) last.rows.push(row)
    else groups.push({ day: row.occurredOn, label: row.dayLabel, rows: [row] })
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.day}>
          {/*
            `sticky top-0` inside a scrolling page, so it parks just under the app
            bar rather than at the very top of the viewport where the header would
            cover it. `z-10` keeps the rows from painting over it; the surface is
            opaque because a translucent sticky header over a list of money is
            unreadable.
          */}
          <h3 className="tk-day-head sticky top-0 z-10">{group.label}</h3>
          <ul className="tk-card tk-list divide-hairline flex flex-col divide-y">
            {group.rows.map((row) => (
              <li key={row.id}>
                <Row
                  icon={
                    row.tone === 'transfer'
                      ? 'repeat'
                      : row.tone === 'income'
                        ? 'arrowDownLeft'
                        : 'arrowUpRight'
                  }
                  tone={row.tone === 'income' ? 'brand' : row.tone === 'transfer' ? 'sky' : 'rose'}
                  title={row.title}
                  titleAttribute={row.title}
                  subtitle={row.subtitle}
                  trailing={
                    <span className={amountClass(row.tone)}>
                      {row.sign}
                      {row.formattedAmount}
                    </span>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(row)
                        setOpen({ kind: 'actions' })
                      }}
                      className="tk-btn-icon"
                      aria-label={`Actions for ${row.title}`}
                    >
                      <Icon name="dots" size={18} />
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {selected && open?.kind === 'actions' && (
        <RowActionsSheet
          open
          onClose={dismiss}
          title={selected.title}
          subtitle={selected.subtitle}
          amount={
            <span className={amountClass(selected.tone)}>
              {selected.sign}
              {selected.formattedAmount}
            </span>
          }
          actions={[
            { label: 'Edit transaction', icon: 'pencil', run: select('edit') },
            {
              label: 'Delete transaction',
              icon: 'trash',
              tone: 'danger',
              run: select('delete'),
            },
          ]}
        />
      )}

      {selected && open?.kind === 'edit' && (
        <EditTransactionSheet
          open
          onClose={() => {
            setSelected(null)
            setOpen(null)
          }}
          transaction={{
            id: selected.id,
            type: selected.tone,
            amount: selected.editAmount,
            description: selected.description,
            occurred_on: selected.occurredOn,
            // The sheet's subtitle: which record is open. It was reached from an
            // action menu that named the record, but the menu is now closed, so
            // without this a user who picked the wrong row has no way to tell.
            title: selected.title,
          }}
        />
      )}

      {selected && open?.kind === 'delete' && (
        <ConfirmDeleteSheet
          open
          onClose={() => {
            setSelected(null)
            setOpen(null)
          }}
          action={deleteTransactionAction}
          kind="transaction"
          queueKind="transaction.delete"
          savedMessage="Transaction deleted."
          hidden={{ id: selected.id }}
          title="Delete this transaction?"
          description="This cannot be undone."
        >
          <div className="tk-card-flat">
            <p className="tk-body font-medium">{selected.title}</p>
            <p className="tk-caption mt-0.5">{selected.subtitle}</p>
            <p className={`tk-amount-lg mt-2 ${amountClass(selected.tone)}`}>
              {selected.sign}
              {selected.formattedAmount}
            </p>
          </div>
        </ConfirmDeleteSheet>
      )}
    </>
  )
}
