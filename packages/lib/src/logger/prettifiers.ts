import type PinoPretty from 'pino-pretty';
import {colorize} from './ansi';
import type {StyleConfig} from './style';

type PrettyOptions = PinoPretty.PrettyOptions;
type LevelPrettifier = NonNullable<NonNullable<PrettyOptions['customPrettifiers']>['level']>;

export function createMessageFormat(style: StyleConfig): NonNullable<PrettyOptions['messageFormat']> {
  return (log, messageKey) => {
    // eslint-disable-next-line security/detect-object-injection -- pino standard API
    const msg = String(log[messageKey]);
    const nameStr = typeof log.name === 'string' ? log.name : '';
    const name: string = nameStr ? nameStr + ' \u25b8 ' : '';
    const coloredName: string = colorize(style.name, name);
    const coloredMsg: string = colorize(style.msg, msg);
    return `${coloredName}${coloredMsg}`;
  };
}

export function createTimestampPrettifier(style: StyleConfig) {
  return (timestamp: string | object) => {
    const ts = typeof timestamp === 'string' ? timestamp : JSON.stringify(timestamp);
    return colorize(style.timestamp, ts);
  };
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
      const ridValue = log.requestId;
      const rid = typeof ridValue === 'string' || typeof ridValue === 'number'
        ? String(ridValue).padStart(padding)
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
