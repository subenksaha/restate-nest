import { Logger, LoggerService } from '@nestjs/common';
import * as restate from '@restatedev/restate-sdk';
import { format } from 'util';

export const DEFAULT_LOGGER_CONTEXT = 'Restate';

const LEVEL_ORDER: Record<string, number> = { trace: 1, debug: 2, info: 3, warn: 4, error: 5 };

// Mirror the SDK's default transport: honour RESTATE_LOGGING (default "info")
function minLogLevel(): number {
  const env = process.env.RESTATE_LOGGING?.toLowerCase();
  return (env && LEVEL_ORDER[env]) || LEVEL_ORDER.info;
}

function formatMessage(meta: restate.LogMetadata, message: any, args: any[]): string {
  const text = format(message, ...args);
  const ctx = meta.context;
  if (!ctx) return text;
  let prefix = `[${ctx.invocationTarget}][${ctx.invocationId}]`;
  for (const [k, v] of Object.entries(ctx.additionalContext ?? {})) {
    prefix += `[${k}: ${v}]`;
  }
  return `${prefix} ${text}`;
}

/**
 * Creates a Restate logger transport that routes SDK and handler (`ctx.console`) logs
 * through a NestJS logger. Logs emitted while replaying are skipped.
 */
export function createNestLoggerTransport(
  logger: LoggerService = new Logger(),
  context: string = DEFAULT_LOGGER_CONTEXT,
): restate.LoggerTransport {
  const minLevel = minLogLevel();

  return (meta, message, ...args) => {
    if (meta.replaying) return;
    if ((LEVEL_ORDER[meta.level] ?? LEVEL_ORDER.info) < minLevel) return;

    const text = formatMessage(meta, message, args);
    switch (meta.level) {
      case 'error': logger.error(text, context); break;
      case 'warn': logger.warn(text, context); break;
      case 'debug': (logger.debug ?? logger.log).call(logger, text, context); break;
      case 'trace': (logger.verbose ?? logger.log).call(logger, text, context); break;
      default: logger.log(text, context); break;
    }
  };
}
