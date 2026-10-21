export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-900/20 p-8 sm:p-12">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Phase 1 Baseline: Secure Document Sharing is NOT implemented yet
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Security-First Document Vault
          </h1>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
            TrustVault is engineered around uncompromising authorization guarantees, 
            tamper-evident audit logging, and zero-trust document streaming.
          </p>
        </div>
      </section>

      {/* Security Scope & System Status Matrix */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Phase 1 Delivered Boundaries */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Phase 1 Scope (Implemented)
          </div>
          <ul className="text-xs space-y-2.5 text-slate-300 font-mono">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Next.js App Router (TypeScript, Tailwind CSS)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Baseline navigation with explicit status banners</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Strict `.gitignore` isolating `.env*` from git tracking</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Compile-time guarded server-only Supabase wrapper (`server-only`)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>Browser Supabase client restricted to public anon key</span>
            </li>
          </ul>
        </div>

        {/* Explicitly Unimplemented Capabilities */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Strictly Unimplemented in Phase 1
          </div>
          <ul className="text-xs space-y-2 text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span><strong>Document Upload / Download</strong>: Storage buckets and streaming routes are not yet configured.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span><strong>Central Authorization</strong>: The <code className="text-slate-200">authorize()</code> choke point will be built in subsequent phases.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span><strong>User Authentication & Roles</strong>: Login, sessions, and profile roles (ADMIN/OWNER/VIEWER) are pending.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span><strong>Audit Logging</strong>: Cryptographic hash-chained audit trails are not yet initialized.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">•</span>
              <span><strong>Service Role Key</strong>: Strictly excluded, unreferenced, and unused.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Security Architecture Principle Notice */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Engineering Invariant
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          In TrustVault, security is the product. UI elements will never misrepresent security state. 
          Until centralized database authorization, private bucket streaming, and cryptographic hash chains 
          are verified with automated test suites, document management remains intentionally disabled.
        </p>
      </section>
    </div>
  );
}
