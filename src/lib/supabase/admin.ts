import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a privileged server-side Supabase client using the service role key.
 * 
 * SECURITY INVARIANTS:
 * - 'server-only' prevents this module from ever being bundled into client code.
 * - SUPABASE_SERVICE_ROLE_KEY is NEVER prefixed with NEXT_PUBLIC_.
 * - This client bypasses RLS and should ONLY be used in server-side authorization
 *   and internal administrative routines where manual authorization checks are enforced.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable.');
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Privileged administrative operations require this secret.'
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
