import type PinoPretty from 'pino-pretty';
import {colorize} from './ansi';
import type {StyleConfig} from './style';

type PrettyOptions = PinoPretty.PrettyOptions;
type LevelPrettifier = Exclude<PrettyOptions['customPrettifiers'], undefined>['level'] & Function;

export function createMessageFormat(style: StyleConfig): PrettyOptions['messageFormat'] {
  return (log, messageKey) => {
    const msg = String(log[messageKey]);
    const name: string = log['name']
      ? String(log['name']) + ' \u25b8 '
      : '';
    const coloredName: string = colorize(style.name, name);
    const coloredMsg: string = colorize(style.msg, msg);
    return `${coloredName}${coloredMsg}`;
  };
}

export function createTimestampPrettifier(style: StyleConfig) {
  return (timestamp: string | object) =>
    colorize(style.timestamp, String(timestamp));
}

export function createErrorPrettifier(style: StyleConfig) {
  return (err: unknown) => {
    const e = err as {message?: string; type?: string; stack?: string};
    const lines = e.stack ?? `${e.type}: ${e.message}`;
    return '\n' + lines
      .split('\n')
      .map(l => colorize(style.error, l))
      .join('\n');
  };
}

export function createLevelPrettifier(style: StyleConfig): LevelPrettifier {
  const padding = style.requestIdPadding ?? 3;

  return (_inputData, _key, _log, {label}) => {
    const log = _log as Record<string, unknown>;

    // Request ID prefix (padStart for right-alignment)
    let ridPrefix = '';
    if (style.requestId) {
      const rid = log['requestId'] != null
        ? String(log['requestId']).padStart(padding)
        : ' '.repeat(padding);
      ridPrefix = "[" + colorize(style.requestId, rid) + '] ';
    }

    const badge = style.levelPadding
      ? label.padStart(6)
      : label;
    switch (label) {
      case 'FATAL': return ridPrefix + colorize(style.fatal, badge);
      case 'ERROR': return ridPrefix + colorize(style.error, badge);
      case 'WARN':  return ridPrefix + colorize(style.warn, badge);
      case 'INFO':  return ridPrefix + colorize(style.info, badge);
      case 'DEBUG': return ridPrefix + colorize(style.debug, badge);
      case 'TRACE': return ridPrefix + colorize(style.trace, badge);
      default:      return ridPrefix + badge;
    }
  };
}
