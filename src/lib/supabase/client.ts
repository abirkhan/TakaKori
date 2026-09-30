/**
 * Browser Supabase client.
 *
 * Runs in Client Components. Session is persisted in cookies so that the
 * server can read it during SSR.
 *
 * Never import the service-role key here. This client is public by definition.
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}