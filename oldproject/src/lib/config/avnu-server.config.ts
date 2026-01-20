import { serverServiceConfig, ServerPrivateEnv } from './server';

// Server-side AVNU configuration with private environment access
// Uses centralized configuration system
export const AVNU_SERVER_CONFIG = serverServiceConfig.getAvnuServerConfig();

export function getAvnuApiKey(): string | undefined {
	return ServerPrivateEnv.AVNU_API_KEY();
}

export function isAvnuConfigured(): boolean {
	return Boolean(ServerPrivateEnv.AVNU_API_KEY());
}
