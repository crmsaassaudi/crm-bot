import { env } from "@typebot.io/env";
import { Redis } from "ioredis";

declare const global: { redis: Redis | undefined };
let redis: Redis | undefined;

/** Production-grade Redis connection options */
const redisOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 200, 2000),
  enableReadyCheck: true,
  // Reconnect automatically on connection loss
  reconnectOnError: (err: Error) => {
    const targetErrors = ["READONLY", "ECONNRESET", "EPIPE"];
    return targetErrors.some((e) => err.message.includes(e));
  },
};

if (env.NODE_ENV === "production" && !process.versions.bun && env.REDIS_URL) {
  redis = new Redis(env.REDIS_URL, redisOptions);
  redis.on("error", (err) =>
    console.error("[Redis] Connection error:", err.message),
  );
} else if (env.REDIS_URL) {
  if (!global.redis) {
    global.redis = new Redis(env.REDIS_URL, redisOptions);
    global.redis.on("error", (err) =>
      console.error("[Redis] Connection error:", err.message),
    );
  }
  redis = global.redis;
}

export default redis;

