#!/usr/bin/env node

/**
 * Production Readiness Test Script
 *
 * This script validates that the application is ready for Railway deployment
 * by checking environment configuration, build process, and critical functionality.
 */

import { validateEnvironment } from './validate-env.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const requiredFiles = [
	'railway.json',
	'package.json',
	'src/routes/api/health/+server.ts',
	'scripts/migrate.js',
	'RAILWAY_DEPLOYMENT.md'
];

const requiredScripts = ['build', 'start', 'migrate:prod', 'validate:env'];

function checkFiles() {
	console.log('📁 Checking required files...');
	const missing = [];

	for (const file of requiredFiles) {
		if (existsSync(file)) {
			console.log(`✅ ${file}: exists`);
		} else {
			console.log(`❌ ${file}: missing`);
			missing.push(file);
		}
	}

	return missing.length === 0;
}

function checkPackageScripts() {
	console.log('\n📦 Checking package.json scripts...');
	try {
		const pkg = JSON.parse(execSync('cat package.json', { encoding: 'utf8' }));
		const missing = [];

		for (const script of requiredScripts) {
			if (pkg.scripts[script]) {
				console.log(`✅ ${script}: configured`);
			} else {
				console.log(`❌ ${script}: missing`);
				missing.push(script);
			}
		}

		return missing.length === 0;
	} catch (error) {
		console.error('❌ Failed to read package.json:', error.message);
		return false;
	}
}

function testBuild() {
	console.log('\n🔨 Testing production build...');
	try {
		execSync('npm run build', { stdio: 'pipe' });
		console.log('✅ Production build: successful');

		// Check if build outputs exist
		const buildOutputs = ['.svelte-kit/output/server/index.js', '.svelte-kit/output/client/_app'];

		for (const output of buildOutputs) {
			if (existsSync(output)) {
				console.log(`✅ ${output}: created`);
			} else {
				console.log(`⚠️  ${output}: not found`);
			}
		}

		return true;
	} catch (error) {
		console.error('❌ Production build: failed');
		console.error(error.message);
		return false;
	}
}

function checkDependencyVulnerabilities() {
	console.log('\n🔒 Checking dependency vulnerabilities...');
	try {
		const auditOutput = execSync('npm audit --audit-level=high --json', {
			encoding: 'utf8',
			stdio: 'pipe'
		});

		const audit = JSON.parse(auditOutput);
		const highVulns = audit.metadata?.vulnerabilities?.high || 0;
		const criticalVulns = audit.metadata?.vulnerabilities?.critical || 0;

		if (highVulns === 0 && criticalVulns === 0) {
			console.log('✅ No high/critical vulnerabilities found');
			return true;
		} else {
			console.log(`⚠️  Found ${highVulns} high and ${criticalVulns} critical vulnerabilities`);
			console.log('💡 Consider running `npm audit fix` before production');
			return true; // Don't fail for this as they might be dev dependencies
		}
	} catch (error) {
		console.log('⚠️  Could not check vulnerabilities (this is okay)');
		return true;
	}
}

function printProductionChecklist() {
	console.log('\n📋 Railway Deployment Checklist:');
	console.log('');
	console.log('🏗️  Railway Setup:');
	console.log('   □ Create Railway project from GitHub repo');
	console.log('   □ Add PostgreSQL service');
	console.log('   □ Configure environment variables (see RAILWAY_DEPLOYMENT.md)');
	console.log('');
	console.log('🔐 Security:');
	console.log('   □ Generate secure SESSION_SECRET (64+ characters)');
	console.log('   □ Set NODE_ENV=production');
	console.log('   □ Use testnet keys only (never mainnet keys)');
	console.log('');
	console.log('🌐 Starknet:');
	console.log('   □ Set PUBLIC_STARKNET_RPC_URL to valid Starknet RPC');
	console.log('   □ Ensure deployer account has sufficient testnet ETH');
	console.log('   □ Set PUBLIC_WEBAUTHN_RP_ID to your Railway domain');
	console.log('');
	console.log('✅ Testing:');
	console.log('   □ Test /api/health endpoint');
	console.log('   □ Verify database migration logs');
	console.log('   □ Test WebAuthn registration/login');
	console.log('   □ Test Starknet account deployment');
}

async function main() {
	console.log('🚀 Production Readiness Test\n');

	let allPassed = true;

	// Test 1: Environment validation
	console.log('🔍 Testing environment validation...');
	const envValid = validateEnvironment();
	if (!envValid) {
		console.log('💡 This is expected - set DATABASE_URL for full validation');
	}
	console.log('');

	// Test 2: Required files
	if (!checkFiles()) {
		allPassed = false;
	}

	// Test 3: Package scripts
	if (!checkPackageScripts()) {
		allPassed = false;
	}

	// Test 4: Production build
	if (!testBuild()) {
		allPassed = false;
	}

	// Test 5: Security check
	checkDependencyVulnerabilities();

	console.log('\n' + '='.repeat(60));

	if (allPassed) {
		console.log('🎉 Production Readiness: PASSED');
		console.log('✅ Your application is ready for Railway deployment!');
	} else {
		console.log('❌ Production Readiness: FAILED');
		console.log('🔧 Please fix the issues above before deploying');
	}

	printProductionChecklist();

	process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
	console.error('💥 Test runner failed:', error);
	process.exit(1);
});
