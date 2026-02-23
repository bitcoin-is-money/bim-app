import type {Logger} from 'pino';
import {StarknetAddress} from '../account';
import type {LightningDecoder} from '../ports';
import {Amount, DomainError, type StarknetConfig} from '../shared';
import {BitcoinAddress, LightningInvoice} from '../swap';
import {
  MissingPaymentAmountError,
  type ParsedPaymentData,
  PaymentParsingError,
  UnsupportedNetworkError,
  UnsupportedTokenError,
} from './types';

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

    throw new UnsupportedNetworkError(trimmed);
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
    return {
      network: 'lightning',
      invoice: lightningInvoice,
      amount,
      description: decoded.description ?? '',
      expiresAt: decoded.expiresAt,
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
   * @throws MissingPaymentAmountError if the amount parameter is absent
   */
  private parseBitcoinUri(uri: string): ParsedPaymentData & {network: 'bitcoin'} {
    const url = new URL(uri);
    const address = BitcoinAddress.of(url.pathname);

    const amountParam = url.searchParams.get('amount');
    if (amountParam == undefined) {
      throw new MissingPaymentAmountError('bitcoin');
    }
    const btcAmount = Number.parseFloat(amountParam);
    const rawSats = BigInt(Math.round(btcAmount * 100_000_000));
    const amount = Amount.ofSatoshi(rawSats);

    // BIP-21: "label" is for the recipient name, "message" is a note to the payer
    const description = url.searchParams.get('label')
      ?? url.searchParams.get('message')
      ?? '';

    return {
      network: 'bitcoin',
      address,
      amount,
      description,
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
