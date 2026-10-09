'use client'

/**
 * Cache keys, in one place, and what each write invalidates.
 *
 * ## Why this file exists
 *
 * `revalidatePath('/dashboard')` had an obvious translation. The client has none:
 * a Server Action named the *routes* it dirtied, and the client has to name the
 * *reads*. Getting that list wrong is the worst bug available in this codebase,
 * because it is ADR-012's bug — a balance that reads −10,499 instead of 69,501
 * while every individual number looks entirely plausible — reached from the other
 * direction. Nothing crashes. Nothing is `null`. A figure is simply a number from
 * before the write.
 *
 * So the mapping is written down here rather than rediscovered per action, and
 * `invalidations.test.ts` asserts properties about it rather than examples of it.
 *
 * ## Prefix matching, not exact keys
 *
 * `invalidate()` matches by `startsWith`. Every key is therefore built as
 * `entity:qualifier…`, so a write can clear "every transaction read" without
 * knowing how many page sizes, filters or ranges exist. `assertKeyShape` in the
 * test file enforces the shape, because a key like the bare `'balances'` would
 * silently never match a prefix.
 *
 * ## The rule for adding a key
 *
 * If a read shows money, it names a table that a write can change, and it starts
 * with that table's prefix. If it does not, it is a reference list — accounts,
 * categories — and only the write that changes *that list* invalidates it.
 */

/** The tables a cached read can be derived from. */
export type Entity =
  'profile' | 'accounts' | 'categories' | 'transactions' | 'totals' | 'budgets' | 'recurring'

/**
 * The cache key prefix for an entity. Everything else in the key is a qualifier.
 *
 * `profile` is the one exception with no colon, because it is a single record
 * rather than a family of reads, and nothing ever invalidates it implicitly —
 * it is rewritten by the read itself.
 */
export const PREFIX = {
  profile: 'profile',
  accounts: 'accounts:',
  categories: 'categories:',
  transactions: 'transactions:',
  totals: 'totals:',
  budgets: 'budgets:',
  recurring: 'recurring:',
} as const satisfies Record<Entity, string>

/**
 * The four reads behind `/reports`.
 *
 * Named rather than open-ended so a typo in a call site is a type error instead of
 * a cache key nothing else will ever read — which is a stale figure waiting to
 * happen.
 */
export type ReportKind = 'summary' | 'monthly' | 'expenseByCategory' | 'incomeByCategory'

export const keys = {
  /** Written by the read that fetches it; never invalidated implicitly. */
  profile: (): string => PREFIX.profile,

  accounts: (includeArchived = false): string => `${PREFIX.accounts}list:${includeArchived}`,

  /**
   * Balances come from the `account_balances` view, so they are affected by
   * transactions *and* by creating, archiving or editing an account. It is a
   * figure, so it is namespaced under `accounts:` rather than being a bare key.
   */
  balances: (): string => `${PREFIX.accounts}balances`,

  /**
   * Corrections against one account.
   *
   * Under `accounts:` rather than a new prefix because of the rule at the top of this
   * file: it shows money, a write changes it, and the write is an account write —
   * `WRITES.account` already carries `PREFIX.accounts`, so recording or removing a
   * correction clears the balance *and* this list in one call. A separate `adjustments:`
   * prefix would have meant updating both, and the failure mode of forgetting is the
   * ADR-012 one: the balance moves and the ledger beside it still shows the old row.
   */
  adjustments: (accountId: string): string => `${PREFIX.accounts}adjustments:${accountId}`,

  categories: (type?: string): string => `${PREFIX.categories}list:${type ?? 'all'}`,

  transactions: (qualifier: string): string => `${PREFIX.transactions}${qualifier}`,

  /**
   * The `/transactions` list, keyed by every input its query depends on.
   *
   * **This takes an object rather than a qualifier string, and that is the whole
   * point.** The list is the one read in this app with eight independent inputs —
   * timezone, both ends of the range, four filters, page size and offset. Pass
   * them as positional arguments and nothing catches a forgotten one: `offset` is
   * the last, so it is the one that gets dropped, and then page 2 is served page
   * 1's rows. Nothing looks wrong. The heading says "Latest 50", the rows are
   * plausible, and the user is looking at transactions they already saw — the
   * ADR-012 shape again, reached by paging.
   *
   * With an object, omitting `offset` is a type error. There is no ordering to get
   * wrong and no way to silently leave one input out.
   *
   * `timezone` is carried rather than derived because the range it produces is the
   * user's, not the server's (ADR-006): the same `?preset=month` is a different
   * range in Dhaka than in London, and the key has to say which one was used.
   *
   * Absent values are written as `any` rather than `*`, because `*` is the prefix
   * `invalidate()` matches on and a wildcard sitting inside a key is a trap for
   * whoever reads this next.
   */
  transactionList: (input: {
    timezone: string
    from?: string
    to?: string
    type?: string
    categoryId?: string
    accountId?: string
    limit: number
    offset: number
  }): string => {
    const part = (v: string | undefined) => v ?? 'any'
    return [
      `${PREFIX.transactions}list`,
      part(input.timezone),
      `${part(input.from)}..${part(input.to)}`,
      part(input.type),
      part(input.categoryId),
      part(input.accountId),
      `n${input.limit}`,
      `o${input.offset}`,
    ].join(':')
  },

  /**
   * Keyed by timezone as well as range, because two ranges computed in different
   * zones are different ranges — a transaction filed at 00:30 local belongs to a
   * different month in Dhaka than in London (ADR-006).
   */
  totals: (timezone: string, from: string, to: string): string =>
    `${PREFIX.totals}${timezone}:${from}..${to}`,

  /**
   * One of the Reports screen's four aggregates, over the same range.
   *
   * Lives under `totals:` so a transaction write clears it, and carries `kind` so
   * it cannot collide with `keys.totals`. The two are genuinely different reads of
   * the same range — `keys.totals` is the dashboard's workspace total, this is
   * `getPeriodSummary` / `getMonthlyTotals` / a category breakdown — and sharing a
   * key would make whichever mounted last overwrite the other.
   */
  report: (timezone: string, from: string, to: string, kind: ReportKind): string =>
    `${PREFIX.totals}report:${kind}:${timezone}:${from}..${to}`,

  budgets: (qualifier: string): string => `${PREFIX.budgets}${qualifier}`,

  recurring: (qualifier: string): string => `${PREFIX.recurring}${qualifier}`,
}

/**
 * Which cached reads each write makes wrong.
 *
 * Read this as "what could now be a different number or a different list".
 *
 * The one that is easy to miss is `budgets:` on a **transaction** write. Budget
 * progress is `expense_by_category_for_range` over the month to date, so a
 * purchase changes what a budget has spent. Forget it and a budget reads as
 * under-spent for the rest of the session — which reads as good news, and is the
 * most reassuring way to be wrong.
 *
 * `recurring:` is *not* in the transaction entry, and deliberately so. Posting an
 * occurrence changes the watermark, and the recurring list renders "due" from
 * that. It does need invalidating — see `WRITES.occurrence` rather than folding
 * it in, because posting is a distinct write from editing a rule and conflating
 * them hides which is which.
 */
export const WRITES = {
  /** Create, edit or delete a transaction. */
  transaction: [PREFIX.transactions, PREFIX.accounts, PREFIX.totals, PREFIX.budgets],

  /**
   * Posting an occurrence of a recurring rule. Separated from `recurring` because
   * it moves the watermark, which changes what the recurring list shows as *due* —
   * a different question from "the rule's definition changed".
   */
  occurrence: [
    PREFIX.transactions,
    PREFIX.accounts,
    PREFIX.totals,
    PREFIX.budgets,
    PREFIX.recurring,
  ],

  /** Create or edit an account. `balances` lives under `accounts:`. */
  account: [PREFIX.accounts],

  /**
   * A category rename or deletion. Only the category *list* changes — a category
   * does not move any figure, because totals come from the transaction rows and
   * not from a join through the category's current name.
   */
  category: [PREFIX.categories],

  /** Create or delete a budget. Progress is derived, so the view is cached too. */
  budget: [PREFIX.budgets],

  /** Create, edit or delete a rule. Does not touch any figure. */
  recurring: [PREFIX.recurring],
} as const satisfies Record<string, readonly string[]>

export type WriteKind = keyof typeof WRITES

/**
 * Invalidates everything a write made wrong.
 *
 * One function so no call site can hand-roll a prefix list, and no call site can
 * forget the `budgets:` on a transaction.
 */
export async function applyWrite(kind: WriteKind): Promise<void> {
  const { invalidate } = await import('@/lib/client/cache')
  invalidate([...WRITES[kind]])
}
