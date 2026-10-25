'use client';

import React from 'react';

/**
 * SiteBackdrop
 * Fixed, full-bleed cinematic background environment:
 * - Cohesive deep navy/black viewport background with zero white margins
 * - Layered cyan & violet ambient light blooms visibly present behind glass panels
 * - Subtle celestial depth with low-opacity stationary and floating particles
 * - Faint cybernetic perspective floor grid and architectural depth guides
 * - Non-interactive (pointer-events-none), zero performance overhead, zero layout shift
 */
export default function SiteBackdrop() {
  return (
    <div
      className="fixed inset-0 -z-50 pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* 1. Deep Space Base Layer */}
      <div className="absolute inset-0 bg-[#020617]" />

      {/* 2. Layered Ambient Cyan / Violet Light Blooms */}
      {/* Cyan primary bloom top-right behind headers & hero */}
      <div className="absolute -top-32 right-[5%] h-[680px] w-[680px] rounded-full bg-cyan-500/[0.09] blur-[140px]" />

      {/* Deep violet bloom top-left */}
      <div className="absolute top-12 -left-28 h-[620px] w-[620px] rounded-full bg-violet-600/[0.08] blur-[130px]" />

      {/* Electric cyan/blue bloom center-depth */}
      <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 h-[750px] w-[750px] rounded-full bg-cyan-600/[0.045] blur-[170px]" />

      {/* Indigo glow bottom-left */}
      <div className="absolute -bottom-36 left-1/4 h-[650px] w-[650px] rounded-full bg-indigo-600/[0.07] blur-[150px]" />

      {/* Subtle violet bloom bottom-right */}
      <div className="absolute bottom-10 -right-20 h-[500px] w-[500px] rounded-full bg-violet-700/[0.06] blur-[140px]" />

      {/* 3. Low-Opacity Architectural Particles (SVG-based for zero GPU/JS overhead) */}
      <svg
        className="absolute inset-0 w-full h-full opacity-35"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="particleGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="particleViolet" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Subtle scattered depth coordinates */}
        <circle cx="8%" cy="14%" r="1.5" fill="url(#particleGlow)" />
        <circle cx="22%" cy="38%" r="1" fill="#38bdf8" opacity="0.4" />
        <circle cx="35%" cy="18%" r="2" fill="url(#particleGlow)" opacity="0.6" />
        <circle cx="48%" cy="52%" r="1.2" fill="#818cf8" opacity="0.3" />
        <circle cx="62%" cy="25%" r="1.5" fill="url(#particleViolet)" opacity="0.5" />
        <circle cx="78%" cy="16%" r="2" fill="url(#particleGlow)" opacity="0.7" />
        <circle cx="88%" cy="42%" r="1" fill="#22d3ee" opacity="0.3" />
        <circle cx="15%" cy="72%" r="1.8" fill="url(#particleGlow)" opacity="0.5" />
        <circle cx="28%" cy="85%" r="1" fill="#818cf8" opacity="0.35" />
        <circle cx="42%" cy="68%" r="1.5" fill="#38bdf8" opacity="0.4" />
        <circle cx="68%" cy="80%" r="1.8" fill="url(#particleGlow)" opacity="0.6" />
        <circle cx="82%" cy="65%" r="1.2" fill="url(#particleViolet)" opacity="0.4" />
        <circle cx="92%" cy="88%" r="1.5" fill="#22d3ee" opacity="0.5" />
        <circle cx="5%" cy="92%" r="1" fill="#38bdf8" opacity="0.3" />
        <circle cx="54%" cy="94%" r="1.5" fill="#818cf8" opacity="0.4" />
      </svg>

      {/* 4. Subtle Cybernetic Perspective Floor Grid */}
      <div
        className="absolute bottom-0 inset-x-0 h-[48vh] opacity-[0.18]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(6, 182, 212, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 100%, black 25%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 100%, black 25%, transparent 85%)',
          transform: 'perspective(600px) rotateX(68deg)',
          transformOrigin: 'bottom center',
        }}
      />

      {/* 5. Fine Atmospheric Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(2,6,23,0.75)_100%)]" />
    </div>
  );
}
