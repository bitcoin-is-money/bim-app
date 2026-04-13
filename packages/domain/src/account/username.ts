import {InvalidUsernameError} from './errors';

/**
 * Username for an Account.
 *
 * Format: 3-25 characters, alphanumeric and underscores only.
 * Example: "john_doe", "alice123"
 */
export type Username = string & {readonly __brand: 'Username'};

export namespace Username {
  /** Validation pattern: 3-25 chars, alphanumeric and underscore */
  export const PATTERN = /^\w{3,25}$/;

  /**
   * Creates a Username from a string.
   *
   * @param value - Raw username string
   * @throws InvalidUsernameError if the format is invalid
   */
  export function of(value: string): Username {
    const trimmed = value.trim();
    if (!PATTERN.test(trimmed)) {
      throw new InvalidUsernameError(value);
    }
    return trimmed as Username;
  }

  /**
   * Checks if a string is a valid username without throwing.
   */
  export function isValid(value: string): boolean {
    return PATTERN.test(value.trim());
  }
}

