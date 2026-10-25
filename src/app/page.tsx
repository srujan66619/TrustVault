import Link from 'next/link';
import VaultScene from '@/components/ui/VaultScene';

export default function HomePage() {
  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-8">
      {/* ==================================================================== */}
      {/* HERO SECTION WITH REAL 3D PROCEDURAL VAULT DOOR                     */}
      {/* ==================================================================== */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950 p-6 sm:p-10 lg:p-14 shadow-2xl">
        {/* Subtle background ambient radial gradients */}
        <div className="absolute top-0 right-1/4 -z-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -z-10 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left Column: Value Proposition & Call to Actions */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Zero-Trust Document Security</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                Document security{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-violet-400 bg-clip-text text-transparent">
                  that holds.
                </span>
              </h1>
            </div>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              Share sensitive documents with verified access, private downloads, immediate permission revocation, and tamper-evident activity.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="#security-model"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Explore the security model</span>
              </a>

              <Link
                href="/documents"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-600 hover:text-white transition-all cursor-pointer"
              >
                <span>Open Document Vault</span>
                <span className="text-cyan-400">→</span>
              </Link>

              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors py-2"
              >
                <span>Account overview →</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Interactive 3D Procedural Vault Canvas */}
          <div className="lg:col-span-5 w-full">
            <VaultScene />
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* THREE-CARD SECURITY SECTION                                         */}
      {/* ==================================================================== */}
      <section id="security-model" className="space-y-8 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs font-mono text-slate-400">
            Defense in Depth
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Core Security Controls
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Engineered from database triggers to server routes to protect sensitive documents at every layer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Verified access */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4 hover:border-cyan-500/40 transition-all shadow-lg hover:shadow-cyan-500/5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                Verified access
              </h3>
              <span className="text-[11px] font-mono text-cyan-400 font-semibold block uppercase">
                Per-Request Server Authorization
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Every document view and download request is authenticated and re-authorized server-side against live database roles and account status. Browser clients hold zero direct database or storage privileges.
            </p>

            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span className="text-[10px] font-mono text-slate-400">
                Centralized Decision Core
              </span>
            </div>
          </div>

          {/* Card 2: Instant revocation */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4 hover:border-violet-500/40 transition-all shadow-lg hover:shadow-violet-500/5">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                Instant revocation
              </h3>
              <span className="text-[11px] font-mono text-violet-400 font-semibold block uppercase">
                Zero Token-Expiry Window
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              When an owner revokes permission, access ceases on the very next request. Downloads stream through private server routes with immediate pre-stream verification, eliminating signed URL exposure.
            </p>

            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              <span className="text-[10px] font-mono text-slate-400">
                Immediate Route Halting
              </span>
            </div>
          </div>

          {/* Card 3: Tamper-evident activity */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4 hover:border-blue-500/40 transition-all shadow-lg hover:shadow-blue-500/5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                Tamper-evident activity
              </h3>
              <span className="text-[11px] font-mono text-blue-400 font-semibold block uppercase">
                Cryptographic Rolling Hash Chain
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Every upload, access attempt, permission modification, and administrative check is written to an append-only audit trail protected by PostgreSQL triggers and verified by rolling SHA-256 hash continuity.
            </p>

            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-[10px] font-mono text-slate-400">
                Audited & Verifiable Integrity
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* CONTROLLED SHARING ARCHITECTURE                                     */}
      {/* ==================================================================== */}
      <section id="architecture" className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 sm:p-12 space-y-8 scroll-mt-24">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-400">
            System Architecture
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Built for controlled sharing
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            TrustVault enforces strict capability separation, zero-trust administrative boundaries, and active anti-enumeration defenses across every workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
              01. Strict Separation
            </div>
            <h4 className="text-sm font-semibold text-white">Granular Capabilities</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              <code className="text-cyan-300">READ</code>, <code className="text-cyan-300">DOWNLOAD</code>, and <code className="text-cyan-300">EDIT</code> rights are enforced server-side. Grantees cannot re-share documents with third parties.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-violet-400 uppercase tracking-wider">
              02. Zero-Trust Admin
            </div>
            <h4 className="text-sm font-semibold text-white">Zero-Trust Admin</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Administrators hold compliance and audit inspection capabilities (<code className="text-violet-300">VIEW_AUDIT</code>), but have zero backdoors to read or download private document contents.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">
              03. Anti-Enumeration
            </div>
            <h4 className="text-sm font-semibold text-white">IDOR Protection</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Probing nonexistent or unauthorized document IDs returns a uniform <code className="text-sky-300">404 Document not found</code>, preventing attackers from mapping document existence.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
              04. Storage Isolation
            </div>
            <h4 className="text-sm font-semibold text-white">Storage Isolation</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Stored files are mapped to randomized UUID keys in private Storage buckets with zero browser-direct access. Physical paths are completely decoupled from user-facing filenames.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
