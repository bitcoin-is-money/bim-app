import {z} from 'zod';

// =============================================================================
// Validation Schemas
// =============================================================================

export const SwapDirectionSchema = z.enum([
  'lightning_to_starknet',
  'bitcoin_to_starknet',
  'starknet_to_lightning',
  'starknet_to_bitcoin',
]);
