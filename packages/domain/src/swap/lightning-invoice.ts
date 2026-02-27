import {InvalidLightningInvoiceError} from './errors';

/**
 * Lightning Network invoice (BOLT11 format).
 * BOLT-11: https://github.com/lightning/bolts/blob/master/11-payment-encoding.md
 */
export type LightningInvoice = string & { readonly __brand: 'LightningInvoice' };

export namespace LightningInvoice {
  const INVOICE_REGEX = /^(lnbc|lntb|lnbcrt)[a-z0-9]+$/i;

  export function of(value: string): LightningInvoice {
    const trimmed = value.trim().toLowerCase();
    if (!LightningInvoice.isValid(trimmed)) {
      throw new InvalidLightningInvoiceError(value);
    }
    return trimmed as LightningInvoice;
  }

  export function isValid(value: string): boolean {
    return INVOICE_REGEX.test(value.trim());
  }
}

