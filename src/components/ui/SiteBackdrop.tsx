'use client';

import React from 'react';

/**
 * SiteBackdrop
 * Fixed, full-bleed cinematic background environment:
 * - Cohesive deep navy/black viewport background with zero white margins
 * - Atmospheric cyan & violet light blooms with gentle drift
 * - Faint perspective floor grid with radial horizon fade
 * - Non-interactive, highly optimized for performance and readability
 */
export default function SiteBackdrop() {
  return (
    <div
      className="fixed inset-0 -z-50 pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* 1. Deep Space Base Layer */}
      <div className="absolute inset-0 bg-[#020617]" />

      {/* 2. Soft Ambient Radial Light Blooms */}
      {/* Cyan bloom top-right behind hero */}
      <div className="absolute -top-32 right-[10%] h-[650px] w-[650px] rounded-full bg-cyan-500/[0.06] blur-[150px]" />
      
      {/* Deep violet bloom top-left */}
      <div className="absolute top-20 -left-40 h-[600px] w-[600px] rounded-full bg-violet-600/[0.05] blur-[140px]" />
      
      {/* Electric blue bloom center-depth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-blue-600/[0.035] blur-[180px]" />
      
      {/* Indigo glow bottom */}
      <div className="absolute -bottom-40 right-1/4 h-[700px] w-[700px] rounded-full bg-indigo-600/[0.04] blur-[160px]" />

      {/* 3. Subtle Cybernetic Perspective Floor Grid */}
      <div
        className="absolute bottom-0 inset-x-0 h-[50vh] opacity-[0.16]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(6, 182, 212, 0.35) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.35) 1px, transparent 1px)
          `,
          backgroundSize: '54px 54px',
          maskImage: 'radial-gradient(ellipse 90% 80% at 50% 100%, black 25%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 100%, black 25%, transparent 85%)',
          transform: 'perspective(600px) rotateX(68deg)',
          transformOrigin: 'bottom center',
        }}
      />

      {/* 4. Fine Atmospheric Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(2,6,23,0.75)_100%)]" />
    </div>
  );
}
