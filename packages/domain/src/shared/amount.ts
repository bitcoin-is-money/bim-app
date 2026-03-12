import {ValidationError} from './errors';

/**
 * Precision multiplier for percentage calculations.
 * Using 1,000,000 allows for precision up to 0.0001% (1 basis point = 0.01%).
 */
const PERCENTAGE_PRECISION = 1_000_000n;

/**
 * Immutable value object representing a monetary amount in millisatoshi (mSat).
 *
 * mSat is the smallest unit in the Lightning Network (1 sat = 1000 mSat).
 * Since BIM only supports WBTC on Starknet (8 decimals = same as BTC),
 * all three networks (Lightning, Bitcoin, Starknet/WBTC) share the same unit system.
 *
 * Conversion reference:
 * - 1 BTC = 100,000,000 sats = 100,000,000,000 mSat
 * - 1 sat = 1,000 mSat
 */
export class Amount {
  private constructor(
    private readonly mSat: bigint,
  ) {}

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  /**
   * Create an Amount from millisatoshi (base unit).
   */
  static ofMilliSatoshi(mSat: bigint): Amount {
    if (mSat < 0n) {
      throw new ValidationError('amount', 'cannot be negative');
    }
    return new Amount(mSat);
  }

  /**
   * Create an Amount from satoshi.
   * 1 sat = 1,000 mSat.
   */
  static ofSatoshi(sats: bigint): Amount {
    if (sats < 0n) {
      throw new ValidationError('amount', 'cannot be negative');
    }
    return new Amount(sats * 1_000n);
  }

  /**
   * Create an Amount from a BTC decimal string (BIP-21 format).
   * Uses string arithmetic to avoid IEEE 754 floating-point errors.
   *
   * @param btcString - BTC amount as string (e.g. "0.001", "1.23456789")
   * @throws ValidationError if the string is not a valid BTC amount
   */
  static fromBtcString(btcString: string): Amount {
    const trimmed = btcString.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new ValidationError('amount', `invalid BTC amount: ${btcString}`);
    }
    const [intPart, fracPart = ''] = trimmed.split('.');
    if (fracPart.length > 8) {
      throw new ValidationError('amount', `BTC amount exceeds satoshi precision: ${btcString}`);
    }
    const paddedFrac = fracPart.padEnd(8, '0');
    const sats = BigInt(intPart + paddedFrac);
    return Amount.ofSatoshi(sats);
  }

  /**
   * Create a zero Amount.
   */
  static zero(): Amount {
    return new Amount(0n);
  }

  // ===========================================================================
  // Accessors
  // ===========================================================================

  /**
   * Get the amount in millisatoshi (base unit).
   */
  getMSat(): bigint {
    return this.mSat;
  }

  /**
   * Get the amount in satoshi (integer division, truncates sub-sat mSat).
   */
  getSat(): bigint {
    return this.mSat / 1_000n;
  }

  /**
   * Get the amount in BTC as a number (for display purposes only).
   * Warning: may lose precision for very large amounts.
   */
  getBitcoin(): number {
    return Number(this.mSat) / 100_000_000_000;
  }

  // ===========================================================================
  // Arithmetic Operations
  // ===========================================================================

  /**
   * Add another Amount.
   */
  add(other: Amount): Amount {
    return new Amount(this.mSat + other.mSat);
  }

  /**
   * Subtract another Amount.
   * @throws ValidationError if result would be negative
   */
  subtract(other: Amount): Amount {
    const result = this.mSat - other.mSat;
    if (result < 0n) {
      throw new ValidationError('amount', 'subtraction would result in negative amount');
    }
    return new Amount(result);
  }

  /**
   * Calculate a percentage of this amount.
   * Uses scaled integer arithmetic for precision.
   *
   * @param pct - Percentage as decimal (e.g., 0.001 for 0.1%)
   */
  percentage(pct: number): Amount {
    if (pct < 0) {
      throw new ValidationError('percentage', 'cannot be negative');
    }
    if (this.mSat === 0n || pct === 0) {
      return Amount.zero();
    }
    const scaledPct = BigInt(Math.floor(pct * Number(PERCENTAGE_PRECISION)));
    return new Amount((this.mSat * scaledPct) / PERCENTAGE_PRECISION);
  }

  // ===========================================================================
  // Comparisons
  // ===========================================================================

  /**
   * Check if this amount is zero.
   */
  isZero(): boolean {
    return this.mSat === 0n;
  }

  /**
   * Check if this amount is positive (> 0).
   */
  isPositive(): boolean {
    return this.mSat > 0n;
  }

  /**
   * Check if this amount is greater than another.
   */
  isGreaterThan(other: Amount): boolean {
    return this.mSat > other.mSat;
  }

  /**
   * Check if this amount is greater than or equal to another.
   */
  isGreaterThanOrEqual(other: Amount): boolean {
    return this.mSat >= other.mSat;
  }

  /**
   * Check if this amount is less than another.
   */
  isLessThan(other: Amount): boolean {
    return this.mSat < other.mSat;
  }

  /**
   * Check if this amount is less than or equal to another.
   */
  isLessThanOrEqual(other: Amount): boolean {
    return this.mSat <= other.mSat;
  }

  /**
   * Check if two amounts are equal.
   */
  equals(other: Amount): boolean {
    return this.mSat === other.mSat;
  }

  // ===========================================================================
  // Serialization
  // ===========================================================================

  /**
   * Convert to satoshi string (for Starknet calldata and persistence).
   */
  toSatString(): string {
    return this.getSat().toString(10);
  }

  /**
   * Human-readable string representation.
   */
  toString(): string {
    return `${this.mSat} mSat`;
  }
}
