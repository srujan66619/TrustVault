import Link from 'next/link';
import VaultScene from '@/components/ui/VaultScene';

export default function HomePage() {
  return (
    <div className="space-y-20 sm:space-y-28 py-2 sm:py-6">
      {/* ==================================================================== */}
      {/* FULL-BLEED SEAMLESS HERO WITH 3D BANK VAULT DOOR                    */}
      {/* ==================================================================== */}
      <section className="relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left Column: Value Proposition & Refined Action Hierarchy */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400 backdrop-blur-md shadow-sm shadow-cyan-500/10">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Zero-Trust Document Security</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
                Document security{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-violet-400 bg-clip-text text-transparent">
                  that holds.
                </span>
              </h1>
              <p className="text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-xl">
                Share sensitive documents with verified access, private downloads, immediate permission revocation, and tamper-evident activity.
              </p>
            </div>

            {/* Focused Two-Button Hierarchy */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <Link
                href="/documents"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-400/40 hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer"
              >
                <span>Open Document Vault</span>
                <span className="text-cyan-200 group-hover:translate-x-1 transition-transform">→</span>
              </Link>

              <a
                href="#security-model"
                className="group inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md px-5 py-3.5 text-sm font-semibold text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-slate-800/80 transition-all duration-300 cursor-pointer"
              >
                <svg className="w-4 h-4 text-cyan-400/80 group-hover:text-cyan-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Explore security model</span>
              </a>
            </div>
          </div>

          {/* Right Column: Seamless 3D Vault (No bounding box or frame) */}
          <div className="lg:col-span-5 w-full flex items-center justify-center">
            <VaultScene />
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* THREE-CARD SECURITY SECTION: VERIFIED, INSTANT, TAMPER-EVIDENT       */}
      {/* ==================================================================== */}
      <section id="security-model" className="space-y-8 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto space-y-2.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs font-mono text-slate-400 backdrop-blur-md">
            Defense in Depth
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Core Security Controls
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Engineered from database triggers to server routes to protect sensitive documents at every layer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Verified access */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md p-6 space-y-4 hover:border-cyan-500/40 transition-all duration-300 shadow-lg hover:shadow-cyan-500/5 group">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                Verified access
              </h3>
              <span className="text-[11px] font-mono text-cyan-400 font-semibold block uppercase">
                Per-Request Server Authorization
              </span>
            </div>

            <p className="text-xs text-slate-300/90 leading-relaxed">
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
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md p-6 space-y-4 hover:border-violet-500/40 transition-all duration-300 shadow-lg hover:shadow-violet-500/5 group">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white group-hover:text-violet-300 transition-colors">
                Instant revocation
              </h3>
              <span className="text-[11px] font-mono text-violet-400 font-semibold block uppercase">
                Zero Token-Expiry Window
              </span>
            </div>

            <p className="text-xs text-slate-300/90 leading-relaxed">
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
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md p-6 space-y-4 hover:border-blue-500/40 transition-all duration-300 shadow-lg hover:shadow-blue-500/5 group">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                Tamper-evident activity
              </h3>
              <span className="text-[11px] font-mono text-blue-400 font-semibold block uppercase">
                Cryptographic Rolling Hash Chain
              </span>
            </div>

            <p className="text-xs text-slate-300/90 leading-relaxed">
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
      <section id="architecture" className="rounded-3xl border border-slate-800/70 bg-slate-900/30 backdrop-blur-md p-8 sm:p-12 space-y-8 scroll-mt-24 shadow-xl">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-400">
            System Architecture
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Built for controlled sharing
          </h2>
          <p className="text-sm text-slate-300/90 leading-relaxed">
            TrustVault enforces strict capability separation, zero-trust administrative boundaries, and active anti-enumeration defenses across every workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
              01. Strict Separation
            </div>
            <h4 className="text-sm font-semibold text-white">Granular Capabilities</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              <code className="text-cyan-300">READ</code>, <code className="text-cyan-300">DOWNLOAD</code>, and <code className="text-cyan-300">EDIT</code> rights are enforced server-side. Grantees cannot re-share documents with third parties.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-violet-400 uppercase tracking-wider">
              02. Zero-Trust Admin
            </div>
            <h4 className="text-sm font-semibold text-white">Zero-Trust Admin</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Administrators hold compliance and audit inspection capabilities (<code className="text-violet-300">VIEW_AUDIT</code>), but have zero backdoors to read or download private document contents.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">
              03. Anti-Enumeration
            </div>
            <h4 className="text-sm font-semibold text-white">IDOR Protection</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Probing nonexistent or unauthorized document IDs returns a uniform <code className="text-sky-300">404 Document not found</code>, preventing attackers from mapping document existence.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
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
