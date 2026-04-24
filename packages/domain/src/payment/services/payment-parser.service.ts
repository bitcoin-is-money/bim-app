import type {Logger} from 'pino';
import type {LightningDecoder} from '../../ports';
import {Amount, BitcoinAddress, DomainError, StarknetAddress, type StarknetConfig} from '../../shared';
import {LightningInvoice} from '../../swap';
import {PaymentParsingError, UnsupportedNetworkError, UnsupportedTokenError} from '../errors';
import type {ParsedPaymentData} from '../types';

export interface PaymentParserDeps {
  lightningDecoder: LightningDecoder;
  starknetConfig: StarknetConfig;
  logger: Logger;
}

/**
 * Internal domain service — auto-detects payment network and parses
 * QR/invoice/address data.
 *
 * Supports:
 * - BOLT11 Lightning invoices
 * - BIP-21 `bitcoin:` URIs
 * - ERC-681 `starknet:` URIs
 */
export class PaymentParser {
  constructor(private readonly deps: PaymentParserDeps) {}

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

    // Flexible bare address detection: extract address part from optional query params
    // so that inputs like "0x1234...?amount=1000" or "bc1q...?amount=0.001" are handled
    const [addressPart = '', ...rest] = trimmed.split('?');
    const queryString = rest.length > 0 ? `?${rest.join('?')}` : '';

    // Bare Starknet address (> 42 chars to exclude Ethereum 0x + 40 hexs)
    if (addressPart.length > 42 && StarknetAddress.isValid(addressPart)) {
      this.deps.logger.info(`Parsing bare Starknet address`);
      const url = new URL(`starknet:${addressPart}${queryString}`);
      if (!url.searchParams.has('token')) {
        url.searchParams.set('token', this.deps.starknetConfig.wbtcTokenAddress);
      }
      return this.wrapParsingErrors(() => this.parseStarknetUri(url.toString()));
    }

    // Bare Bitcoin address
    if (BitcoinAddress.isValid(addressPart)) {
      this.deps.logger.info(`Parsing bare Bitcoin address`);
      return this.wrapParsingErrors(() => this.parseBitcoinUri(`bitcoin:${addressPart}${queryString}`));
    }

    const detectedNetwork = detectUnsupportedNetwork(trimmed);
    throw new UnsupportedNetworkError(trimmed, detectedNetwork);
  }

  // ===========================================================================
  // Lightning (BOLT11)
  // ===========================================================================

  private parseLightningInvoice(invoice: string): ParsedPaymentData & {network: 'lightning'} {
    const lightningInvoice = LightningInvoice.of(invoice);
    const decoded = this.deps.lightningDecoder.decode(lightningInvoice);

    const amount = decoded.amountMSat == undefined
      ? Amount.zero()
      : Amount.ofMilliSatoshi(decoded.amountMSat);
    const expiresAt = decoded.expiresAt;
    return {
      network: 'lightning',
      invoice: lightningInvoice,
      amount,
      amountEditable: amount.isZero(),
      description: decoded.description ?? '',
      ...(expiresAt !== undefined && {expiresAt}),
    };
  }

  // ===========================================================================
  // Bitcoin (BIP-21)
  // ===========================================================================

  private parseBitcoinUri(uri: string): ParsedPaymentData & {network: 'bitcoin'} {
    const url = new URL(uri);
    const address = BitcoinAddress.of(url.pathname, this.deps.starknetConfig.bitcoinNetwork);

    const amountParam = url.searchParams.get('amount');
    const amount = amountParam == undefined
      ? Amount.zero()
      : Amount.fromBtcString(amountParam);
    // BIP-21: "label" is for the recipient name, "message" is a note to the payer
    const description = url.searchParams.get('label')
      ?? url.searchParams.get('message')
      ?? '';

    return {
      network: 'bitcoin',
      address,
      amount,
      amountEditable: amount.isZero(),
      description,
    };
  }

  // ===========================================================================
  // Starknet (ERC-681)
  // ===========================================================================

  private parseStarknetUri(uri: string): ParsedPaymentData & {network: 'starknet'} {
    const url = new URL(uri);
    const address = StarknetAddress.of(url.pathname);

    const amountParam = url.searchParams.get('amount');
    const amount = amountParam == undefined
      ? Amount.zero()
      : Amount.ofSatoshi(BigInt(amountParam));
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
      amountEditable: amount.isZero(),
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

const URI_SCHEME_REGEX = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const SUPPORTED_SCHEMES = new Set(['bitcoin', 'starknet']);

const UNSUPPORTED_ADDRESS_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/^0x[0-9a-fA-F]{40}$/, 'ethereum'],
  [/^(EQ|UQ)[A-Za-z0-9_-]{46}$/, 'toncoin'],
  [/^cosmos1[a-z0-9]{38}$/, 'cosmos'],
  [/^ltc1[a-z0-9]{39,59}$/, 'litecoin'],
  [/^[LM][1-9A-HJ-NP-Za-km-z]{26,33}$/, 'litecoin'],
  [/^addr1[a-z0-9]{53,}$/, 'cardano'],
  [/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, 'ripple'],
  [/^T[1-9A-HJ-NP-Za-km-z]{33}$/, 'tron'],
];

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
