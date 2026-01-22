import type {TestProject} from 'vitest/node';
import {StrkDevnet} from "./strk-devnet";
import {TestDatabase} from "./test-database";

export default async function globalSetup(_ctx: TestProject) {
  console.log('🔧 Global setup');
  const db = await TestDatabase.create();
  let devnet: StrkDevnet | undefined = undefined;
  if (process.env.SKIP_DEVNET === 'true') {
    console.log('∅ Skipping Starknet devnet (SKIP_DEVNET=true)');
  } else {
    devnet = await StrkDevnet.create();
  }
  console.log('Setup complete.\n');
  return async () => {
    const stopPromises: Promise<void>[] = [];
    console.log('🧹 Global teardown');
    stopPromises.push(db.shutdown());
    if (devnet) {
      stopPromises.push(devnet.shutdown());
    }
    await Promise.all(stopPromises);
  };
}
