import { botLogger } from "./logger";

/**
 * In-process concurrency limiter (semaphore) for bot processing tasks.
 *
 * WHY THIS EXISTS:
 * The bot reply endpoint uses fire-and-forget (`processAndCallback()` not awaited).
 * Under campaign traffic (1000+ msg/min), Node.js would run 1000+ concurrent
 * Promises, each hitting DB + Typebot engine + callback HTTP.
 * This creates cascading pressure: DB connection pool exhausts → queries queue →
 * event loop stalls → Redis timeouts → entire system stuck.
 *
 * HOW IT WORKS:
 * - Limits concurrent in-flight `processAndCallback()` to MAX_CONCURRENT.
 * - Excess tasks queue up and execute as slots become available.
 * - If the queue exceeds MAX_QUEUE, new tasks are rejected immediately
 *   (backpressure signal to the caller).
 *
 * This is NOT a rate limiter — it controls parallelism, not throughput.
 * Rate limiter controls how many requests arrive; this controls how many
 * execute simultaneously.
 */

const MAX_CONCURRENT = Number(process.env.BOT_MAX_CONCURRENT ?? 50);
const MAX_QUEUE = Number(process.env.BOT_MAX_QUEUE ?? 500);

let activeCount = 0;
const waitQueue: Array<() => void> = [];

export type ConcurrencyStats = {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueue: number;
};

export const getConcurrencyStats = (): ConcurrencyStats => ({
  active: activeCount,
  queued: waitQueue.length,
  maxConcurrent: MAX_CONCURRENT,
  maxQueue: MAX_QUEUE,
});

/**
 * Runs the given async function within the concurrency limit.
 * - If a slot is available, executes immediately.
 * - If no slot, queues the task (FIFO) until a slot opens.
 * - If queue is full, throws immediately (backpressure).
 *
 * @throws Error("Bot processing queue full") if MAX_QUEUE exceeded
 */
export const withConcurrencyLimit = async <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  // Backpressure: reject if queue is full
  if (activeCount >= MAX_CONCURRENT && waitQueue.length >= MAX_QUEUE) {
    botLogger.warn("Bot processing queue full — rejecting task", {
      active: activeCount,
      queued: waitQueue.length,
      maxConcurrent: MAX_CONCURRENT,
      maxQueue: MAX_QUEUE,
    });
    throw new Error("Bot processing queue full");
  }

  // Wait for a slot if all are occupied
  if (activeCount >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => {
      waitQueue.push(resolve);
    });
  }

  activeCount++;
  try {
    return await fn();
  } finally {
    activeCount--;
    // Release next queued task
    if (waitQueue.length > 0) {
      const next = waitQueue.shift()!;
      next();
    }
  }
};
