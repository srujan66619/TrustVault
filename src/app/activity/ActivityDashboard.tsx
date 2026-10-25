'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { SafeAuditRecord, AdminChainSummary } from '@/lib/audit/audit';

interface UserInfo {
  id: string;
  email: string;
  role: 'ADMIN' | 'OWNER' | 'VIEWER';
  status: 'ACTIVE' | 'DISABLED';
}

interface ActivityDashboardProps {
  currentUser: UserInfo;
}

export function ActivityDashboard({ currentUser }: ActivityDashboardProps) {
  const isAdmin = currentUser.role === 'ADMIN';

  // Tabs for Admin: 'owner' (their documents) vs 'global' (system-wide)
  const [activeTab, setActiveTab] = useState<'owner' | 'global'>(isAdmin ? 'global' : 'owner');

  // Activity list & pagination state
  const [activities, setActivities] = useState<SafeAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');
  const [documentIdFilter, setDocumentIdFilter] = useState<string>('');

  // Chain Verification State (Admin only)
  const [chainSummary, setChainSummary] = useState<AdminChainSummary | null>(null);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);

    const endpoint = activeTab === 'global' ? '/api/admin/activity' : '/api/activity';
    const params = new URLSearchParams({
      limit: pageSize.toString(),
      offset: (page * pageSize).toString(),
    });

    if (actionFilter !== 'ALL') params.set('action', actionFilter);
    if (resultFilter !== 'ALL') params.set('result', resultFilter);
    if (documentIdFilter.trim() !== '') params.set('documentId', documentIdFilter.trim());

    try {
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access denied: Administrator privileges required for global audit history.');
        } else if (res.status === 404) {
          setError('Document not found or access denied.');
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to load activity records.');
        }
        setActivities([]);
        return;
      }

      const data = await res.json();
      setActivities(data.activities || []);
    } catch {
      setError('Network communication failure. Please check your connection.');
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, actionFilter, resultFilter, documentIdFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchActivities();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchActivities]);

  // Run chain verification (Admin only)
  const handleVerifyChain = async () => {
    if (!isAdmin) return;
    setVerifyingChain(true);
    setVerifyError(null);

    try {
      const res = await fetch('/api/admin/audit/verify', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVerifyError(data.error || 'Audit chain verification failed.');
        return;
      }

      const data = await res.json();
      setChainSummary(data.verification || null);
    } catch {
      setVerifyError('Network error while requesting audit chain verification.');
    } finally {
      setVerifyingChain(false);
    }
  };

  // Safe formatting helper for metadata
  const formatMetadata = (meta: Record<string, unknown>) => {
    const keys = Object.keys(meta).filter(
      (k) => !['ip_address', 'user_agent', 'internal_error', 'token'].includes(k)
    );
    if (keys.length === 0) return '—';
    return keys
      .map((k) => `${k}: ${typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}`)
      .join(', ');
  };

  const getResultBadgeClass = (result: string) => {
    switch (result) {
      case 'SUCCESS':
      case 'ALLOWED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'ACCESS_DENIED':
      case 'DENIED':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'FAILURE':
      case 'ERROR':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header & Role Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            Activity & Audit History
          </h1>
          <div className="heading-accent-line mt-2" />
          <p className="mt-1 text-sm text-slate-400">
            Cryptographically chained tamper-evident event log. Server-mediated least privilege access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-slate-700 bg-slate-900 text-slate-300">
            Role: <strong className="text-cyan-400">{currentUser.role}</strong>
          </span>
          <span className="text-xs font-mono px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            {currentUser.status}
          </span>
        </div>
      </div>

      {/* Admin Tab Switcher & Chain Health Section */}
      {isAdmin && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-800">
            <button
              onClick={() => {
                setActiveTab('global');
                setPage(0);
              }}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
                activeTab === 'global'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Global System Activity</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/60 text-cyan-400">
                Admin
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('owner');
                setPage(0);
              }}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'owner'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              My Documents Activity
            </button>
          </div>

          {/* Admin Audit Chain Health Card */}
          <div className="glass-panel stagger-1 rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.36)] hover:border-cyan-500/25 transition-all duration-300 relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">SHA-256 Chain Verification</h2>
                  {chainSummary && (
                    <span
                      className={`text-xs font-mono px-2.5 py-1 rounded-full border font-semibold ${
                        chainSummary.isValid
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {chainSummary.isValid ? '✓ CHAIN VALID' : '✗ INTEGRITY VIOLATION'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400 max-w-2xl leading-relaxed">
                  Validates monotonic sequence continuity, cryptographic prev_hash links, and SHA-256 payload digests across all committed transactions.
                </p>

                {chainSummary && (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                    <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
                      <span className="text-slate-500 block">Verified Records</span>
                      <span className="text-slate-200 font-bold text-sm">
                        {chainSummary.totalVerified}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
                      <span className="text-slate-500 block">Status</span>
                      <span className={chainSummary.isValid ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {chainSummary.isValid ? 'Unbroken Chain' : `Failed at seq #${chainSummary.failedAtSequence}`}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/60 backdrop-blur-md col-span-2 sm:col-span-1">
                      <span className="text-slate-500 block">Verified At</span>
                      <span className="text-slate-300">
                        {new Date(chainSummary.lastVerifiedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                )}

                {verifyError && (
                  <div className="mt-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
                    {verifyError}
                  </div>
                )}
              </div>

              <div className="flex-shrink-0">
                <button
                  onClick={handleVerifyChain}
                  disabled={verifyingChain}
                  className="btn-lift w-full sm:w-auto px-5 py-2.5 rounded-xl border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 text-xs font-mono font-medium transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {verifyingChain ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                      <span>Verifying Chain...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span>Run Health Check</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Architecture Disclosure */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 text-[11px] font-mono text-slate-500">
              Disclaimer: In-database hash chaining detects tampering within PostgreSQL application roles. It does not replace physical WORM storage against host/database superuser compromise.
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-panel stagger-2 rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.36)] hover:border-cyan-500/20 transition-all duration-300 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1.5">Action Filter</label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="input-glass w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 transition-all"
          >
            <option value="ALL">All Actions</option>
            <option value="READ">READ</option>
            <option value="DOWNLOAD">DOWNLOAD</option>
            <option value="EDIT">EDIT</option>
            <option value="DELETE">DELETE</option>
            <option value="GRANT">GRANT</option>
            <option value="REVOKE">REVOKE</option>
            <option value="AUDIT_VIEW">AUDIT_VIEW</option>
            <option value="AUDIT_VERIFY">AUDIT_VERIFY</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1.5">Result Filter</label>
          <select
            value={resultFilter}
            onChange={(e) => {
              setResultFilter(e.target.value);
              setPage(0);
            }}
            className="input-glass w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 transition-all"
          >
            <option value="ALL">All Results</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="ACCESS_DENIED">ACCESS_DENIED</option>
            <option value="FAILURE">FAILURE</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1.5">Document ID (UUID)</label>
          <input
            type="text"
            placeholder="Filter by Document UUID..."
            value={documentIdFilter}
            onChange={(e) => {
              setDocumentIdFilter(e.target.value);
              setPage(0);
            }}
            className="input-glass w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 transition-all"
          />
        </div>
      </div>

      {/* Activity Table */}
      <div className="glass-panel stagger-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.36)] overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mb-3" />
            <p className="text-xs font-mono text-slate-400">Loading audit records...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Audit Record Notice</h3>
            <p className="text-xs font-mono text-slate-400">{error}</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="p-12 text-center">
            <div className="empty-glow w-12 h-12 mx-auto rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-slate-300">No matching activity records</h3>
            <p className="text-xs text-slate-500 mt-1">
              No audit events found matching the active scope and filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-mono">
                  <th className="py-3 px-4">Seq #</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Document ID</th>
                  <th className="py-3 px-4">Safe Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {activities.map((act) => (
                  <tr key={act.sequenceNumber} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-cyan-400">
                      #{act.sequenceNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {new Date(act.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                      {act.action}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block font-mono text-[11px] px-2 py-0.5 rounded border ${getResultBadgeClass(act.result)}`}>
                        {act.result}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {act.documentId ? (
                        <span title={act.documentId} className="cursor-help">
                          {act.documentId.slice(0, 8)}...{act.documentId.slice(-4)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                      {formatMetadata(act.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="border-t border-slate-800 px-4 py-3 bg-slate-950/60 flex items-center justify-between text-xs font-mono text-slate-400">
          <div>
            Page <span className="text-cyan-400">{page + 1}</span> (Limit {pageSize})
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="btn-lift px-3 py-1 rounded border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={activities.length < pageSize || loading}
              className="btn-lift px-3 py-1 rounded border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
