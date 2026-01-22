/**
 * Recursively makes all properties of T optional.
 * Unlike Partial<T> which only affects the first level,
 * DeepPartial<T> makes nested object properties optional as well.
 *
 * @example
 * type Config = { a: { b: { c: string } } };
 * type PartialConfig = DeepPartial<Config>;
 * // Result: { a?: { b?: { c?: string } } }
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
