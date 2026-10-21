import { createBrowserClient } from '@supabase/ssr';

/**
 * Creates a Supabase client for use in browser / client components.
 * 
 * SECURITY INVARIANTS:
 * - Only consumes NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * - Never consumes or references SUPABASE_SERVICE_ROLE_KEY.
 * - All actions initiated by this client are subject to Postgres RLS.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase public environment variables (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).'
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
