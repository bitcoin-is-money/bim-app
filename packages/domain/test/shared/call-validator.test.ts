import {describe, expect, it} from 'vitest';
import {StarknetAddress, UnsafeExternalCallError, validateExternalCalls} from '../../src/shared';

const KNOWN_WBTC = StarknetAddress.of('0x00abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678');
const KNOWN_STRK = StarknetAddress.of('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const KNOWN_TOKENS = [KNOWN_WBTC, KNOWN_STRK];
const UNKNOWN_CONTRACT = '0x00deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

describe('validateExternalCalls', () => {
  // =========================================================================
  // Forbidden entrypoints
  // =========================================================================

  it('blocks transfer entrypoint', () => {
    const calls = [{contractAddress: KNOWN_WBTC, entrypoint: 'transfer', calldata: ['0x1', '100', '0']}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService'))
      .toThrow(UnsafeExternalCallError);
  });

  it('blocks transfer_from entrypoint', () => {
    const calls = [{contractAddress: KNOWN_WBTC, entrypoint: 'transfer_from', calldata: ['0x1', '0x2', '100', '0']}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService'))
      .toThrow(UnsafeExternalCallError);
  });

  it('blocks increase_allowance entrypoint', () => {
    const calls = [{contractAddress: KNOWN_WBTC, entrypoint: 'increase_allowance', calldata: ['0x1', '100', '0']}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService'))
      .toThrow(UnsafeExternalCallError);
  });

  it('blocks forbidden entrypoints case-insensitively', () => {
    const calls = [{contractAddress: KNOWN_WBTC, entrypoint: 'Transfer', calldata: ['0x1', '100', '0']}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService'))
      .toThrow(UnsafeExternalCallError);
  });

  // =========================================================================
  // Approve validation
  // =========================================================================

  it('allows approve on known token contract', () => {
    const calls = [{contractAddress: KNOWN_WBTC, entrypoint: 'approve', calldata: ['0xspender', '100', '0']}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService')).not.toThrow();
  });

  it('blocks approve on unknown contract', () => {
    const calls = [{contractAddress: UNKNOWN_CONTRACT, entrypoint: 'approve', calldata: ['0xspender', '100', '0']}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService'))
      .toThrow(UnsafeExternalCallError);
  });

  it('matches token addresses case-insensitively', () => {
    const calls = [{contractAddress: KNOWN_WBTC.toUpperCase(), entrypoint: 'approve', calldata: ['0xspender', '100', '0']}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService')).not.toThrow();
  });

  it('matches approve when call uses short form and known list uses padded form', () => {
    const paddedWbtc = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
    const unpaddedWbtc = '0x3fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac';
    const calls = [{contractAddress: unpaddedWbtc, entrypoint: 'approve', calldata: ['0xspender', '100', '0']}];
    expect(() => validateExternalCalls(calls, [paddedWbtc, KNOWN_STRK], 'AVNU DEX')).not.toThrow();
  });

  it('matches approve when call uses padded form and known list uses padded form', () => {
    const paddedWbtc = StarknetAddress.of('0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac');
    const calls = [{contractAddress: paddedWbtc, entrypoint: 'approve', calldata: ['0xspender', '100', '0']}];
    expect(() => validateExternalCalls(calls, [paddedWbtc, KNOWN_STRK], 'AVNU DEX')).not.toThrow();
  });

  // =========================================================================
  // Safe entrypoints
  // =========================================================================

  it('allows non-dangerous entrypoints on any contract', () => {
    const calls = [
      {contractAddress: UNKNOWN_CONTRACT, entrypoint: 'commit', calldata: ['0x1']},
      {contractAddress: UNKNOWN_CONTRACT, entrypoint: 'multi_route_swap', calldata: ['0x1']},
      {contractAddress: UNKNOWN_CONTRACT, entrypoint: 'init', calldata: []},
    ];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService')).not.toThrow();
  });

  it('allows empty calls array', () => {
    expect(() => validateExternalCalls([], KNOWN_TOKENS, 'TestService')).not.toThrow();
  });

  // =========================================================================
  // Mixed calls
  // =========================================================================

  it('validates all calls and blocks if any is forbidden', () => {
    const calls = [
      {contractAddress: KNOWN_WBTC, entrypoint: 'approve', calldata: ['0xspender', '100', '0']},
      {contractAddress: UNKNOWN_CONTRACT, entrypoint: 'commit', calldata: ['0x1']},
      {contractAddress: KNOWN_WBTC, entrypoint: 'transfer', calldata: ['0xattacker', '999999', '0']},
    ];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'TestService'))
      .toThrow(UnsafeExternalCallError);
  });

  // =========================================================================
  // Error message
  // =========================================================================

  it('includes service name and reason in error message', () => {
    const calls = [{contractAddress: KNOWN_WBTC, entrypoint: 'transfer', calldata: []}];
    expect(() => validateExternalCalls(calls, KNOWN_TOKENS, 'Atomiq'))
      .toThrow(/Atomiq.*transfer/);
  });
});
