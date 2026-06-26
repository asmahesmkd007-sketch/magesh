// Structured logger. Emits single-line JSON in production (ingestible by Datadog,
// Loki, CloudWatch, etc.) and readable text in development. Use this instead of
// raw console.* so logs carry a level, timestamp, and structured context.

type Level = "debug" | "info" | "warn" | "error";

const isProd = typeof process !== "undefined" && process.env.NODE_ENV === "production";
const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = isProd ? "info" : "debug";

type Context = Record<string, unknown> & { error?: unknown };

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return err;
}

function emit(level: Level, message: string, context?: Context) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const { error, ...rest } = context ?? {};
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
    ...rest,
  };

  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (isProd) {
    sink(JSON.stringify(entry));
  } else {
    sink(`[${level.toUpperCase()}] ${message}`, Object.keys(rest).length || error ? entry : "");
  }
}

export const logger = {
  debug: (message: string, context?: Context) => emit("debug", message, context),
  info: (message: string, context?: Context) => emit("info", message, context),
  warn: (message: string, context?: Context) => emit("warn", message, context),
  error: (message: string, context?: Context) => emit("error", message, context),
};
