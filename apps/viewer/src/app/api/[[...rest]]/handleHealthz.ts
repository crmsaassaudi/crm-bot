import prisma from "@typebot.io/prisma";
import redis from "@typebot.io/lib/redis";
import { getConcurrencyStats } from "../../../server/crm-bot/concurrencyLimiter";

type HealthStatus = {
  status: "ok" | "degraded" | "unhealthy";
  postgres?: "connected" | "error";
  redis?: "connected" | "disconnected" | "not_configured";
  uptimeSeconds?: number;
  /** Bot processing concurrency stats */
  processing?: {
    active: number;
    queued: number;
    maxConcurrent: number;
    maxQueue: number;
  };
  error?: string;
};

const startedAt = Date.now();

/**
 * Health check endpoint handler.
 *
 * Shallow mode (default): Returns { status: "ok" } — suitable for load balancer probes.
 * Deep mode (?deep=true): Verifies PostgreSQL + Redis connectivity — use for alerting.
 */
export const handleHealthz = async (
  params?: { deep?: boolean },
): Promise<HealthStatus> => {
  if (!params?.deep) {
    return { status: "ok" as const };
  }

  const result: HealthStatus = {
    status: "ok",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  };

  // Check PostgreSQL
  try {
    await prisma.$queryRaw`SELECT 1`;
    result.postgres = "connected";
  } catch (error) {
    result.postgres = "error";
    result.status = "unhealthy";
    result.error = error instanceof Error ? error.message : "Postgres check failed";
  }

  // Check Redis
  if (redis) {
    try {
      const pong = await redis.ping();
      result.redis = pong === "PONG" ? "connected" : "disconnected";
      if (result.redis !== "connected") result.status = "degraded";
    } catch {
      result.redis = "disconnected";
      result.status = "degraded";
    }
  } else {
    result.redis = "not_configured";
  }

  // Bot processing pressure
  result.processing = getConcurrencyStats();

  return result;
};
