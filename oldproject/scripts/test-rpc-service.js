#!/usr/bin/env node

/**
 * Test script to verify RPC service functionality
 * This script tests the RPC service initialization and basic functionality
 */

import { ServerRpcService } from '../src/lib/services/server/rpc.service.js';

async function testRpcService() {
	console.log('🧪 Testing RPC Service...');

	try {
		// Test service initialization
		console.log('1. Testing service initialization...');
		const rpcService = ServerRpcService.getInstance();
		console.log('✅ RPC service initialized successfully');

		// Test chain ID call
		console.log('2. Testing chain ID call...');
		const chainIdResult = await rpcService.getChainId();
		if (chainIdResult.success) {
			console.log('✅ Chain ID call successful:', chainIdResult.data);
		} else {
			console.log('❌ Chain ID call failed:', chainIdResult.error);
		}

		// Test generic call method
		console.log('3. Testing generic call method...');
		const callResult = await rpcService.call('starknet_chainId', []);
		if (callResult.success) {
			console.log('✅ Generic call method successful:', callResult.data);
		} else {
			console.log('❌ Generic call method failed:', callResult.error);
		}

		console.log('🎉 RPC service test completed successfully!');
	} catch (error) {
		console.error('❌ RPC service test failed:', error.message);
		console.error('Stack trace:', error.stack);
		process.exit(1);
	}
}

// Run the test
testRpcService();
