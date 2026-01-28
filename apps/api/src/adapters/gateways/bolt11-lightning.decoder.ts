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

    let amountMSat: bigint | undefined;
    if (amountSection && 'value' in amountSection && amountSection.value) {
      amountMSat = BigInt(amountSection.value);
    }

    const description =
      descriptionSection && 'value' in descriptionSection
        ? String(descriptionSection.value)
        : undefined;

    const expiresAt =
      decoded.expiry !== undefined
        ? new Date(decoded.expiry * 1000)
        : undefined;

    return {amountMSat, description, expiresAt};
  }
}
