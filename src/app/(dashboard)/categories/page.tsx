import { requireUser } from '@/lib/auth'
import { listCategories } from '@/lib/queries/reference'
import { toneFor } from '@/lib/tone'
import { CategoryForm } from '@/components/categories/CategoryForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * Categories.
 *
 * Laid out as icon tiles rather than a table of names, because the thing a
 * user does here is recognise a category, not read it. The tile colour is
 * derived from the name so the same category is the same colour on every
 * screen — a stable colour per category is what makes a category grid
 * scannable, and a random or sequential colour would destroy that.
 */
export default async function CategoriesPage() {
  await requireUser()
  const categories = await listCategories()

  const income = categories.filter((c) => c.type === 'income')
  const expense = categories.filter((c) => c.type === 'expense')

  return (
    <div className="tk-stack">
      <PageHeader eyebrow={`${categories.length} total`} title="Categories" />

      <section className="tk-card">
        <CategoryForm />
      </section>

      {[
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
                <li key={c.id} className="tk-card flex flex-col items-center gap-2 p-4 text-center">
                  <span className={`tk-tile tk-tile-lg tk-tone-${toneFor(c.name)}`}>
                    <Icon name="tag" size={20} />
                  </span>
                  <p className="tk-body w-full truncate font-medium">{c.name}</p>
                  {c.is_system && <p className="tk-caption">Built in</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
