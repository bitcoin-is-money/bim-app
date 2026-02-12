import {createLogger} from '@bim/lib/logger';
import type {Logger} from "pino";

const DEFAULT_LOG_LEVEL = 'info';

export function createTestLogger(level: string = DEFAULT_LOG_LEVEL): Logger {
  return createLogger(level);
}
