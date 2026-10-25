import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { ActivityDashboard } from './ActivityDashboard';

async function ActivityContent() {
  let session;
  try {
    session = await requireAuth();
  } catch {
    redirect('/login?next=/activity');
  }

  const { user, profile } = session;

  return (
    <ActivityDashboard
      currentUser={{
        id: user.id,
        email: user.email || 'authenticated-user@trustvault.local',
        role: profile.role,
        status: profile.status,
      }}
    />
  );
}

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6">
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mb-4" />
            <p className="text-sm font-mono text-slate-400">
              Verifying cryptographic session & loading activity logs...
            </p>
          </div>
        </div>
      }
    >
      <ActivityContent />
    </Suspense>
  );
}
