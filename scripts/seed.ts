/**
 * Seed a local test user with realistic data.
 *
 * Uses the Supabase Admin API (`auth.admin.createUser`), not hand-written SQL.
 * Writing rows into auth.users and auth.identities directly is unreliable:
 * GoTrue keeps columns like `auth.identities.email` as generated values and
 * will fail with "Database error querying schema" if the row does not match
 * what it expects. The Admin API is the supported path.
 *
 * Requires a service-role key, which bypasses RLS. Never run this against
 * production, and never commit the key.
 *
 * Usage:
 *   # .env.local
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
 *   npx tsx scripts/seed.ts
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (serviceKey.startsWith('sb_publishable_')) {
  console.error(
    'That looks like a publishable key, not a service-role key. ' +
      'The Admin API needs the secret key.',
  )
  process.exit(1)
}

const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'demo@example.com'
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'DemoPass123!'

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`Seeding ${DEMO_EMAIL} on ${url}\n`)

  // 1. Create a confirmed user. email_confirm skips the confirmation email,
  //    which is what the free-tier rate limit blocks.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Demo User' },
  })

  let userId = created?.user?.id

  if (createError) {
    if (!/already been registered|already exists/i.test(createError.message)) {
      console.error('createUser failed:', createError.message)
      process.exit(1)
    }
    // Already exists — reuse it.
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (listError) {
      console.error('listUsers failed:', listError.message)
      process.exit(1)
    }
    const existing = list.users.find((u) => u.email === DEMO_EMAIL)
    if (!existing) {
      console.error(`Could not find existing user ${DEMO_EMAIL}`)
      process.exit(1)
    }
    userId = existing.id
    console.log('User already exists, reusing it.')
  } else {
    console.log('Created user.')
  }

  // 2. The provisioning trigger creates profile, workspace, membership, one
  //    account and fifteen categories. Verify rather than assume.
  const { data: members, error: memberError } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId!)
    .limit(1)
    .maybeSingle()

  if (memberError || !members) {
    console.error(
      'Provisioning did not run — no workspace membership found. ' +
        'Check that the on_auth_user_created trigger exists.',
    )
    process.exit(1)
  }

  const workspaceId = members.workspace_id
  console.log(`Workspace: ${workspaceId}`)

  // 3. Add a second account so transfers are exercisable.
  const { error: bankError } = await admin.from('accounts').insert({
    workspace_id: workspaceId,
    name: 'Bank',
    kind: 'bank',
  })
  if (bankError && !/duplicate/i.test(bankError.message)) {
    console.error('Failed to create Bank account:', bankError.message)
    process.exit(1)
  }

  const { data: accounts } = await admin
    .from('accounts')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .order('name')

  const cash = accounts?.find((a) => a.name === 'Cash')
  const bank = accounts?.find((a) => a.name === 'Bank')
  if (!cash || !bank) {
    console.error('Expected Cash and Bank accounts.')
    process.exit(1)
  }

  const { data: categories } = await admin
    .from('categories')
    .select('id, name, type')
    .eq('workspace_id', workspaceId)

  const cat = (name: string, type: string) =>
    categories?.find((c) => c.name === name && c.type === type)?.id

  // 4. Insert transactions covering income, expense and transfer, across two
  //    months so the date filter has something to exclude.
  const rows = [
    {
      workspace_id: workspaceId,
      account_id: cash.id,
      category_id: cat('Salary', 'income'),
      type: 'income',
      amount: '80000.00',
      description: 'Monthly salary',
      occurred_on: '2026-09-01',
    },
    {
      workspace_id: workspaceId,
      account_id: cash.id,
      category_id: cat('Food', 'expense'),
      type: 'expense',
      amount: '3500.00',
      description: 'Groceries',
      occurred_on: '2026-09-05',
    },
    {
      workspace_id: workspaceId,
      account_id: cash.id,
      category_id: cat('Bills', 'expense'),
      type: 'expense',
      amount: '1000.00',
      description: 'Internet',
      occurred_on: '2026-09-12',
    },
    {
      workspace_id: workspaceId,
      account_id: cash.id,
      category_id: cat('Transport', 'expense'),
      type: 'expense',
      amount: '450.50',
      description: 'Rickshaw fare, Dhaka',
      occurred_on: '2026-09-18',
    },
    {
      // Previous month, so "this month" filters actually exclude something.
      workspace_id: workspaceId,
      account_id: cash.id,
      category_id: cat('Food', 'expense'),
      type: 'expense',
      amount: '999.00',
      description: 'Last month expense',
      occurred_on: '2026-08-15',
    },
    {
      workspace_id: workspaceId,
      account_id: cash.id,
      counterparty_account_id: bank.id,
      type: 'transfer',
      amount: '5000.00',
      description: 'To bank',
      occurred_on: '2026-09-20',
    },
  ].filter((r) => (r.type === 'transfer' ? true : r.category_id))

  const { error: txError } = await admin.from('transactions').insert(rows)
  if (txError) {
    console.error('Failed to insert transactions:', txError.message)
    process.exit(1)
  }

  // 5. Assert the reconciliation invariant from ADR-012.
  const { data: totals } = await admin.rpc('workspace_totals_for_range', {
    target_workspace_id: workspaceId,
    range_from: '1900-01-01',
    range_to: '2999-12-31',
  })
  const { data: balances } = await admin
    .from('account_balances')
    .select('name, balance')
    .eq('workspace_id', workspaceId)

  const rows2 = balances ?? []
  const sumBalances = rows2.reduce(
    (sum: number, b: { balance: number | string }) => sum + Number(b.balance),
    0,
  )
  const net = Number(totals?.[0]?.net_balance ?? 0)

  console.log('\nAccount balances:')
  for (const b of rows2) {
    console.log(`  ${b.name}: ${b.balance}`)
  }

  if (Math.abs(sumBalances - net) > 0.001) {
    console.error(
      `\nRECONCILIATION FAILED: balances sum to ${sumBalances} but net is ${net}. ` +
        'See ADR-012.',
    )
    process.exit(1)
  }

  console.log(`\nSum of balances ${sumBalances} == net ${net}. Reconciled.`)
  console.log(`\nSign in with:\n  ${DEMO_EMAIL}\n  ${DEMO_PASSWORD}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})