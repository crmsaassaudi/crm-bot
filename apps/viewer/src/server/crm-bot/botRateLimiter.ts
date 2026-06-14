import redis from "@typebot.io/lib/redis";

/** Maximum requests per tenant per window. */
const RATE_LIMIT_MAX = 1_000;

/** Sliding window duration in seconds. */
const RATE_LIMIT_WINDOW_SECONDS = 60;

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
};

/**
 * Per-tenant rate limiter using Redis fixed-window INCR counter.
 *
 * Design: Simple INCR + EXPIRE (1 Redis command on hot path).
 * This is O(1) and does NOT grow memory per request, unlike sorted-set
 * sliding window which stores N entries and requires 4 ops per check.
 *
 * Falls back to "allow" if Redis is unavailable (fail-open for availability).
 */
export const checkBotRateLimit = async (
  tenantId: string,
): Promise<RateLimitResult> => {
  if (!redis) {
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }

  // Fixed-window counter: key rotates every RATE_LIMIT_WINDOW_SECONDS
  const windowId = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS);
  const key = `crm-bot:rl:${tenantId}:${windowId}`;

  try {
    // Single atomic INCR — O(1), no sorted set overhead
    const count = await redis.incr(key);

    // Set TTL only on first increment to auto-cleanup
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS + 1);
    }

    if (count > RATE_LIMIT_MAX) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS,
      };
    }

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX - count,
    };
  } catch {
    // Redis error → fail-open
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }
};
