import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { signOut } from '@/app/(auth)/actions'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email } = await requireUser()

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <nav className="flex items-center gap-4">
            <Link href="/dashboard" className="font-semibold">
              TakaKori
            </Link>
            <Link href="/transactions" className="text-sm text-neutral-600 hover:text-black">
              Transactions
            </Link>
            <Link href="/accounts" className="text-sm text-neutral-600 hover:text-black">
              Accounts
            </Link>
            <Link href="/categories" className="text-sm text-neutral-600 hover:text-black">
              Categories
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:inline">{email}</span>
            {/* A plain form keeps sign-out working without client JavaScript. */}
            <form action={signOut}>
              <button type="submit" className="text-sm underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}