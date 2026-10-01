/**
 * Auth guards for server-side code.
 *
 * Proxy redirects unauthenticated users away from /dashboard, but that is a
 * convenience, not a security control. The Next.js docs are explicit that a
 * proxy matcher can silently skip Server Function calls on excluded paths, and
 * that authz must be re-checked inside every action and query. These helpers
 * are that second check.
 *
 * Never accept a user id from a request body or query string. Always derive it
 * from the verified session.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface AuthedUser {
  userId: string
  email: string | undefined
}

/**
 * Require an authenticated user, or redirect to /login.
 *
 * Use in Server Components and pages.
 */
export async function requireUser(): Promise<AuthedUser> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return { userId: user.id, email: user.email }
}

/**
 * Require an authenticated user, or throw.
 *
 * Use in Server Actions and Route Handlers, where redirecting is not
 * appropriate and the caller must render or return an error.
 */
export async function requireUserOrThrow(): Promise<AuthedUser> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new UnauthorizedError()
  }

  return { userId: user.id, email: user.email }
}

/**
 * Resolve the caller's workspace.
 *
 * V1 creates exactly one workspace per user (enforced by a unique index on
 * workspace_members.user_id), so this returns a single workspace. The function
 * is shaped as a lookup rather than a hardcoded id so that shared workspaces do
 * not require rewriting every call site later.
 */
export async function requireWorkspaceId(): Promise<string> {
  const { userId } = await requireUserOrThrow()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve workspace: ${error.message}`)
  }
  if (!data) {
    // Signup provisioning creates this. Its absence means the provisioning
    // trigger failed, which is a bug to surface loudly rather than paper over.
    throw new Error(`No workspace found for user ${userId}. Provisioning may have failed.`)
  }

  return data.workspace_id
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'UnauthorizedError'
  }
}
