'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { checkLoginRateLimit } from '@/lib/security/rateLimit';

export async function signIn(formData: FormData): Promise<void> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email and password are required.'));
  }

  const limit = checkLoginRateLimit(email.toLowerCase().trim());
  if (!limit.allowed) {
    redirect('/login?error=' + encodeURIComponent('Too many login attempts. Please try again later.'));
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  redirect('/account');
}

export async function signUp(formData: FormData): Promise<void> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email and password are required.'));
  }

  const supabase = await createClient();

  // STRICT SECURITY INVARIANT:
  // user_metadata is omitted or ignored; the database trigger handle_new_user()
  // hardcodes role='VIEWER' and status='ACTIVE' on the profiles row.
  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  redirect('/account');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
