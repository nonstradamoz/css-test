/**
 * Simple In-Memory Rate Limiter using a Map.
 * Note: In a Serverless environment (like Vercel), this state is local to each instance
 * and clears on cold starts. For true global rate limiting, use Redis (e.g., @upstash/ratelimit).
 */

type RateLimitStore = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitStore>();

// Clean up expired entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref(); // .unref() prevents this interval from keeping the process alive

export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { success: boolean; limit: number; remaining: number; reset: number } {
  const now = Date.now();
  let record = store.get(identifier);

  // If no record or it has expired, reset it
  if (!record || record.resetAt < now) {
    record = {
      count: 0,
      resetAt: now + windowMs,
    };
  }

  // Increment the request count
  record.count += 1;
  store.set(identifier, record);

  const remaining = Math.max(0, limit - record.count);
  const success = record.count <= limit;

  return {
    success,
    limit,
    remaining,
    reset: record.resetAt,
  };
}

/**
 * Helper to get the client IP from Next.js Request headers
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'anonymous_ip';
}
