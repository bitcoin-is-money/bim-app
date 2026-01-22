import {GenericContainer, type StartedTestContainer, Wait} from "testcontainers";

export class StrkDevnet {
  private readonly container: StartedTestContainer;

  private constructor(
    container: StartedTestContainer,
  ) {
    this.container = container;
  }

  static async create(): Promise<StrkDevnet> {
    console.log('⚡ Starting Starknet devnet container...');
    const container = await new GenericContainer('shardlabs/starknet-devnet-rs:0.2.3')
      .withExposedPorts(5050)
      .withCommand(['--seed', '0', '--accounts', '3', '--initial-balance', '1000000000000000000000'])
      .withWaitStrategy(Wait.forHttp('/is_alive', 5050).forStatusCode(200))
      .withStartupTimeout(60_000)
      .start();
    const devnetUrl = `http://${container.getHost()}:${container.getMappedPort(5050)}`;
    console.log(`✓ Starknet devnet container started at ${devnetUrl}`);
    process.env.STARKNET_RPC_URL = devnetUrl;
    process.env.DEVNET_URL = devnetUrl;
    return new StrkDevnet(container);
  }

  /**
   * Gets the devnet URL. Throws if not available.
   */
  static getDevnetUrl(): string {
    const url = process.env.DEVNET_URL;
    if (!url) {
      throw new Error('DEVNET_URL not set. Is devnet container running?');
    }
    return url;
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Stopping Starknet devnet container...');
    await this.container.stop().then(() => {
      console.log('✓ Starknet devnet container stopped');
    });
  }

  /**
   * Checks if devnet is available for tests.
   * TODO: rename DEVNET_URL to STRK_DEVNET_URL
   */
  static isAvailable(): boolean {
    return !!process.env.DEVNET_URL;
  }

}
