import {CallData} from 'starknet';
import {STRK_DECIMALS, STRK_TOKEN_ADDRESS} from '../config/constants.js';
import {loadSecrets, requireAvnu, requireTreasury} from '../config/secrets.js';
import {formatStrk} from '../lib/format.js';
import {createAccount, createProvider} from '../lib/starknet.js';

export async function run(args: string[]): Promise<void> {
  const amountStrk = BigInt(args[0] ?? '10');
  const amountWei = amountStrk * 10n ** BigInt(STRK_DECIMALS);

  const secrets = loadSecrets();
  const treasury = requireTreasury(secrets, 'mainnet');
  const avnu = requireAvnu(secrets);

  const provider = createProvider('mainnet');
  const account = createAccount(provider, treasury);

  console.log(`From:       ${treasury.address}`);
  console.log(`Paymaster:  ${avnu.contractEntryPoint}`);
  console.log(`API Key:    ${avnu.publicIdHash}`);
  console.log(`Amount:     ${formatStrk(amountWei)}`);
  console.log();

  const approveCall = {
    contractAddress: STRK_TOKEN_ADDRESS,
    entrypoint: 'approve',
    calldata: CallData.compile({
      spender: avnu.contractEntryPoint,
      amount: {low: amountWei, high: 0n},
    }),
  };

  const fundingCall = {
    contractAddress: avnu.contractEntryPoint,
    entrypoint: 'funding',
    calldata: CallData.compile({
      amount: {low: amountWei, high: 0n},
      api_key_hash: avnu.publicIdHash,
    }),
  };

  console.log('Sending transaction (approve + funding)...');
  const {transaction_hash: txHash} = await account.execute([approveCall, fundingCall]);
  console.log(`Tx hash:  ${txHash}`);

  console.log('Waiting for confirmation...');
  await provider.waitForTransaction(txHash);
  console.log(`Done. ${formatStrk(amountWei)} credited to AVNU paymaster.`);
}
