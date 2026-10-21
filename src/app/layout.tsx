import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustVault — Secure Document Sharing",
  description:
    "Security-first document sharing platform with strict authorization, tamper-evident audit trails, and instant revocation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-slate-950 text-slate-100 antialiased">
      <body className="min-h-full flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
        {/* Navigation Bar */}
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
                TV
              </div>
              <span className="font-semibold text-lg tracking-tight text-white">
                TrustVault
              </span>
              <span className="ml-2 text-xs font-mono uppercase px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                Phase 1 Foundation
              </span>
            </div>

            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link
                href="/"
                className="text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Home
              </Link>
              <span
                className="text-slate-500 cursor-not-allowed flex items-center gap-1.5"
                title="Documents placeholder (Unimplemented in Phase 1)"
              >
                Documents
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-slate-800/80 text-slate-400 rounded">
                  Pending
                </span>
              </span>
              <span
                className="text-slate-500 cursor-not-allowed flex items-center gap-1.5"
                title="Activity log placeholder (Unimplemented in Phase 1)"
              >
                Activity
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-slate-800/80 text-slate-400 rounded">
                  Pending
                </span>
              </span>
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
          <div className="max-w-6xl mx-auto px-4">
            <p>TrustVault — Security is the product; CRUD is secondary.</p>
            <p className="mt-1 font-mono text-[11px] text-slate-600">
              Current state: Phase 1 Application Foundation. Secure storage, auth, and audit modules are deliberately not built.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
