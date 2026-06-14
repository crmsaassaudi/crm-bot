/**
 * Lightweight structured JSON logger for the CRM bot service.
 * Outputs JSON to stdout/stderr for easy aggregation by log collectors
 * (e.g., Docker logging driver, Grafana Loki, CloudWatch).
 *
 * Usage:
 *   botLogger.info("Flow resolved", { tenantId, channelId, flowId });
 *   botLogger.error("Callback failed", { tenantId, messageId }, error);
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.BOT_LOG_LEVEL as LogLevel) || "info";

const formatEntry = (
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
): string => {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: "crm-bot",
    msg: message,
    ...context,
  };

  if (error) {
    if (error instanceof Error) {
      entry.error = error.message;
      entry.stack = error.stack;
    } else {
      entry.error = String(error);
    }
  }

  return JSON.stringify(entry);
};

const shouldLog = (level: LogLevel): boolean =>
  LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];

export const botLogger = {
  debug(message: string, context?: LogContext): void {
    if (!shouldLog("debug")) return;
    console.debug(formatEntry("debug", message, context));
  },

  info(message: string, context?: LogContext): void {
    if (!shouldLog("info")) return;
    console.info(formatEntry("info", message, context));
  },

  warn(message: string, context?: LogContext, error?: unknown): void {
    if (!shouldLog("warn")) return;
    console.warn(formatEntry("warn", message, context, error));
  },

  error(message: string, context?: LogContext, error?: unknown): void {
    if (!shouldLog("error")) return;
    console.error(formatEntry("error", message, context, error));
  },
};
