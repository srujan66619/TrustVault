import { Suspense } from 'react';
import { signIn, signUp } from './actions';
import Link from 'next/link';

async function LoginContent({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const errorMsg = params?.error;
  const message = params?.message;

  return (
    <div className="max-w-md mx-auto py-12 px-4 sm:px-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Secure Authentication
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Sign In to TrustVault
          </h1>
          <p className="text-xs text-slate-400">
            Server-side authentication verifying live session and database profile status.
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {message && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            {message}
          </div>
        )}

        <form className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="user@example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              formAction={signIn}
              type="submit"
              className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition-all cursor-pointer"
            >
              Sign In
            </button>
            <button
              formAction={signUp}
              type="submit"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </form>

        <div className="border-t border-slate-800 pt-4 text-center">
          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
          >
            ← Return to TrustVault Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto py-12 text-center text-xs text-slate-500">
          Loading sign in...
        </div>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
