import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  role: 'ADMIN' | 'OWNER' | 'VIEWER';
  status: 'ACTIVE' | 'DISABLED';
  created_at: string;
  updated_at: string;
}

export interface SessionContext {
  user: User;
  profile: UserProfile;
  isActive: boolean;
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHENTICATED' | 'ACCOUNT_DISABLED' | 'PROFILE_NOT_FOUND'
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Retrieves the currently authenticated user and their live database profile.
 * 
 * SECURITY INVARIANTS:
 * - Uses supabase.auth.getUser() on the server, which validates the JWT cryptographically
 *   against the Supabase Auth server on every call. Never relies on unverified getSession().
 * - Never trusts client-side input, URL parameters, local storage, or user_metadata claims.
 * - Always queries the live `public.profiles` row from the database to ensure immediate
 *   revocation if a user has been marked as DISABLED or if their role changed.
 */
export async function getCurrentUser(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // Fetch live database profile (never trust JWT claims for role or status)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, status, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  return {
    user,
    profile: profile as UserProfile,
    isActive: profile.status === 'ACTIVE',
  };
}

/**
 * Enforces authentication and active account status for protected server operations.
 * Throws AuthenticationError if unauthenticated or if the account is disabled.
 */
export async function requireAuth(): Promise<SessionContext> {
  const context = await getCurrentUser();

  if (!context) {
    throw new AuthenticationError(
      'Authentication required. Please sign in.',
      'UNAUTHENTICATED'
    );
  }

  if (!context.isActive) {
    throw new AuthenticationError(
      'Account is disabled. Access denied.',
      'ACCOUNT_DISABLED'
    );
  }

  return context;
}
