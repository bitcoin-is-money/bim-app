export type TextColorConfig = {
  fg: number;
  bg?: number;
};

// ANSI 256-color: \x1b[48;5;Nm = background, \x1b[38;5;Nm = foreground
const ansiBg = (n: number, text: string) =>
  `\x1b[48;5;${n}m${text}\x1b[49m`;
const ansiFg = (n: number, text: string) =>
  `\x1b[38;5;${n}m${text}\x1b[39m`;

export function colorize(config: TextColorConfig, text: string): string {
  const colored = ansiFg(config.fg, text);
  return config.bg === undefined
    ? colored
    : ansiBg(config.bg, colored);
}
