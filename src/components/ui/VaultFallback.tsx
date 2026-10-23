'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getServerSnapshot() {
  return false;
}

export default function VaultFallback() {
  const reducedMotion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);


  return (
    <div
      className="relative w-full h-[360px] sm:h-[440px] flex items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950/80 shadow-[0_0_50px_rgba(6,182,212,0.1)]"
      aria-label="TrustVault cryptographic containment cube illustration"
      role="img"
    >
      {/* Reduced-motion CSS override style */}
      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          .vault-cube-spin {
            animation: none !important;
            transform: rotateX(15deg) rotateY(25deg) !important;
          }
        }
      `}</style>

      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.12)_0%,rgba(139,92,246,0.06)_40%,transparent_70%)]" />

      {/* Cybernetic grid lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />

      {/* CSS 3D Cube Container */}
      <div className="relative z-10 flex flex-col items-center justify-center scale-90 sm:scale-100">
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 [perspective:800px]">
          {/* Animated Rotating Outer Box with explicit reduced-motion guard */}
          <div
            className={`w-full h-full relative [transform-style:preserve-3d] vault-cube-spin motion-reduce:animate-none ${
              reducedMotion
                ? '[transform:rotateX(15deg)_rotateY(25deg)]'
                : 'animate-[spin_20s_linear_infinite]'
            }`}
          >
            {/* Front Face */}
            <div className="absolute inset-0 border border-cyan-400/50 bg-slate-900/60 backdrop-blur-sm shadow-[0_0_20px_rgba(6,182,212,0.25)] flex items-center justify-center [transform:translateZ(72px)] sm:[transform:translateZ(88px)]">
              <div className="w-16 h-20 rounded border border-cyan-300/40 bg-cyan-950/40 flex flex-col items-center justify-center p-2 shadow-inner">
                <div className="w-8 h-1 bg-cyan-400/80 rounded mb-1.5" />
                <div className="w-10 h-0.5 bg-slate-400/60 rounded mb-1" />
                <div className="w-10 h-0.5 bg-slate-400/60 rounded mb-1" />
                <div className="w-6 h-0.5 bg-slate-400/60 rounded" />
                <span className="mt-2 text-[9px] font-mono text-cyan-300 font-bold uppercase tracking-widest">
                  VAULT
                </span>
              </div>
            </div>

            {/* Back Face */}
            <div className="absolute inset-0 border border-violet-500/40 bg-slate-900/60 backdrop-blur-sm [transform:rotateY(180deg)_translateZ(72px)] sm:[transform:rotateY(180deg)_translateZ(88px)]" />

            {/* Left Face */}
            <div className="absolute inset-0 border border-cyan-500/40 bg-slate-900/60 backdrop-blur-sm [transform:rotateY(-90deg)_translateZ(72px)] sm:[transform:rotateY(-90deg)_translateZ(88px)]" />

            {/* Right Face */}
            <div className="absolute inset-0 border border-violet-500/40 bg-slate-900/60 backdrop-blur-sm [transform:rotateY(90deg)_translateZ(72px)] sm:[transform:rotateY(90deg)_translateZ(88px)]" />

            {/* Top Face */}
            <div className="absolute inset-0 border border-cyan-400/40 bg-slate-900/60 backdrop-blur-sm [transform:rotateX(90deg)_translateZ(72px)] sm:[transform:rotateX(90deg)_translateZ(88px)]" />

            {/* Bottom Face */}
            <div className="absolute inset-0 border border-violet-500/40 bg-slate-900/60 backdrop-blur-sm [transform:rotateX(-90deg)_translateZ(72px)] sm:[transform:rotateX(-90deg)_translateZ(88px)]" />
          </div>
        </div>

        {/* Status indicator: Clearly marked as visual architecture concept */}
        <div className="mt-8 flex items-center gap-2 rounded-full border border-cyan-500/30 bg-slate-900/80 px-3 py-1 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[11px] font-mono text-slate-300">
            Visual Architecture Model (CSS 3D Fallback)
          </span>
        </div>
      </div>
    </div>
  );
}
