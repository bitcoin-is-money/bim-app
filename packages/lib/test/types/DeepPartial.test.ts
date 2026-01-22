import {describe, expectTypeOf, it} from 'vitest';
import type {DeepPartial} from '@bim/lib';

describe('DeepPartial', () => {
  it('makes first-level properties optional', () => {
    type Original = {a: string; b: number};
    type Result = DeepPartial<Original>;

    expectTypeOf<Result>().toEqualTypeOf<{a?: string; b?: number}>();
  });

  it('makes nested properties optional', () => {
    type Original = {a: {b: string}};
    type Result = DeepPartial<Original>;

    expectTypeOf<Result>().toEqualTypeOf<{a?: {b?: string}}>();
  });

  it('handles deeply nested objects', () => {
    type Original = {a: {b: {c: {d: string}}}};
    type Result = DeepPartial<Original>;

    // All levels are optional
    const valid1: Result = {};
    const valid2: Result = {a: {}};
    const valid3: Result = {a: {b: {}}};
    const valid4: Result = {a: {b: {c: {}}}};
    const valid5: Result = {a: {b: {c: {d: 'hello'}}}};

    expectTypeOf(valid1).toMatchTypeOf<Result>();
    expectTypeOf(valid2).toMatchTypeOf<Result>();
    expectTypeOf(valid3).toMatchTypeOf<Result>();
    expectTypeOf(valid4).toMatchTypeOf<Result>();
    expectTypeOf(valid5).toMatchTypeOf<Result>();
  });

  it('preserves primitive types at leaf level', () => {
    type Original = {
      str: string;
      num: number;
      bool: boolean;
      nested: {value: string};
    };
    type Result = DeepPartial<Original>;

    const partial: Result = {str: 'test', nested: {value: 'hello'}};
    expectTypeOf(partial.str).toEqualTypeOf<string | undefined>();
    expectTypeOf(partial.nested?.value).toEqualTypeOf<string | undefined>();
  });

  it('handles arrays as leaf values', () => {
    type Original = {items: string[]; nested: {list: number[]}};
    type Result = DeepPartial<Original>;

    // Arrays are treated as objects, so their contents become optional too
    const partial: Result = {items: [], nested: {list: []}};
    expectTypeOf(partial).toMatchTypeOf<Result>();
  });
});
