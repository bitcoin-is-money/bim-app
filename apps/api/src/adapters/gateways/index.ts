// Re-exported from extracted packages
export {StarknetRpcGateway, type StarknetGatewayConfig} from '@bim/starknet';
export {AvnuPaymasterGateway, type AvnuPaymasterConfig} from '@bim/starknet';
export {AvnuSwapGateway, type AvnuSwapConfig} from '@bim/starknet';
export {WebAuthnSignatureProcessor, type WebAuthnSignatureConfig} from '@bim/starknet';
export {AtomiqSdkGateway, type AtomiqGatewayConfig} from '@bim/atomiq';
export {SlackNotificationGateway, type SlackNotificationConfig} from '@bim/slack';
export {NoopNotificationGateway} from '@bim/domain/notifications';

// Still local
export * from './simplewebauthn.gateway.js';
export * from './bolt11-lightning.decoder.js';
export * from './coingecko-price.gateway.js';
