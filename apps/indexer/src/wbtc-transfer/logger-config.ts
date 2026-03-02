import {DEFAULT_LOGGER_CONFIG} from "@bim/lib/logger";
import type {StyleConfig} from "@bim/lib/logger";

const {requestId: _, ...baseConfig} = DEFAULT_LOGGER_CONFIG;
export const INDEXER_LOGGER_CONFIG: StyleConfig = baseConfig;
