/**
 * Create a *brand-new* account, for verifying first-run UI.
 *
 * Unlike `scripts/seed.ts` this writes no transactions, budgets or extra
 * accounts — it leaves the user in exactly the state a real signup produces: one
 * "Cash" account, the seeded categories, nothing else. That is the only state in
 * which onboarding is visible, and the only state where it can honestly be
 * checked.
 *
 * Usage:
 *   SEED_EMAIL=… SEED_PASSWORD=… npx tsx scripts/seed-new-user.ts
 *
 * Requires a service-role key. It bypasses RLS and never runs against production.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const email = process.env.SEED_EMAIL
const password = process.env.SEED_PASSWORD

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!email || !password) {
  console.error('Set SEED_EMAIL and SEED_PASSWORD.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`Creating a fresh account: ${email}\n`)

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Fresh User' },
  })

  if (error) {
    console.error(`Failed: ${error.message}`)
    process.exit(1)
  }

  const userId = data.user?.id
  if (!userId) {
    console.error('No user id returned.')
    process.exit(1)
  }

  /**
   * The provisioning trigger is a `SECURITY DEFINER` function on `auth.users`, so
   * the account, its workspace and its seeded categories already exist by the time
   * `createUser` resolves. These counts are the assertion that it ran — without
   * them this script would report success for an account whose every query returns
   * nothing, which is the failure mode `createQueryContext` raises on.
   */
  const { data: memberships } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)

  const workspaceId = memberships?.[0]?.workspace_id
  if (!workspaceId) {
    console.error('Provisioning did not run: no workspace membership.')
    process.exit(1)
  }

  const { count: accounts } = await admin
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  const { count: categories } = await admin
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  const { count: transactions } = await admin
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  console.log(`user_id      ${userId}`)
  console.log(`workspace_id ${workspaceId}`)
  console.log(`accounts     ${accounts ?? 0}   (expected 1 — the seeded Cash account)`)
  console.log(`categories   ${categories ?? 0}   (expected 15 — the seeded starter set)`)
  console.log(`transactions ${transactions ?? 0}   (expected 0 — this is a first run)`)
  console.log(`\nSign in as ${email}`)
}

main().catch((cause: unknown) => {
  console.error(cause)
  process.exit(1)
})
