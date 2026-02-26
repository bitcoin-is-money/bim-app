import type {Logger} from 'pino';
import pino from 'pino';
import type PinoPretty from 'pino-pretty';
import pinoPretty from 'pino-pretty';
import {logContext} from './context';
import {
  createErrorPrettifier,
  createLevelPrettifier,
  createMessageFormat,
  createTimestampPrettifier
} from './prettifiers';
import {DEFAULT_LOGGER_CONFIG, type StyleConfig} from './style';

type PrettyOptions = PinoPretty.PrettyOptions;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export function isValidLevel(level: string | undefined): level is LogLevel {
  return !!level && ['debug', 'info', 'warn', 'error', 'silent'].includes(level);
}

/**
 * Creates a pino logger with pino-pretty formatting.
 *
 * @param level - Log level, read from the `LOG_LEVEL` environment variable. Defaults to 'info'.
 * @param style - Style configuration for colors and formatting
 * @param destination - Optional writable destination. When omitted, writes to stdout.
 */
export function createLogger(
  level?: string,
  style: StyleConfig = DEFAULT_LOGGER_CONFIG,
  destination?: NodeJS.WritableStream,
): Logger {
  level = level ?? process.env.LOG_LEVEL ?? 'info';
  const prettyOptions: PrettyOptions = {
    singleLine: false,
    colorize: true,
    translateTime: 'SYS:HH:MM:ss.l',
    ignore: 'pid,hostname,name',
    customColors: `property:${style.extraKey},greyMessage:${style.extraValue}`,
    messageFormat: createMessageFormat(style),
    customPrettifiers: {
      level: createLevelPrettifier(style),
      time: createTimestampPrettifier(style),
      err: createErrorPrettifier(style),
      // Suppress requestId from extra key-value output (it's already displayed by the level prettifier)
      ...(style.requestId !== undefined && {
        requestId: () => undefined as unknown as string
      }),
    },
    sync: true,
  };

  if (destination) {
    prettyOptions.destination = destination;
  }

  return pino(
    {
      level,
      name: 'root',
      mixin() {
        return logContext.getStore() ?? {};
      },
    },
    pinoPretty(prettyOptions),
  );
}
