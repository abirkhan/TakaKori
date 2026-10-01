/**
 * A Supabase client typed against the real schema.
 *
 * Created without a Database generic, because supabase-js types `numeric` as
 * `number` while the wire format is a string. Handing every call site a
 * misleading type is worse than no type: the money module exists precisely
 * because that value must not be treated as a number. TypeScript still catches
 * column-name typos, which is the main value here.
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
