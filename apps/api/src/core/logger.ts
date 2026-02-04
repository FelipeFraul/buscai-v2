type LogLevel = "info" | "warn" | "error" | "debug";

type LogContext = {
  module?: string;
  traceId?: string;
  [key: string]: unknown;
};

const heavyLogsDisabled = process.env.BUSCAI_DISABLE_HEAVY_LOGS === "true";

function format(message: string, metadata?: LogContext): string {
  if (!metadata || Object.keys(metadata).length === 0) return message;
  return `${message} | ${JSON.stringify(metadata)}`;
}

export const logger = {
  info: (message: string, metadata?: LogContext) => {
    console.info(format(message, metadata));
  },
  warn: (message: string, metadata?: LogContext) => {
    console.warn(format(message, metadata));
  },
  error: (message: string, metadata?: LogContext) => {
    console.error(format(message, metadata));
  },
  debug: (message: string, metadata?: LogContext) => {
    if (process.env.NODE_ENV !== "production" && !heavyLogsDisabled) {
      console.debug(format(message, metadata));
    }
  },
};
