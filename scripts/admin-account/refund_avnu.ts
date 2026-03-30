import {Account, CallData, RpcProvider, Signer} from 'starknet';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// USAGE: npx tsx scripts/admin-account/refund_avnu.ts [amount_strk]
//
// Funds AVNU paymaster credits via the on-chain funding entrypoint.
// Default amount: 10 STRK.
//
// Requires:
//   - .treasury.mainnet.secret.json (admin account with STRK balance)
//   - .avnu.secret.json (AVNU contract + api key hash)

const STRK_TOKEN = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const STRK_DECIMALS = 18;
const RPC_URL = 'https://api.cartridge.gg/x/starknet/mainnet';

interface AccountFile {
  readonly privateKey: string;
  readonly address: string;
}

interface AvnuSecret {
  readonly contractEntryPoint: string;
  readonly publicIdHash: string;
}

function loadAccount(): AccountFile {
  const filePath = join(SCRIPT_DIR, '.treasury.mainnet.secret.json');
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as AccountFile;
  } catch {
    console.error(`Account file not found: ${filePath}`);
    console.error('Run: npx tsx scripts/admin-account/create.ts mainnet');
    process.exit(1);
  }
}

function loadAvnuSecret(): AvnuSecret {
  const filePath = join(SCRIPT_DIR, '.avnu.secret.json');
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as AvnuSecret;
  } catch {
    console.error(`AVNU secret not found: ${filePath}`);
    console.error('Create it with: { "contractEntryPoint": "0x...", "publicIdHash": "0x..." }');
    process.exit(1);
  }
}

function formatStrk(wei: bigint): string {
  const whole = wei / 10n ** BigInt(STRK_DECIMALS);
  const fraction = wei % 10n ** BigInt(STRK_DECIMALS);
  const fractionStr = fraction.toString().padStart(STRK_DECIMALS, '0').slice(0, 6);
  return `${whole}.${fractionStr}`;
}

async function main(): Promise<void> {
  const amountStrk = BigInt(process.argv[2] ?? '10');
  const amountWei = amountStrk * 10n ** BigInt(STRK_DECIMALS);

  const {privateKey, address} = loadAccount();
  const {contractEntryPoint: paymasterContract, publicIdHash} = loadAvnuSecret();

  const provider = new RpcProvider({nodeUrl: RPC_URL});
  const signer = new Signer(privateKey);
  const account = new Account({provider, address, signer});

  console.log(`From:       ${address}`);
  console.log(`Paymaster:  ${paymasterContract}`);
  console.log(`API Key:    ${publicIdHash}`);
  console.log(`Amount:     ${formatStrk(amountWei)} STRK`);
  console.log();

  const approveCall = {
    contractAddress: STRK_TOKEN,
    entrypoint: 'approve',
    calldata: CallData.compile({
      spender: paymasterContract,
      amount: {low: amountWei, high: 0n},
    }),
  };

  const fundingCall = {
    contractAddress: paymasterContract,
    entrypoint: 'funding',
    calldata: CallData.compile({
      amount: {low: amountWei, high: 0n},
      api_key_hash: publicIdHash,
    }),
  };

  console.log('Sending transaction (approve + funding)...');
  const {transaction_hash: txHash} = await account.execute([approveCall, fundingCall]);
  console.log(`Tx hash:  ${txHash}`);

  console.log('Waiting for confirmation...');
  await provider.waitForTransaction(txHash);
  console.log(`Done. ${formatStrk(amountWei)} STRK credited to AVNU paymaster.`);
}

main().catch((err: unknown) => {
  console.error('Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
