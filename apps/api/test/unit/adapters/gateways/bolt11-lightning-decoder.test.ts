import {describe, expect, it} from 'vitest';
import {Bolt11LightningDecoder} from '../../../../src/adapters';

// =============================================================================
// BOLT11 test vectors (from the BOLT11 specification)
// =============================================================================

// 2500 µBTC (250,000 sats), description "1 cup coffee", expiry 60s
const INVOICE_WITH_AMOUNT =
  'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';

// No amount, description "Please consider supporting this project", no expiry
const INVOICE_WITHOUT_AMOUNT =
  'lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq9qrsgq357wnc5r2ueh7ck6q93dj32dlqnls087fxdwk8qakdyafkq3yap9us6v52vjjsrvywa6rt52cm9r9zqt8r2t7mlcwspyetp5h2tztugp9lfyql';

// =============================================================================
// Tests
// =============================================================================

describe('Bolt11LightningDecoder', () => {
  const decoder = new Bolt11LightningDecoder();

  it('decodes amount in millisatoshi', () => {
    const result = decoder.decode(INVOICE_WITH_AMOUNT);
    expect(result.amountMSat).toBe(250_000_000n); // 250,000 sats = 250,000,000 mSat
  });

  it('decodes description', () => {
    const result = decoder.decode(INVOICE_WITH_AMOUNT);
    expect(result.description).toBe('1 cup coffee');
  });

  it('decodes expiry as Date', () => {
    const result = decoder.decode(INVOICE_WITH_AMOUNT);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('returns undefined amount when invoice has no amount', () => {
    const result = decoder.decode(INVOICE_WITHOUT_AMOUNT);
    expect(result.amountMSat).toBeUndefined();
  });

  it('returns description when invoice has no amount', () => {
    const result = decoder.decode(INVOICE_WITHOUT_AMOUNT);
    expect(result.description).toBe('Please consider supporting this project');
  });

  it('returns undefined expiry when invoice has no expiry', () => {
    const result = decoder.decode(INVOICE_WITHOUT_AMOUNT);
    expect(result.expiresAt).toBeUndefined();
  });

  it('throws on invalid invoice', () => {
    expect(() => decoder.decode('not-a-bolt11-invoice')).toThrow();
  });
});
