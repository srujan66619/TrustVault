import type { Metadata } from "next";
import Link from "next/link";
import SiteBackdrop from "@/components/ui/SiteBackdrop";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustVault — Document Security That Holds",
  description:
    "Zero-trust document sharing platform with verified access, private streaming downloads, immediate permission revocation, and tamper-evident activity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-slate-950 text-slate-100 antialiased">
      <body className="min-h-full flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300 relative bg-[#020617] text-slate-100">
        {/* Full-Bleed Atmospheric Backdrop */}
        <SiteBackdrop />

        {/* Translucent Dark Glass Navigation Bar */}
        <header className="sticky top-0 z-50 w-full border-b border-cyan-500/10 bg-slate-950/40 backdrop-blur-xl transition-all duration-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-400/40 transition-all duration-300">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <span className="font-bold text-lg tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                TrustVault
              </span>
            </Link>

            {/* Navigation Links */}
            <nav className="flex items-center gap-2 sm:gap-6 text-xs sm:text-sm font-medium">
              <Link
                href="/"
                className="text-cyan-400 hover:text-cyan-300 transition-colors px-2 py-1"
              >
                Home
              </Link>
              <Link
                href="/documents"
                className="text-slate-300 hover:text-white transition-colors px-2 py-1"
              >
                Documents
              </Link>
              <Link
                href="/activity"
                className="text-slate-300 hover:text-white transition-colors px-2 py-1"
              >
                Activity
              </Link>
              <Link
                href="/account"
                className="text-slate-300 hover:text-white transition-colors px-2 py-1"
              >
                Account
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/40 hover:text-white transition-all duration-300 shadow-sm shadow-cyan-500/10 ml-1"
              >
                Sign In
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
          {children}
        </main>

        {/* Translucent Dark Glass Footer */}
        <footer className="w-full border-t border-slate-900/80 bg-slate-950/60 backdrop-blur-md py-6 text-center text-xs text-slate-500 relative z-10">
          <div className="max-w-7xl mx-auto px-4 space-y-1.5">
            <p className="font-medium text-slate-400">TrustVault — Document security that holds.</p>
            <p className="font-mono text-[11px] text-slate-500">
              Verified access • Instant revocation • Tamper-evident activity
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
