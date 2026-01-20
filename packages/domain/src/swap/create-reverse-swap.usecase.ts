import {StarknetAddress} from '../account/types';
import type {AtomiqGateway} from '../ports/atomiq.gateway';
import type {SwapRepository} from '../ports/swap.repository';
import {Swap} from './swap';
import {BitcoinAddress, LightningInvoice, SwapAmountError, SwapCreationError, SwapId,} from './types';

// =============================================================================
// Shared Dependencies
// =============================================================================

export interface CreateReverseSwapDeps {
  swapRepository: SwapRepository;
  atomiqGateway: AtomiqGateway;
}

// =============================================================================
// Starknet → Lightning
// =============================================================================

export interface CreateStarknetToLightningInput {
  invoice: string;
  sourceAddress: string;
}

export interface CreateStarknetToLightningOutput {
  swap: Swap;
  depositAddress: string;
  amountSats: bigint;
}

export type CreateStarknetToLightningUseCase = (input: CreateStarknetToLightningInput) => Promise<CreateStarknetToLightningOutput>;

/**
 * Creates a Starknet → Lightning swap.
 * User deposits tokens on Starknet, receives payment on Lightning.
 */
export function getCreateStarknetToLightningUseCase(deps: CreateReverseSwapDeps): CreateStarknetToLightningUseCase {
  return async (input: CreateStarknetToLightningInput): Promise<CreateStarknetToLightningOutput> => {
    const invoice = LightningInvoice.of(input.invoice);
    const sourceAddress = StarknetAddress.of(input.sourceAddress);

    const limits = await deps.atomiqGateway.getStarknetToLightningLimits();

    // Create swap (invoice determines amount)
    const atomiqSwap = await deps.atomiqGateway.createStarknetToLightningSwap({
      invoice,
      sourceAddress,
    });

    if (!atomiqSwap.depositAddress) {
      throw new SwapCreationError('Failed to generate Starknet deposit address');
    }

    // Validate amount after creation (invoice-derived)
    if (atomiqSwap.amountSats < limits.minSats || atomiqSwap.amountSats > limits.maxSats) {
      throw new SwapAmountError(atomiqSwap.amountSats, limits.minSats, limits.maxSats);
    }

    const swap = Swap.createStarknetToLightning({
      id: SwapId.of(atomiqSwap.swapId),
      amountSats: atomiqSwap.amountSats,
      sourceAddress,
      invoice,
      depositAddress: atomiqSwap.depositAddress,
      expiresAt: atomiqSwap.expiresAt,
    });

    await deps.swapRepository.save(swap);
    await deps.atomiqGateway.registerSwapForMonitoring(
      SwapId.of(atomiqSwap.swapId),
      atomiqSwap.swapObject,
    );

    return {
      swap,
      depositAddress: atomiqSwap.depositAddress,
      amountSats: atomiqSwap.amountSats,
    };
  };
}

// =============================================================================
// Starknet → Bitcoin
// =============================================================================

export interface CreateStarknetToBitcoinInput {
  amountSats: bigint;
  destinationAddress: string;
  sourceAddress: string;
}

export interface CreateStarknetToBitcoinOutput {
  swap: Swap;
  depositAddress: string;
}

export type CreateStarknetToBitcoinUseCase = (input: CreateStarknetToBitcoinInput) => Promise<CreateStarknetToBitcoinOutput>;

/**
 * Creates a Starknet → Bitcoin swap.
 * User deposits tokens on Starknet, receives BTC on-chain.
 */
export function getCreateStarknetToBitcoinUseCase(deps: CreateReverseSwapDeps): CreateStarknetToBitcoinUseCase {
  return async (input: CreateStarknetToBitcoinInput): Promise<CreateStarknetToBitcoinOutput> => {
    const destinationAddress = BitcoinAddress.of(input.destinationAddress);
    const sourceAddress = StarknetAddress.of(input.sourceAddress);

    // Validate amount against limits
    const limits = await deps.atomiqGateway.getStarknetToBitcoinLimits();
    if (input.amountSats < limits.minSats || input.amountSats > limits.maxSats) {
      throw new SwapAmountError(input.amountSats, limits.minSats, limits.maxSats);
    }

    // Create swap via Atomiq
    const atomiqSwap = await deps.atomiqGateway.createStarknetToBitcoinSwap({
      amountSats: input.amountSats,
      destinationAddress,
      sourceAddress,
    });

    if (!atomiqSwap.depositAddress) {
      throw new SwapCreationError('Failed to generate Starknet deposit address');
    }

    const swap = Swap.createStarknetToBitcoin({
      id: SwapId.of(atomiqSwap.swapId),
      amountSats: input.amountSats,
      sourceAddress,
      destinationAddress,
      depositAddress: atomiqSwap.depositAddress,
      expiresAt: atomiqSwap.expiresAt,
    });

    await deps.swapRepository.save(swap);
    await deps.atomiqGateway.registerSwapForMonitoring(
      SwapId.of(atomiqSwap.swapId),
      atomiqSwap.swapObject,
    );

    return {
      swap,
      depositAddress: atomiqSwap.depositAddress,
    };
  };
}
