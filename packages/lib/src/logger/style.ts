import type {TextColorConfig} from './ansi';

export type StyleConfig = {
  levelPadding: boolean;
  timestamp: TextColorConfig;
  name: TextColorConfig;
  msg: TextColorConfig;
  extraKey: string;
  extraValue: string;
  requestId?: TextColorConfig;
  requestIdPadding?: number;
  fatal: TextColorConfig;
  error: TextColorConfig;
  warn: TextColorConfig;
  info: TextColorConfig;
  debug: TextColorConfig;
  trace: TextColorConfig;
};

// extra key/value only support colorette colors:
//   white(7), red(1), green(2), yellow(3), blue(4), magenta(5), cyan(6), gray(8),
//   bgRed(bg:1), bgGreen(bg:2), bgYellow(bg:3), bgBlue(bg:4), bgMagenta(bg:5), bgCyan(bg:6).
export const DEFAULT_STYLE: StyleConfig = {
  levelPadding: false,
  timestamp: {fg: 250},
  requestId: {fg: 72},
  name: {fg: 249},
  msg: {fg: 253},
  extraKey: 'gray',
  extraValue: 'gray',
  fatal: {fg: 15, bg: 16},
  error: {fg: 1},
  warn: {fg: 178},
  info: {fg: 38},
  debug: {fg: 249},
  trace: {fg: 245},
};
