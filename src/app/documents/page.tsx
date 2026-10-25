import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { DocumentDashboard } from './DocumentDashboard';

async function DocumentsContent() {
  let session;
  try {
    session = await requireAuth();
  } catch {
    redirect('/login?next=/documents');
  }

  const { user, profile } = session;

  return (
    <DocumentDashboard
      currentUser={{
        id: user.id,
        email: user.email || 'authenticated-user@trustvault.local',
        role: profile.role,
        status: profile.status,
      }}
    />
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6">
          <div className="flex flex-col items-center justify-center p-12 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mb-4" />
            <p className="text-sm font-mono text-slate-400">
              Verifying cryptographic session & loading documents...
            </p>
          </div>
        </div>
      }
    >
      <DocumentsContent />
    </Suspense>
  );
}
