'use client';

import { useState } from 'react';

interface PermissionRecord {
  granteeId: string;
  granteeEmail: string;
  permission: 'READ' | 'EDIT';
  createdAt: string;
}

export function OwnerSharingManager({ userRole }: { userRole: string }) {
  const [documentId, setDocumentId] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [permission, setPermission] = useState<'READ' | 'EDIT'>('READ');
  const [permissionsList, setPermissionsList] = useState<PermissionRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load grants for the specified document ID
  const fetchPermissions = async (docId: string) => {
    if (!docId.trim()) return;
    setLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId.trim())}/permissions`);
      if (res.status === 404) {
        setActionMessage({
          type: 'error',
          text: 'Document not found or you are not the document owner.',
        });
        setPermissionsList(null);
        return;
      }
      if (!res.ok) {
        setActionMessage({ type: 'error', text: 'Failed to retrieve document permissions.' });
        setPermissionsList(null);
        return;
      }

      const data = await res.json();
      setPermissionsList(data.permissions || []);
    } catch {
      setActionMessage({ type: 'error', text: 'Network error retrieving document permissions.' });
      setPermissionsList(null);
    } finally {
      setLoading(false);
    }
  };

  // Submit a new grant or permission change
  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId.trim() || !recipientEmail.trim()) return;

    setLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId.trim())}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recipientEmail.trim(),
          permission,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionMessage({
          type: 'error',
          text: data.error || 'Failed to update document permissions.',
        });
        return;
      }

      setActionMessage({
        type: 'success',
        text: data.message || 'Permission updated successfully.',
      });
      setRecipientEmail('');
      await fetchPermissions(documentId);
    } catch {
      setActionMessage({ type: 'error', text: 'Network error submitting permission update.' });
    } finally {
      setLoading(false);
    }
  };

  // Revoke an active grant immediately
  const handleRevoke = async (granteeId: string) => {
    if (!documentId.trim()) return;

    setLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(
        `/api/documents/${encodeURIComponent(documentId.trim())}/permissions/${encodeURIComponent(granteeId)}`,
        { method: 'DELETE' }
      );

      const data = await res.json();
      if (!res.ok) {
        setActionMessage({
          type: 'error',
          text: data.error || 'Failed to revoke document access.',
        });
        return;
      }

      setActionMessage({
        type: 'success',
        text: 'Access revoked immediately. Former grantee is instantly denied.',
      });
      await fetchPermissions(documentId);
    } catch {
      setActionMessage({ type: 'error', text: 'Network error revoking document access.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          Owner-Controlled Sharing
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white">
          Document Access & Immediate Revocation
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Only the document owner may manage permissions. All grants require exact email matching; no browseable user directory exists.
        </p>
      </div>

      {userRole !== 'OWNER' && userRole !== 'ADMIN' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300">
          Note: Your current account role is <span className="font-mono font-bold">{userRole}</span>. Document sharing is owner-exclusive. Only documents you own can be shared or managed.
        </div>
      )}

      {/* Document Selection Input */}
      <div className="space-y-2">
        <label htmlFor="docIdInput" className="block text-xs font-mono uppercase text-slate-400">
          Document UUID
        </label>
        <div className="flex gap-2">
          <input
            id="docIdInput"
            type="text"
            placeholder="e.g. 11111111-1111-4111-8111-111111111111"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => fetchPermissions(documentId)}
            disabled={loading || !documentId.trim()}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {loading ? 'Inspecting...' : 'Inspect Grants'}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`rounded-xl border p-3 text-xs ${
            actionMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Grant or Update Access Form */}
      {permissionsList !== null && (
        <form onSubmit={handleGrant} className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <h3 className="text-xs font-mono uppercase text-slate-400 font-semibold">
            Grant or Update Access
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label htmlFor="recipientEmailInput" className="block text-[11px] text-slate-400">
                Exact Recipient Email
              </label>
              <input
                id="recipientEmailInput"
                type="email"
                placeholder="colleague@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="permissionSelect" className="block text-[11px] text-slate-400">
                Permission Level
              </label>
              <select
                id="permissionSelect"
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'READ' | 'EDIT')}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="READ">READ (Read & Download)</option>
                <option value="EDIT">EDIT (Read, Download, Edit)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !recipientEmail.trim()}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {loading ? 'Processing...' : 'Grant / Update Permission'}
          </button>
        </form>
      )}

      {/* Active Grants List */}
      {permissionsList !== null && (
        <div className="space-y-3">
          <h3 className="text-xs font-mono uppercase text-slate-400 font-semibold">
            Active Document Grants ({permissionsList.length})
          </h3>

          {permissionsList.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              No active permissions granted for this document. Only the owner currently has access.
            </p>
          ) : (
            <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950">
              {permissionsList.map((grant) => (
                <div key={grant.granteeId} className="flex items-center justify-between p-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-mono text-slate-200">{grant.granteeEmail}</p>
                    <p className="text-[10px] text-slate-500">
                      Granted on {new Date(grant.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                        grant.permission === 'EDIT'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      }`}
                    >
                      {grant.permission}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRevoke(grant.granteeId)}
                      disabled={loading}
                      className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Security Boundary Notice */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1.5 text-[11px] text-slate-500">
        <p className="font-semibold text-slate-400">Security Boundaries:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Grantees cannot re-share documents. Sharing is strictly owner-controlled.</li>
          <li>Direct table mutations on permissions are denied at the PostgreSQL layer.</li>
          <li>Revocation takes effect immediately without stale tokens or pre-signed URLs.</li>
          <li>Strict server-side validation ensures non-transitive sharing and zero unauthenticated access.</li>
        </ul>
      </div>
    </div>
  );
}
