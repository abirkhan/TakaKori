import { CategoryData } from '@/components/categories/CategoryData'

/**
 * Categories.
 *
 * Laid out as icon tiles rather than a table of names, because the thing a user
 * does here is recognise a category, not read it. The tile colour is derived
 * from the name so the same category is the same colour on every screen — a
 * stable colour per category is what makes a grid scannable, and a random or
 * sequential colour would destroy that.
 *
 * This file stays a Server Component and is now only a shell. The list moved into
 * `CategoryData`, like `/dashboard`, `/accounts` and `/budgets` before it.
 *
 * `requireUser()` is gone from here rather than carried forward, because the
 * dashboard layout already authenticates every route in this group — the
 * converted screens dropped the same call, and the E2E guard for redirecting an
 * unauthenticated visitor still passes.
 */
export default function CategoriesPage() {
  return (
    <div className="tk-stack">
      <CategoryData />
    </div>
  )
}
