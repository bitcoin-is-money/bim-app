export interface Bip21Params {
  /** Bitcoin amount in BTC. Included only when defined (zero is preserved). */
  amount?: number;
  /** Recipient name (BIP-21 `label` query parameter). */
  label?: string;
  /** Note to the payer (BIP-21 `message` query parameter). */
  message?: string;
}

/**
 * Builds a BIP-21 payment URI (`bitcoin:<address>?...`).
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki
 */
export function buildBip21Uri(address: string, params: Bip21Params = {}): string {
  const query = new URLSearchParams();
  if (params.amount !== undefined) query.set('amount', String(params.amount));
  if (params.label !== undefined) query.set('label', params.label);
  if (params.message !== undefined) query.set('message', params.message);
  const qs = query.toString();
  return qs === '' ? `bitcoin:${address}` : `bitcoin:${address}?${qs}`;
}
