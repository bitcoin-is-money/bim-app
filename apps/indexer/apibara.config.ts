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
    // DNA_TOKEN must be set via .env.testnet.secret (git ignored).
    testnet: {
      runtimeConfig: {
        connectionString: 'postgresql://bim_user:bim_password@localhost:5432/bim',
        streamUrl: 'https://sepolia.starknet.a5a.ch',
        contractAddress: '0x00452bd5c0512a61df7c7be8cfea5e4f893cb40e126bdc40aee6054db955129e', // wbtc
      },
    },
    // Production against Starknet mainnet.
    // connectionString must be set via env var (secret).
    mainnet: {
      runtimeConfig: {
        streamUrl: 'https://mainnet.starknet.a5a.ch',
        contractAddress: '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac',  // wbtc
      },
    },
  },
});
