import type {DecodedLightningInvoice, LightningDecoder} from '@bim/domain/ports';
import bolt11 from 'light-bolt11-decoder';

/**
 * LightningDecoder implementation using the light-bolt11-decoder library.
 * Extracts amount, description and expiry from BOLT11 invoices.
 */
export class Bolt11LightningDecoder implements LightningDecoder {

  decode(invoice: string): DecodedLightningInvoice {
    const decoded = bolt11.decode(invoice);

    const amountSection = decoded.sections.find(
      (section) => section.name === 'amount',
    );
    const descriptionSection = decoded.sections.find(
      (section) => section.name === 'description',
    );

    const result: DecodedLightningInvoice = {};
    if (amountSection && 'value' in amountSection && amountSection.value) {
      result.amountMSat = BigInt(amountSection.value);
    }
    if (descriptionSection && 'value' in descriptionSection) {
      result.description = String(descriptionSection.value);
    }
    if (decoded.expiry !== undefined) {
      result.expiresAt = new Date(decoded.expiry * 1000);
    }
    return result;
  }
}
