import Link from 'next/link';
import VaultScene from '@/components/ui/VaultScene';

export default function HomePage() {
  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-8">
      {/* ==================================================================== */}
      {/* HERO SECTION WITH INTERACTIVE 3D VAULT                               */}
      {/* ==================================================================== */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950 p-6 sm:p-10 lg:p-14 shadow-2xl">
        {/* Subtle background ambient radial gradients */}
        <div className="absolute top-0 right-1/4 -z-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -z-10 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left Column: Value Proposition & Call to Actions */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>TrustVault • Security Controls Being Built</span>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-widest text-slate-400 font-bold block">
                Product Name: TrustVault
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                Document security{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-violet-400 bg-clip-text text-transparent">
                  that holds.
                </span>
              </h1>
            </div>

            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
              Planned architecture: Access will be verified at every request, and permissions will be revocable immediately.
              The foundation is engineered with PostgreSQL Row-Level Security and a centralized server-side
              authorization core; live document routes and private storage access are coming in a later phase.
            </p>

            {/* Action Buttons with explicit placeholder badges */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <a
                href="#security-model"
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition-all cursor-pointer"
              >
                <span>Explore security model</span>
                <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-cyan-200">
                  Planned Architecture
                </span>
              </a>

              <a
                href="#architecture"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:border-slate-600 hover:text-white transition-all cursor-pointer"
              >
                <span>View architecture</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-slate-400">
                  Phase 3 Spec
                </span>
              </a>

              <Link
                href="/account"
                className="inline-flex items-center gap-2 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors py-2"
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
      {/* THREE-CARD SECURITY SECTION: CONTROLS BEING BUILT                    */}
      {/* ==================================================================== */}
      <section id="security-model" className="space-y-8 scroll-mt-24">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs font-mono text-slate-400">
            Target Security Specifications
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Security Controls Being Built
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Architecture designs and defense-in-depth principles being implemented across development phases.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Access verification architecture */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4 hover:border-cyan-500/40 transition-all shadow-lg hover:shadow-cyan-500/5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                Access verification architecture
              </h3>
              <span className="text-[11px] font-mono text-cyan-400 font-semibold block uppercase">
                Planned Architecture • Coming in a Later Phase
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Planned target: Access will be verified at every request across all document routes.
              Currently implemented: Unit-tested server-side <code className="text-cyan-300 font-mono">authorize()</code> decision
              core and live database profile status checks. Live document streaming and download endpoints are not yet operational.
            </p>

            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-mono text-slate-400">
                Core Tested • Document Routes Planned
              </span>
            </div>
          </div>

          {/* Card 2: Immediate revocation design */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4 hover:border-violet-500/40 transition-all shadow-lg hover:shadow-violet-500/5">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                Immediate revocation design
              </h3>
              <span className="text-[11px] font-mono text-violet-400 font-semibold block uppercase">
                Target Security Model • In Development
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Target design: Eliminate reliance on cached JWT permissions by checking database status directly, aiming for zero token-expiry window.
              Currently implemented: Server authorization tests reject <code className="text-violet-300 font-mono">DISABLED</code> profiles;
              live permission revocation endpoints and instant route halting will be wired in Phase 4.
            </p>

            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-mono text-slate-400">
                Model Verified • Endpoints Pending Phase 4
              </span>
            </div>
          </div>

          {/* Card 3: Audit trail & integrity model */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4 hover:border-blue-500/40 transition-all shadow-lg hover:shadow-blue-500/5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                Audit trail & integrity model
              </h3>
              <span className="text-[11px] font-mono text-blue-400 font-semibold block uppercase">
                Security Controls Being Built
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Database foundation: PostgreSQL append-only triggers prevent row updates and table truncates on the audit table.
              Planned: Cryptographic rolling hash-chain protection and automatic audit logging across live document routes are coming in a later phase.
            </p>

            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-mono text-slate-400">
                Triggers Verified • Hash Chain Coming in Later Phase
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* TARGET SHARING ARCHITECTURE (PLANNED)                                 */}
      {/* ==================================================================== */}
      <section id="architecture" className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 sm:p-12 space-y-8 scroll-mt-24">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-400">
            Planned Architecture • Specifications
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Built for controlled sharing (Planned)
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            TrustVault&apos;s target architecture specifies strict capability separation,
            zero-trust administrative boundaries, and active anti-enumeration defenses across upcoming phases.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
              01. Strict Separation
            </div>
            <h4 className="text-sm font-semibold text-white">Granular Capabilities (Planned)</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              <code className="text-cyan-300">READ</code>, <code className="text-cyan-300">DOWNLOAD</code>, and <code className="text-cyan-300">EDIT</code> rights
              are modeled in the schema and <code className="text-cyan-300">authorize()</code> core. Route enforcement and permission management UI are coming in a later phase.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-violet-400 uppercase tracking-wider">
              02. Zero-Trust Admin
            </div>
            <h4 className="text-sm font-semibold text-white">Zero-Trust Admin (Target Boundary)</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Target boundary: Administrators hold compliance audit inspection rights (<code className="text-violet-300">VIEW_AUDIT</code>), but have no automatic content backdoors to read or download private files without explicit permission grants.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">
              03. Anti-Enumeration
            </div>
            <h4 className="text-sm font-semibold text-white">IDOR Protection (Planned Defense)</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Planned architecture: Probing nonexistent or forbidden document UUIDs will return an identical <code className="text-sky-300">NOT_FOUND_OR_DENIED</code> error, preventing attackers from mapping document existence once routes are live.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-2.5">
            <div className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
              04. Storage Isolation
            </div>
            <h4 className="text-sm font-semibold text-white">Storage Isolation (Planned Storage)</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Coming in Phase 4: Stored files will be indexed by randomized UUID keys in private Supabase Storage buckets, keeping raw user filenames decoupled from physical storage object keys.
            </p>
          </div>
        </div>

        {/* Development Status Roadmap Box */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Implementation Status Disclosure
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Operational in live app: Supabase authentication (/login, /account), user profile status checks, and unit-tested authorize() decision core. In development: live document streaming, upload storage, IDOR route protection, and tamper-evident audit hash-chains.
            </p>
          </div>

          <Link
            href="/login"
            className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-all"
          >
            Sign In / Test Auth →
          </Link>
        </div>
      </section>
    </div>
  );
}

