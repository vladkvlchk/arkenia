import pino from "pino";
import type { Logger } from "../application/ports.js";

export function createLogger(level: string, name: string): Logger {
  return pino({
    name,
    level,
    ...(process.env.NODE_ENV !== "production" && process.stdout.isTTY
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  });
}
