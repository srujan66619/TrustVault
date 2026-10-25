'use client';

import React from 'react';

/**
 * SiteBackdrop
 * Fixed, low-intensity procedural background delivering depth:
 * - Deep space dark foundation with subtle ambient color blooms
 * - Faint perspective grid fading toward the horizon
 * - Non-interactive floating security particles and geometric glyphs
 * - Pure CSS/SVG architecture for maximum mobile and desktop performance without WebGL contention
 */
export default function SiteBackdrop() {
  return (
    <div
      className="fixed inset-0 -z-50 pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Deep Space Base Layer */}
      <div className="absolute inset-0 bg-[#030712]" />

      {/* Atmospheric Radial Color Blooms */}
      <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-cyan-500/[0.04] blur-[140px]" />
      <div className="absolute top-1/3 -right-40 h-[650px] w-[650px] rounded-full bg-violet-600/[0.035] blur-[150px]" />
      <div className="absolute -bottom-40 left-1/3 h-[700px] w-[700px] rounded-full bg-blue-600/[0.03] blur-[160px]" />

      {/* Subtle Perspective Cybernetic Grid (fading upwards) */}
      <div
        className="absolute bottom-0 inset-x-0 h-[45vh] opacity-[0.14]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(6, 182, 212, 0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)',
          transform: 'perspective(500px) rotateX(65deg)',
          transformOrigin: 'bottom center',
        }}
      />

      {/* Faint Floating Cryptographic Anchor Glyphs */}
      <div className="absolute inset-0 opacity-[0.25]">
        {/* Node 1 - Top Right */}
        <div className="absolute top-24 right-[12%] animate-pulse duration-[6000ms]">
          <svg className="w-12 h-12 text-cyan-500/30" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </div>

        {/* Node 2 - Mid Left */}
        <div className="absolute top-1/2 left-[8%] animate-pulse duration-[8000ms]">
          <svg className="w-10 h-10 text-violet-400/25" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1" strokeDasharray="2 4" />
            <line x1="12" y1="8" x2="12" y2="16" strokeWidth="1" />
            <line x1="8" y1="12" x2="16" y2="12" strokeWidth="1" />
          </svg>
        </div>

        {/* Node 3 - Lower Right */}
        <div className="absolute bottom-32 right-[18%] animate-pulse duration-[7000ms]">
          <svg className="w-14 h-14 text-sky-400/20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx="12" cy="12" r="4" strokeWidth="1" />
          </svg>
        </div>
      </div>
    </div>
  );
}
