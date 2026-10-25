'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import Link from 'next/link';

export interface DocumentItem {
  id: string;
  ownerId: string;
  displayName: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  permission?: string | null;
}

interface CurrentUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'OWNER' | 'VIEWER';
  status: 'ACTIVE' | 'DISABLED';
}

const CATEGORIES = [
  'general',
  'financial',
  'legal',
  'personal',
  'technical',
] as const;

export function DocumentDashboard({ currentUser }: { currentUser: CurrentUser }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; seq?: string } | null>(null);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine' | 'shared'>('all');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');

  // Upload Form State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDisplayName, setUploadDisplayName] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('general');
  const [isUploading, setIsUploading] = useState(false);

  // Edit Metadata Modal State
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editCategory, setEditCategory] = useState<string>('general');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Soft Delete Confirmation Modal State
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [, startTransition] = useTransition();

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      if (ownerFilter !== 'all') params.set('ownerFilter', ownerFilter);
      if (createdAfter) params.set('createdAfter', new Date(createdAfter).toISOString());
      if (createdBefore) {
        // Set to end of day if only date is provided
        const endOfDay = new Date(createdBefore);
        endOfDay.setHours(23, 59, 59, 999);
        params.set('createdBefore', endOfDay.toISOString());
      }

      const res = await fetch(`/api/documents?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve accessible documents';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, ownerFilter, createdAfter, createdBefore]);

  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        fetchDocuments();
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchDocuments]);

  // Handle Document Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setFeedback({ type: 'error', message: 'Please select a file to upload (PDF, PNG, JPEG, or TXT)' });
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadDisplayName.trim()) {
        formData.append('displayName', uploadDisplayName.trim());
      }
      formData.append('category', uploadCategory);

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload document');
      }

      setFeedback({
        type: 'success',
        message: `Document "${data.document.displayName}" uploaded successfully.`,
      });

      // Reset upload form
      setUploadFile(null);
      setUploadDisplayName('');
      setUploadCategory('general');
      const fileInput = document.getElementById('vault-file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsUploading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (doc: DocumentItem) => {
    setEditingDoc(doc);
    setEditDisplayName(doc.displayName);
    setEditCategory(doc.category);
    setFeedback(null);
  };

  // Handle Metadata Update
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;

    setIsSavingEdit(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          category: editCategory,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update document metadata');
      }

      setFeedback({
        type: 'success',
        message: `Metadata for "${data.document.displayName}" updated successfully.`,
        seq: data.auditSequenceNumber,
      });

      setEditingDoc(null);
      fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Metadata update failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handle Soft Deletion
  const handleSoftDelete = async () => {
    if (!deletingDoc) return;

    setIsDeleting(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/documents/${deletingDoc.id}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete document');
      }

      setFeedback({
        type: 'success',
        message: `Document "${deletingDoc.displayName}" was soft-deleted. It is no longer accessible.`,
        seq: data.auditSequenceNumber,
      });

      setDeletingDoc(null);
      fetchDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Soft deletion failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setIsDeleting(false);
    }
  };

  // Format File Size
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Format Date
  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Dashboard Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Phase 7: Protected Document Vault
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Documents Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Server-side encrypted vault with centralized authorization, safe metadata editing, and tamper-evident audit logging.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-right">
            <div className="text-[10px] uppercase font-mono text-slate-500">Security Context</div>
            <div className="text-xs font-mono font-medium text-slate-200">
              Role: <span className="text-cyan-400">{currentUser.role}</span> | Status: <span className="text-emerald-400">{currentUser.status}</span>
            </div>
          </div>
          <Link
            href="/account"
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-all"
          >
            Manage Permissions
          </Link>
        </div>
      </div>

      {/* Global Alert / Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start justify-between gap-3 ${
            feedback.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
              : 'border-red-500/40 bg-red-950/30 text-red-300'
          }`}
        >
          <div>
            <div className="font-semibold">{feedback.type === 'success' ? 'Operation Completed' : 'Operation Failed'}</div>
            <div className="text-xs mt-0.5">{feedback.message}</div>
            {feedback.seq && (
              <div className="text-[11px] font-mono text-emerald-400 mt-1">
                Tamper-Evident Audit Sequence #{feedback.seq}
              </div>
            )}
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid Layout: Upload Panel + Filter Bar + Document List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Upload Document Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <span className="text-lg">📤</span>
              <h2 className="text-base font-bold text-white">Upload Document</h2>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wide">
                  Select File (Max 15MB)
                </label>
                <input
                  id="vault-file-upload"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setUploadFile(file);
                    if (file && !uploadDisplayName) {
                      setUploadDisplayName(file.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 cursor-pointer border border-slate-800 rounded-xl p-2 bg-slate-950"
                  required
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  Permitted types: PDF, PNG, JPEG, Text. Magic-bytes verified server-side.
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wide">
                  Display Title (Optional)
                </label>
                <input
                  type="text"
                  maxLength={255}
                  value={uploadDisplayName}
                  onChange={(e) => setUploadDisplayName(e.target.value)}
                  placeholder="e.g. Q3 Financial Statement"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase tracking-wide">
                  Category
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors capitalize"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isUploading || !uploadFile}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-xs font-bold text-white shadow-lg hover:from-cyan-400 hover:to-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isUploading ? 'Securing & Uploading...' : 'Upload to Secure Vault'}
              </button>
            </form>
          </div>

          {/* Security & Feature Disclosures (Phase 7 Scope Boundaries) */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-5 space-y-3 text-xs text-slate-400">
            <div className="font-semibold text-slate-300 font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <span>🛡️</span> Security Boundaries (Phase 7)
            </div>
            <ul className="space-y-2 text-[11px] leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-400">✓</span>
                <span><strong className="text-slate-300">Safe Metadata Edits:</strong> You can edit display titles and categories.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-amber-400">⚠</span>
                <span><strong className="text-slate-300">No Content Replacement:</strong> Document payload replacement is explicitly unbuilt to preserve tamper-proof audit integrity.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-red-400">✕</span>
                <span><strong className="text-slate-300">Soft Deletion:</strong> Soft-deleted documents immediately vanish from all routes. Storage objects are retained for recovery audit compliance.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-slate-500">○</span>
                <span><strong className="text-slate-400">Unbuilt:</strong> Bulk export and Admin Activity dashboard are scheduled for future phases.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Search & Filter Bar + Document Catalog */}
        <div className="lg:col-span-2 space-y-6">
          {/* Filter Bar Controls */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur-md space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Search query */}
              <div className="sm:col-span-2 md:col-span-1">
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Search Display Name</label>
                <input
                  type="text"
                  maxLength={100}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by title..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Category filter */}
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 capitalize"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ownership filter */}
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Ownership</label>
                <select
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value as 'all' | 'mine' | 'shared')}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">All Accessible</option>
                  <option value="mine">Owned by Me</option>
                  <option value="shared">Shared with Me</option>
                </select>
              </div>
            </div>

            {/* Date range filter */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase text-slate-400">Created:</span>
                <input
                  type="date"
                  value={createdAfter}
                  onChange={(e) => setCreatedAfter(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500"
                  title="Created After"
                />
                <span className="text-slate-500 text-[10px]">to</span>
                <input
                  type="date"
                  value={createdBefore}
                  onChange={(e) => setCreatedBefore(e.target.value)}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500"
                  title="Created Before"
                />
              </div>

              {(search || selectedCategory || ownerFilter !== 'all' || createdAfter || createdBefore) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setSelectedCategory('');
                    setOwnerFilter('all');
                    setCreatedAfter('');
                    setCreatedBefore('');
                  }}
                  className="ml-auto text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Document Catalog Results */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 font-mono">
                Accessible Documents ({documents.length})
              </h2>
              {loading && (
                <span className="text-xs font-mono text-cyan-400 animate-pulse flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Querying database...
                </span>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-xl border border-red-500/40 bg-red-950/30 text-xs text-red-300">
                {error}
              </div>
            )}

            {!loading && documents.length === 0 && (
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-12 text-center space-y-3">
                <span className="text-3xl block">📁</span>
                <h3 className="text-base font-bold text-slate-300">No Documents Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {search || selectedCategory || ownerFilter !== 'all' || createdAfter || createdBefore
                    ? 'No accessible documents match your active filter criteria. Try resetting filters.'
                    : 'Your vault is currently empty. Upload your first document using the panel on the left.'}
                </p>
              </div>
            )}

            {/* Document Cards List */}
            <div className="space-y-3">
              {documents.map((doc) => {
                const canEdit = doc.isOwner || doc.permission === 'EDIT';
                const canDelete = doc.isOwner;

                return (
                  <div
                    key={doc.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg backdrop-blur-md hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Display Name safely rendered as text node (never raw HTML) */}
                        <span className="font-bold text-sm text-white truncate max-w-[280px] sm:max-w-[360px]" title={doc.displayName}>
                          {doc.displayName}
                        </span>

                        {/* Category Tag */}
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800/80 text-slate-300">
                          {doc.category}
                        </span>

                        {/* Authorization Badge */}
                        {doc.isOwner ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold">
                            Owner
                          </span>
                        ) : doc.permission === 'EDIT' ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-semibold">
                            Can Edit
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800/60 text-slate-400">
                            Can View
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                        <span>{formatBytes(doc.sizeBytes)}</span>
                        <span>•</span>
                        <span>{doc.contentType}</span>
                        <span>•</span>
                        <span>{formatDate(doc.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Download Button */}
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        download
                        className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Download document binary"
                      >
                        <span>⬇️</span> Download
                      </a>

                      {/* Edit Metadata Button (Owner or EDIT grantee only) */}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(doc)}
                          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer"
                          title="Edit safe metadata (Title and Category)"
                        >
                          ✏️ Edit
                        </button>
                      )}

                      {/* Soft Delete Button (Owner only) */}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeletingDoc(doc)}
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-all cursor-pointer"
                          title="Soft-delete document"
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Metadata Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>✏️</span> Edit Metadata
              </h3>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">
                  Display Title
                </label>
                <input
                  type="text"
                  maxLength={255}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 uppercase">
                  Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 capitalize"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
                Notice: File payload replacement is prohibited. Only safe metadata fields are modified.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editDisplayName.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Soft Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
                <span>🗑️</span> Confirm Soft Deletion
              </h3>
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">&ldquo;{deletingDoc.displayName}&rdquo;</strong>?
            </p>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2 text-[11px] text-slate-400">
              <p>
                • This document will immediately disappear from list/search, metadata, and download routes.
              </p>
              <p>
                • Storage object retained in private bucket to prevent accidental data loss and maintain forensic audit logs.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleSoftDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
