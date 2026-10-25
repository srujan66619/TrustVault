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
      className="relative w-full h-[380px] sm:h-[460px] lg:h-[520px] flex items-center justify-center select-none"
      aria-label="TrustVault bank vault door illustration"
      role="img"
    >
      {/* Ambient Radial Bloom blending naturally into full-bleed dark page */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.14)_0%,rgba(124,58,237,0.06)_40%,transparent_70%)] pointer-events-none" />

      {/* Heavy Circular Vault Door Assembly (No square frame/box) */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Outer Heavy Beveled Flange */}
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 rounded-full border-4 border-slate-700/80 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 p-4 shadow-[0_0_80px_rgba(6,182,212,0.18)] flex items-center justify-center">
          {/* Seam Cyan Light */}
          <div className="absolute inset-2.5 rounded-full border-2 border-cyan-400/60 shadow-[0_0_30px_rgba(6,182,212,0.45)]" />

          {/* Recessed Door Chamber */}
          <div className="relative w-full h-full rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden">
            {/* Concentric Reinforcing Rings */}
            <div className="absolute inset-6 rounded-full border border-slate-700/60" />
            <div className="absolute inset-12 rounded-full border border-cyan-500/25" />

            {/* Radial Locking Bolts */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <div
                key={deg}
                className="absolute w-2.5 h-8 sm:h-10 bg-gradient-to-t from-slate-400 to-slate-200 rounded-sm shadow-md"
                style={{
                  transform: `rotate(${deg}deg) translateY(-110px)`,
                }}
              />
            ))}

            {/* Center Locking Wheel (Rotates slowly unless reduced motion) */}
            <div
              className={`relative z-10 w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-slate-200/95 bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 shadow-[0_0_30px_rgba(255,255,255,0.25)] flex items-center justify-center ${
                reducedMotion ? '' : 'animate-[spin_24s_linear_infinite]'
              }`}
            >
              {/* Wheel Spokes */}
              {[0, 60, 120].map((deg) => (
                <div
                  key={deg}
                  className="absolute w-2 h-full bg-slate-400/80 rounded-full"
                  style={{ transform: `rotate(${deg}deg)` }}
                />
              ))}

              {/* Central Glowing Cyan Hub */}
              <div className="relative z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-900 border-2 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.7)] flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-cyan-400 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
