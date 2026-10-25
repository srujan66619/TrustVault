import { NextResponse } from 'next/server';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining: number;
  errorResponse?: NextResponse;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory bucket store.
// Per-instance limitation: documented in THREATS.md that on multi-instance serverless deployments,
// this rate limit is per container/instance unless backed by Redis/Upstash.
const rateLimitStore = new Map<string, Bucket>();

/**
 * Checks and increments an in-memory rate limit counter.
 * Concurrency-safe in Node.js event-loop for local execution.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  let bucket = rateLimitStore.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 1,
      resetAt: now + options.windowMs,
    };
    rateLimitStore.set(key, bucket);
    return {
      allowed: true,
      remaining: options.limit - 1,
    };
  }

  if (bucket.count >= options.limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfter,
      remaining: 0,
      errorResponse: NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
          },
        }
      ),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: options.limit - bucket.count,
  };
}

/**
 * Resets all rate limits in memory. Strictly for automated testing and resets.
 */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}

// Pre-configured rate limit helpers
export const RATE_LIMITS = {
  LOGIN: { limit: 5, windowMs: 15 * 60 * 1000 }, // 5 per 15 min
  UPLOAD: { limit: 20, windowMs: 60 * 1000 }, // 20 per minute
  PERMISSIONS: { limit: 20, windowMs: 60 * 1000 }, // 20 per minute
  AUDIT_VERIFY: { limit: 5, windowMs: 60 * 1000 }, // 5 per minute
  DENIED_ACCESS: { limit: 10, windowMs: 5 * 60 * 1000 }, // 10 denied probes per 5 min
};

export function checkLoginRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(`login:${identifier}`, RATE_LIMITS.LOGIN);
}

export function checkUploadRateLimit(actorId: string): RateLimitResult {
  return checkRateLimit(`upload:${actorId}`, RATE_LIMITS.UPLOAD);
}

export function checkPermissionsRateLimit(actorId: string): RateLimitResult {
  return checkRateLimit(`permissions:${actorId}`, RATE_LIMITS.PERMISSIONS);
}

export function checkVerifyRateLimit(actorId: string): RateLimitResult {
  return checkRateLimit(`audit_verify:${actorId}`, RATE_LIMITS.AUDIT_VERIFY);
}

export function checkDeniedAccessRateLimit(identifier: string): RateLimitResult {
  return checkRateLimit(`denied_access:${identifier}`, RATE_LIMITS.DENIED_ACCESS);
}
