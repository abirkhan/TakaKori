'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Account, Category } from '@/lib/queries/reference'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Icon } from '@/components/ui/Icon'
import { buttonClass } from '@/components/ui/button'

const PERIODS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
] as const

type PeriodValue = (typeof PERIODS)[number]['value']
type TypeValue = '' | 'income' | 'expense' | 'transfer'

const TYPES: readonly { value: TypeValue; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
]

/**
 * Filter bar.
 *
 * Filters live in the URL so a filtered view is shareable and survives a
 * refresh. Dates are computed in the user's timezone on the server, so the
 * client only sends a preset name, never a resolved boundary.
 *
 * Period and type are segmented controls and category/account are selects,
 * because that split is the point: a period is one of a handful of values the
 * user switches between constantly, while an account is a long list they look
 * up. Rendering both as dropdowns makes the common case three taps deep.
 *
 * There is no Apply button. Each change navigates immediately, because a
 * filter that needs confirming is a filter that is not being used.
 */
export function TransactionFilters({
  accounts,
  categories,
}: {
  accounts: Account[]
  categories: Category[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = (key: string) => searchParams.get(key) ?? ''

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('offset')
    // Wrapped in a transition so `pending` reflects the navigation and clears
    // itself when the route settles. A bare setState(true) here would latch the
    // whole filter bar into `disabled` after the first change, leaving the user
    // unable to set a second filter without a full reload.
    startTransition(() => {
      router.push(`/transactions?${params.toString()}`)
    })
  }

  /**
   * Back to no filters at all, as one navigation.
   *
   * `?sheet=` is dropped along with the filters, because a bare `/transactions`
   * navigation is what every other clear in this app links to — following the same
   * rule rather than carrying a sheet the user never opened through a reset.
   */
  function clearAll() {
    startTransition(() => {
      router.push('/transactions')
    })
  }

  /**
   * `Boolean` rather than the raw `||` chain, which yields the *last string* rather
   * than a boolean — and `useState` takes that string as its initial state, so the
   * panel would open as `''`, which is falsy, and the filter panel would be shut on
   * a filtered URL. Typed as a boolean so that mistake cannot compile.
   */
  const hasFilters = Boolean(
    current('preset') || current('type') || current('category') || current('account'),
  )

  /**
   * The chips that stand in for the collapsed panel.
   *
   * **A chip names its filter's value, not the filter.** "Expense" tells you what is
   * being shown; "Type: expense" tells you which control to go and change. The
   * label is omitted deliberately — on a 390px screen there is room for one idea per
   * chip, and the value is the part that is not guessable from context.
   *
   * Lookups go through the same lists the dropdowns are built from, so a chip can
   * never show a name the select does not offer, and both are fed by one query.
   */
  const chips: { label: string; onClear: () => void }[] = []

  /**
   * **A chip only appears for a filter that is actually set.**
   *
   * "All time" and "All" are the *default* values, carried as `''` — the segment's
   * own "no filter" option. A lookup by value finds them whether or not the user
   * chose anything, so the first version of this showed "All time" and "All" as
   * active chips on a completely unfiltered screen: two chips claiming filters that
   * did not exist, and a "clear" that would change nothing.
   *
   * So the empty value is excluded before the lookup, not after it. A chip here has
   * to mean "this is narrowing your list", which is false by definition for the
   * default.
   */
  const presetValue = current('preset') as PeriodValue
  const presetLabel = presetValue
    ? PERIODS.find((p) => p.value === presetValue)?.label
    : undefined
  if (presetLabel) chips.push({ label: presetLabel, onClear: () => update('preset', '') })

  const typeValue = current('type') as TypeValue
  const typeLabel = typeValue ? TYPES.find((t) => t.value === typeValue)?.label : undefined
  if (typeLabel) chips.push({ label: typeLabel, onClear: () => update('type', '') })

  const categoryId = current('category')
  const categoryName = categories.find((c) => c.id === categoryId)?.name
  if (categoryName) chips.push({ label: categoryName, onClear: () => update('category', '') })

  const accountId = current('account')
  const accountName = accounts.find((a) => a.id === accountId)?.name
  if (accountName) chips.push({ label: accountName, onClear: () => update('account', '') })

  /**
   * Open by default when filters are already active, closed when they are not.
   *
   * Someone arriving at a filtered URL wants to see what is filtering them — a
   * collapsed panel would hide the very state they navigated to find. Arriving with
   * nothing set, the panel is the thing in the way, so it starts out of the way.
   */
  const [open, setOpen] = useState(hasFilters)

  return (
    <section className="tk-card flex flex-col gap-3.5" aria-label="Filters">
      {/*
        One row: the disclosure, the active chips, and the way out of all of them.
        `flex-wrap` because three filters at 390px do not fit one line, and a chip row
        that overflows its card is the failure `.tk-segment-scroll` exists to avoid.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={buttonClass('quiet', { size: 'sm' })}
          aria-expanded={open}
          aria-controls="transaction-filter-panel"
        >
          <Icon
            name="chevronRight"
            size={15}
            className={open ? 'rotate-90 transition-transform' : 'transition-transform'}
          />
          Filters
        </button>

        {!open &&
          chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClear}
              className="tk-chip tk-chip-active"
              aria-label={`Remove the ${chip.label} filter`}
            >
              {chip.label}
              <Icon name="close" size={13} />
            </button>
          ))}

        {!open && hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="tk-caption text-accent font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {open && (
        <div id="transaction-filter-panel" className="flex flex-col gap-3.5">
      <SegmentedControl
        name="preset-filter"
        ariaLabel="Period"
        value={current('preset') as PeriodValue}
        options={PERIODS}
        onChange={(value) => update('preset', value)}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SegmentedControl
          name="type-filter"
          ariaLabel="Type"
          value={current('type') as TypeValue}
          options={TYPES}
          onChange={(value) => update('type', value)}
        />

        <label className="flex flex-col gap-1.5">
          <span className="tk-label">Category</span>
          <select
            value={current('category')}
            onChange={(e) => update('category', e.target.value)}
            disabled={pending}
            className="tk-field tk-select"
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="tk-label">Account</span>
          <select
            value={current('account')}
            onChange={(e) => update('account', e.target.value)}
            disabled={pending}
            className="tk-field tk-select"
          >
            <option value="">Any</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {open && hasFilters && (
        <button type="button" onClick={clearAll} className="tk-caption text-accent self-start font-medium">
          Clear filters
        </button>
      )}
        </div>
      )}
    </section>
  )
}

// Re-exported because consumers historically imported the type from here
// rather than from `@/types/database`. Prefer importing it from there.
export type { TransactionType } from '@/types/database'
