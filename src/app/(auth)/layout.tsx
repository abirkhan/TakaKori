import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <h1 className="text-2xl font-semibold">TakaKori</h1>
          <p className="text-sm text-neutral-500">Track where your money goes</p>
        </Link>
        {children}
      </div>
    </div>
  )
}