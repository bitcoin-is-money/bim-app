import type {Logger} from 'pino';
import type {LightningDecoder} from '../ports';
import {Amount, BitcoinAddress, DomainError, StarknetAddress, type StarknetConfig} from '../shared';
import {LightningInvoice} from '../swap';
import {
  MissingPaymentAmountError,
  PaymentParsingError,
  UnsupportedNetworkError,
  UnsupportedTokenError,
} from './errors';
import type {ParsedPaymentData} from './types';

// =============================================================================
// Dependencies
// =============================================================================

export interface ParseServiceDeps {
  lightningDecoder: LightningDecoder;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

// =============================================================================
// Service Class
// =============================================================================

/**
 * Parse service — auto-detects payment network and parses QR/invoice/address data.
 *
 * Supports:
 * - BOLT11 Lightning invoices
 * - BIP-21 `bitcoin:` URIs
 * - ERC-681 `starknet:` URIs
 */
export class ParseService {
  constructor(private readonly deps: ParseServiceDeps) {}

  /**
   * Parse any payment data (QR code, invoice, address).
   * Auto-detects the payment network and parses accordingly.
   *
   * @throws UnsupportedNetworkError if the input format is not recognized
   * @throws PaymentParsingError if network-specific parsing fails
   */
  parse(data: string): ParsedPaymentData {
    const trimmed = data.trim();

    if (LightningInvoice.isValid(trimmed)) {
      this.deps.logger.info(`Parsing Lightning payment data`);
      return this.wrapParsingErrors(() => this.parseLightningInvoice(trimmed));
    }
    if (trimmed.toLowerCase().startsWith('bitcoin:')) {
      this.deps.logger.info(`Parsing Bitcoin payment data`);
      return this.wrapParsingErrors(() => this.parseBitcoinUri(trimmed));
    }
    if (trimmed.toLowerCase().startsWith('starknet:')) {
      this.deps.logger.info(`Parsing Starknet payment data`);
      return this.wrapParsingErrors(() => this.parseStarknetUri(trimmed));
    }

    if (BitcoinAddress.isValid(trimmed)) {
      this.deps.logger.info(`Parsing bare Bitcoin address`);
      return this.wrapParsingErrors(() => this.parseBitcoinUri(`bitcoin:${trimmed}`));
    }

    const detectedNetwork = detectUnsupportedNetwork(trimmed);
    throw new UnsupportedNetworkError(trimmed, detectedNetwork);
  }

  // ===========================================================================
  // Lightning (BOLT11)
  // ===========================================================================

  /**
   * Parse a BOLT11 Lightning invoice.
   *
   * @throws MissingPaymentAmountError if the invoice has no amount
   */
  private parseLightningInvoice(invoice: string): ParsedPaymentData & {network: 'lightning'} {
    const lightningInvoice = LightningInvoice.of(invoice);
    const decoded = this.deps.lightningDecoder.decode(lightningInvoice);

    if (decoded.amountMSat == undefined) {
      throw new MissingPaymentAmountError('lightning');
    }

    const amount = Amount.ofMilliSatoshi(decoded.amountMSat);
    const expiresAt = decoded.expiresAt;
    return {
      network: 'lightning',
      invoice: lightningInvoice,
      amount,
      description: decoded.description ?? '',
      ...(expiresAt !== undefined && {expiresAt}),
    };
  }

  // ===========================================================================
  // Bitcoin (BIP-21)
  // ===========================================================================

  /**
   * Parse a BIP-21 Bitcoin URI.
   *
   * Format: bitcoin:<address>[?amount=<btc_decimal>&label=<name>&message=<note>]
   *
   * @see https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki
   *
   * @throws InvalidPaymentAddressError if the address format is invalid
   */
  private parseBitcoinUri(uri: string): ParsedPaymentData & {network: 'bitcoin'} {
    const url = new URL(uri);
    const address = BitcoinAddress.of(url.pathname, this.deps.starknetConfig.bitcoinNetwork);

    const amountParam = url.searchParams.get('amount');
    let amount: Amount;
    let amountEditable: boolean | undefined;
    if (amountParam == undefined) {
      amount = Amount.zero();
      amountEditable = true;
    } else {
      amount = Amount.fromBtcString(amountParam);
    }

    // BIP-21: "label" is for the recipient name, "message" is a note to the payer
    const description = url.searchParams.get('label')
      ?? url.searchParams.get('message')
      ?? '';

    return {
      network: 'bitcoin',
      address,
      amount,
      description,
      ...(amountEditable && {amountEditable}),
    };
  }

  // ===========================================================================
  // Starknet (ERC-681)
  // ===========================================================================

  /**
   * Parse a `starknet:` URI.
   *
   * Format: starknet:<address>[?amount=<raw_token_units>&token=<token_address>]
   *
   * @see https://eips.ethereum.org/EIPS/eip-681 (ERC-681: URL Format for Transaction Requests)
   *
   * @throws InvalidPaymentAddressError if the address format is invalid
   * @throws MissingPaymentAmountError if the amount parameter is absent
   * @throws UnsupportedTokenError if the token is not supported
   */
  private parseStarknetUri(uri: string): ParsedPaymentData & {network: 'starknet'} {
    const url = new URL(uri);
    const address = StarknetAddress.of(url.pathname);

    const amountParam = url.searchParams.get('amount');
    if (amountParam == undefined) {
      throw new MissingPaymentAmountError('starknet');
    }
    const rawAmount = BigInt(amountParam);
    const amount = Amount.ofSatoshi(rawAmount);

    const tokenParam = url.searchParams.get('token');
    const wbtcAddress = this.deps.starknetConfig.wbtcTokenAddress;
    if (tokenParam == undefined || tokenParam !== wbtcAddress) {
      throw new UnsupportedTokenError(tokenParam ?? 'undefined');
    }

    // ERC-1138 proposed extension: summary, description, context (priority order)
    const description = url.searchParams.get('summary')
      ?? url.searchParams.get('description')
      ?? url.searchParams.get('context')
      ?? '';

    return {
      network: 'starknet',
      address,
      amount,
      tokenAddress: wbtcAddress,
      description,
    };
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private wrapParsingErrors(fn: () => ParsedPaymentData): ParsedPaymentData {
    try {
      return fn();
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        throw error;
      }
      const cause = error instanceof Error
        ? error
        : new Error(String(error));
      throw new PaymentParsingError(cause);
    }
  }
}

// =============================================================================
// Unsupported network detection
// =============================================================================

// URI scheme pattern: "word:" at the start (excludes our supported schemes)
const URI_SCHEME_REGEX = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const SUPPORTED_SCHEMES = new Set(['bitcoin', 'starknet']);

/**
 * Known address patterns for unsupported networks.
 * Each entry: [regex, network name]. Order matters — first match wins.
 */
const UNSUPPORTED_ADDRESS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Ethereum: 0x + 40 hex (not Starknet, which is 64 hex)
  [/^0x[0-9a-fA-F]{40}$/, 'ethereum'],
  // Toncoin: EQ/UQ prefix + 46 base64url chars
  [/^(EQ|UQ)[A-Za-z0-9_-]{46}$/, 'toncoin'],
  // Cosmos: cosmos1 + 38 bech32 chars
  [/^cosmos1[a-z0-9]{38}$/, 'cosmos'],
  // Litecoin: ltc1 bech32 or legacy L/M prefix
  [/^ltc1[a-z0-9]{39,59}$/, 'litecoin'],
  [/^[LM][1-9A-HJ-NP-Za-km-z]{26,33}$/, 'litecoin'],
  // Cardano: addr1 + 53+ bech32 chars
  [/^addr1[a-z0-9]{53,}$/, 'cardano'],
  // Ripple (XRP): r + 24-34 base58 chars
  [/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, 'ripple'],
  // Tron: T + 33 base58 chars
  [/^T[1-9A-HJ-NP-Za-km-z]{33}$/, 'tron'],
];

/**
 * Try to detect a known-but-unsupported network from the input.
 * Returns the network name if detected, undefined otherwise.
 */
function detectUnsupportedNetwork(data: string): string | undefined {
  const schemeMatch = URI_SCHEME_REGEX.exec(data);
  const captured = schemeMatch?.[1];
  if (captured !== undefined) {
    const scheme = captured.toLowerCase();
    if (!SUPPORTED_SCHEMES.has(scheme)) {
      return scheme;
    }
  }
  for (const [regex, network] of UNSUPPORTED_ADDRESS_PATTERNS) {
    if (regex.test(data)) {
      return network;
    }
  }
  return undefined;
}
