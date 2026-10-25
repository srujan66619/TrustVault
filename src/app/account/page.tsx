import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth/session';
import { signOut } from '@/app/login/actions';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OwnerSharingManager } from './OwnerSharingManager';

async function AccountContent() {
  let session;
  try {
    session = await requireAuth();
  } catch {
    redirect('/login');
  }

  const { user, profile } = session;

  return (
    <div className="max-w-2xl mx-auto py-10 space-y-8 stagger-1">
      <div className="glass-panel rounded-2xl p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Authenticated Session
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Account Overview
            </h1>
            <div className="heading-accent-line mt-2" />
            <p className="text-xs text-slate-400 mt-1">
              Verified server-side via Supabase Auth & live database profile.
            </p>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="btn-lift rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Live Profile Security Details */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 font-mono">
            Security Context & Live Database Metadata
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-panel rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-mono uppercase text-slate-500">
                User ID (UUID)
              </span>
              <p className="font-mono text-xs text-slate-200 break-all">
                {user.id}
              </p>
            </div>

            <div className="glass-panel rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-mono uppercase text-slate-500">
                Email Address
              </span>
              <p className="font-mono text-xs text-slate-200 truncate">
                {user.email}
              </p>
            </div>

            <div className="glass-panel rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-mono uppercase text-slate-500">
                Database Role (profiles.role)
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {profile.role}
                </span>
                <span className="text-[11px] text-slate-400">
                  {profile.role === 'ADMIN'
                    ? 'Compliance & Audit Access'
                    : profile.role === 'OWNER'
                    ? 'Document Creation & Ownership'
                    : 'Restricted Viewer (Grants only)'}
                </span>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4 space-y-1">
              <span className="text-[11px] font-mono uppercase text-slate-500">
                Account Status (profiles.status)
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
                    profile.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}
                >
                  {profile.status}
                </span>
                <span className="text-[11px] text-slate-400">
                  {profile.status === 'ACTIVE'
                    ? 'Active (Authorized)'
                    : 'Disabled (Instant Deny)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Owner Document Sharing Manager */}
        <OwnerSharingManager userRole={profile.role} />

        {/* System Architecture Status */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 backdrop-blur-md p-4 space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Document Security Architecture
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            All document operations are strictly mediated by centralized server authorization. Downloads stream directly from protected storage with pre-stream verification and zero presigned public links.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/"
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto py-10 text-center text-xs text-slate-500">
          Loading account overview...
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}
