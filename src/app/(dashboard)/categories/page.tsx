import { requireUser } from '@/lib/auth'
import { listCategories } from '@/lib/queries/reference'
import { CategoryForm } from '@/components/categories/CategoryForm'

export default async function CategoriesPage() {
  await requireUser()
  const categories = await listCategories()

  const income = categories.filter((c) => c.type === 'income')
  const expense = categories.filter((c) => c.type === 'expense')

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Categories</h1>

      <section className="rounded border border-neutral-200 p-4">
        <CategoryForm />
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { title: 'Income', items: income },
          { title: 'Expense', items: expense },
        ].map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 text-sm font-medium text-neutral-500">{group.title}</h2>
            <ul className="flex flex-wrap gap-2">
              {group.items.map((c) => (
                <li key={c.id} className="rounded border border-neutral-200 px-3 py-1.5 text-sm">
                  {c.name}
                </li>
              ))}
              {group.items.length === 0 && <li className="text-sm text-neutral-400">None yet</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
