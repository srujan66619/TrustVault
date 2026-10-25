'use client';

import { useState } from 'react';

interface PasswordInputProps {
  id?: string;
  name?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

/**
 * Secure Password Input with Accessible Visibility Toggle
 *
 * Security & Accessibility Invariants:
 * - Toggles strictly between type="password" and type="text".
 * - Toggle control is explicitly type="button", preventing accidental form submissions.
 * - Dynamic aria-label ("Show password" / "Hide password") informs assistive technologies.
 * - Completely ephemeral local boolean state; never logs, stores, transmits, or caches the secret.
 * - Retains native autocomplete="current-password" for password manager integration.
 */
export function PasswordInput({
  id = 'password',
  name = 'password',
  autoComplete = 'current-password',
  placeholder = '••••••••••••',
  required = true,
  className = '',
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={showPassword ? 'text' : 'password'}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`input-glass w-full rounded-lg pl-3 pr-10 py-2 text-sm text-slate-100 placeholder-slate-500 transition-all ${className}`}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-cyan-400 focus:outline-none focus:text-cyan-400 transition-colors cursor-pointer"
        tabIndex={0}
      >
        {showPassword ? (
          // Eye-Off Icon
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
            />
          </svg>
        ) : (
          // Eye Icon
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
