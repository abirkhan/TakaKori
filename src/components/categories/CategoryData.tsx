'use client'

import { listCategories } from '@/lib/queries/client'
import { useQuery } from '@/lib/client/useQuery'
import { keys } from '@/lib/client/invalidations'
import { toneFor } from '@/lib/tone'
import { CategoryForm } from '@/components/categories/CategoryForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon, type IconName } from '@/components/ui/Icon'
import { CategoryEditSheet } from '@/components/categories/CategoryEditSheet'
import { buttonClass } from '@/components/ui/button'
import type { Category } from '@/lib/queries/reference'
import { useState } from 'react'

/**
 * Categories, loaded in the browser.
 *
 * **The one screen with no two-phase load, and that is not an oversight.** Every
 * other converted screen needs the profile first, because a figure has to be
 * formatted in the user's currency and a date range has to be resolved in the
 * user's timezone. This screen shows names. There is no currency and no range,
 * so there is nothing to wait for and the first paint is already the real thing.
 *
 * **No "last synced" line either, deliberately.** The other screens render one
 * because a stale *figure* is the dangerous kind of stale — a balance that reads
 * as live when it is not. A stale category name is cosmetic: the worst outcome is
 * that a category created on another device is missing until the next reload, and
 * nothing the user relies on to make a decision is wrong. Adding the timestamp
 * anyway would train people to ignore it on the screens where it matters.
 */
export function CategoryData() {
  const categories = useQuery(keys.categories(), () => listCategories())
  const [editing, setEditing] = useState<string | null>(null)

  const data = categories.data
  const income = data?.filter((c) => c.type === 'income') ?? []
  const expense = data?.filter((c) => c.type === 'expense') ?? []

  return (
    <>
      <PageHeader eyebrow={data ? `${data.length} total` : ' '} title="Categories" />

      <section className="tk-card">
        <CategoryForm />
      </section>

      {categories.error && (
        <EmptyState
          icon="alert"
          title="Could not load your categories"
          description={categories.error}
        />
      )}

      {!categories.error && !data && (
        <div className="tk-card" aria-busy="true">
          <span className="tk-caption">Loading your categories…</span>
        </div>
      )}

      {data &&
        [
          {
            title: 'Expense',
            items: expense,
            icon: 'arrowUpRight' as IconName,
            tone: 'rose' as const,
          },
          {
            title: 'Income',
            items: income,
            icon: 'arrowDownLeft' as IconName,
            tone: 'brand' as const,
          },
        ].map((group) => (
          <section key={group.title}>
            <h2 className="tk-section mb-3">{group.title}</h2>

            {group.items.length === 0 ? (
              <EmptyState
                icon={group.icon}
                title={`No ${group.title.toLowerCase()} categories`}
                description="Add one above — it will appear in the transaction form."
              />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((c) => (
                  <li
                    key={c.id}
                    className="tk-card flex flex-col items-center gap-2 p-4 text-center"
                  >
                    <span className={`tk-tile tk-tile-lg tk-tone-${toneFor(c.name)}`}>
                      <Icon name="tag" size={20} />
                    </span>
                    <p className="tk-body w-full truncate font-medium">{c.name}</p>
                    {c.is_system && <p className="tk-caption">Built in</p>}
                    {/*
                      A rename is the commonest correction on this screen, and before
                      this there was no way to make one: a category created with the
                      wrong name kept it, and transactions follow `category_id`, so
                      every past row showed the wrong label too. Built-in categories
                      are left alone - they are seeded, so renaming one would be undone
                      by the next seed and the user cannot know that.
                    */}
                    {!c.is_system && (
                      <button
                        type="button"
                        onClick={() => setEditing(c.id)}
                        className={buttonClass('quiet', { size: 'sm' })}
                      >
                        Edit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {editing && categories.data && (
          <CategoryEditSheet
            category={categories.data.find((c) => c.id === editing) as Category}
            open
            onClose={() => setEditing(null)}
          />
        )}
    </>
  )
}
