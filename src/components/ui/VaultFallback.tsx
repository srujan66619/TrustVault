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
      className="relative w-full h-[380px] sm:h-[460px] flex items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-950/80 shadow-[0_0_60px_rgba(6,182,212,0.12)]"
      aria-label="TrustVault security vault illustration with circular locking door"
      role="img"
    >
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.14)_0%,rgba(139,92,246,0.06)_45%,transparent_70%)]" />

      {/* Subtle perspective cybernetic grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />

      {/* Heavy Circular Vault Door Assembly */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Outer Heavy Beveled Frame */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full border-4 border-slate-700/80 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 p-3 shadow-2xl flex items-center justify-center">
          {/* Glowing Cyan Security Ring */}
          <div className="absolute inset-2 rounded-full border-2 border-cyan-400/50 shadow-[0_0_25px_rgba(6,182,212,0.35)]" />

          {/* Recessed Door Chamber */}
          <div className="relative w-full h-full rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
            {/* Concentric Reinforcing Rings */}
            <div className="absolute inset-6 rounded-full border border-slate-700/60" />
            <div className="absolute inset-12 rounded-full border border-cyan-500/20" />

            {/* Radial Locking Bolts */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <div
                key={deg}
                className="absolute w-2 h-7 bg-gradient-to-t from-slate-400 to-slate-200 rounded-sm shadow-md"
                style={{
                  transform: `rotate(${deg}deg) translateY(-85px)`,
                }}
              />
            ))}

            {/* Center Locking Wheel (Rotates slowly unless reduced motion) */}
            <div
              className={`relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-slate-200/90 bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center ${
                reducedMotion ? '' : 'animate-[spin_24s_linear_infinite]'
              }`}
            >
              {/* Wheel Spokes */}
              {[0, 60, 120].map((deg) => (
                <div
                  key={deg}
                  className="absolute w-1.5 h-full bg-slate-400/80 rounded-full"
                  style={{ transform: `rotate(${deg}deg)` }}
                />
              ))}

              {/* Central Glowing Cyan Hub */}
              <div className="relative z-10 w-10 h-10 rounded-full bg-slate-900 border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)] flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-cyan-400 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
