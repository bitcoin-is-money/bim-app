import {defineConfig} from 'apibara/config';

// connectionString: PostgreSQL connection URL (shared DB with @bim/api)
// streamUrl: Apibara DNA stream endpoint
// contractAddress: ERC20 token contract to watch for Transfer events
// startingBlock: Block number to start indexing from (first run only — resumes from checkpoint after that)
// accountCacheTtlMs: How long to cache the accounts list (ms)
export default defineConfig({
  runtimeConfig: {
    connectionString: process.env.DATABASE_URL,
    streamUrl: process.env.APIBARA_STREAM_URL,
    contractAddress: process.env.WBTC_CONTRACT_ADDRESS,
    startingBlock: process.env.STARTING_BLOCK ?? '0',
    accountCacheTtlMs: process.env.ACCOUNT_CACHE_TTL_MS ?? '60000',
  },
  presets: {
    // Local dev against Starknet Sepolia + docker-compose PostgreSQL.
    // DNA_TOKEN must be set via .env.testnet.local (git ignored).
    testnet: {
      runtimeConfig: {
        connectionString: 'postgresql://bim_user:bim_password@localhost:5432/bim',
        streamUrl: 'https://sepolia.starknet.a5a.ch',
        contractAddress: '0x00abbd7d98ad664568f204d6e1af6e02d6a5c55eb4e83c9fbbfc3ed8514efc09',
      },
    },
    // Production against Starknet mainnet.
    // connectionString must be set via env var (secret).
    mainnet: {
      runtimeConfig: {
        streamUrl: 'https://mainnet.starknet.a5a.ch',
        contractAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',
      },
    },
  },
});
