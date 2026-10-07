/**
 * The query context: who is asking, and as whom.
 *
 * `lib/queries/*` used to reach for `requireWorkspaceId()` and the server
 * Supabase client on its own. That is what made the whole data layer
 * server-only, and it is why client-side data loading would otherwise have meant
 * *duplicating* every query — two implementations of the same financial reads,
 * free to drift, which is the failure ADR-012 is a cautionary tale about.
 *
 * So the context is a parameter. One implementation, two facades:
 *
 *   - `lib/queries/server.ts` binds it to cookies, for Server Components,
 *     Server Actions and Route Handlers.
 *   - `lib/queries/client.ts` binds it to the browser client, for Client
 *     Components.
 *
 * Every existing call site keeps its exact signature and only changes which
 * module it imports from, so the diff in the pages and actions is one import
 * line each.
 *
 * The Supabase client is created without the `Database` generic on purpose — see
 * `lib/supabase/client.ts` — so the type here is deliberately loose.
 * Column-name typos are still caught, which is the part that carries value.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface QueryContext {
  supabase: SupabaseClient
  /** The caller's workspace. Never accepted from caller input — see ADR-002. */
  workspaceId: string
  /**
   * `auth.users.id`.
   *
   * Carried because it is *not* the same as `workspaceId`, and the one table
   * where that matters is `profiles`. Hiding the asymmetry behind a clever `.eq()`
   * inside `getProfile` is how it would eventually get read as "profiles is
   * workspace-scoped", which is not true.
   */
  userId: string
}

/**
 * Builds a context from the caller's verified session.
 *
 * Identical on both sides, and that is the point. `auth.uid()` comes from the
 * caller's JWT either way, so PostgREST sets the same Postgres role and RLS
 * evaluates the same policies. Nothing about the tenancy boundary changes when a
 * request stops being server-rendered — it was never a property of the rendering
 * mode.
 */
export async function createQueryContext(supabase: SupabaseClient): Promise<QueryContext> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData.user
  if (userError || !user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to resolve workspace: ${error.message}`)
  if (!data) {
    // Almost always a failed provisioning trigger rather than a bug, and the user
    // needs to read something other than a spinner.
    throw new Error('No workspace found for this account. Provisioning may have failed.')
  }

  return { supabase, workspaceId: data.workspace_id, userId: user.id }
}

/**
 * The caller's profile row.
 *
 * This read was inlined into seven places — six pages and the CSV route — and
 * never went through the query layer. It had to move for two reasons.
 *
 * First, it was duplicated. Second and more important, it is now on the critical
 * path of every screen: each one needs `timezone` before it can resolve a date
 * range, and the timezone now arrives over the network rather than sitting
 * alongside the page render. That creates a two-phase load — profile, then
 * ranges, then data — which server rendering did not have. See ADR-006 for why
 * the range must be computed against this zone rather than UTC.
 */
export interface Profile {
  id: string
  full_name: string | null
  currency: string
  timezone: string
}

export async function getProfile(ctx: QueryContext): Promise<Profile> {
  const { data, error } = await ctx.supabase
    .from('profiles')
    .select('id, full_name, currency, timezone')
    .eq('id', ctx.userId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  if (!data) throw new Error('No profile found for this account.')
  return data as unknown as Profile
}
