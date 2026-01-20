import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Import centralized configuration validation
// Note: Using basic validation functions to avoid build dependency issues
const { isValidUrl, isValidBitcoinNetwork, isValidDatabaseUrl } = {
	isValidUrl: (url) => {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	},
	isValidBitcoinNetwork: (network) => ['mainnet', 'testnet', 'regtest'].includes(network),
	isValidDatabaseUrl: (url) => /^(postgresql|postgres|mysql|sqlite):\/\//.test(url)
};

// Environment variables to check
const REQUIRED_PUBLIC_VARS = ['PUBLIC_BITCOIN_NETWORK'];

// Required environment variables for production
const requiredEnvVars = ['DATABASE_URL', 'SESSION_SECRET', 'STARKNET_RPC_URL'];

const OPTIONAL_VARS = [
	'PUBLIC_WEBAUTHN_RP_ID',
	'PUBLIC_BIM_ARGENT_050_ACCOUNT_CLASS_HASH',
	'PUBLIC_DEPLOYER_ADDRESS',
	'PUBLIC_DEPLOYER_PRIVATE_KEY',
	'PUBLIC_STARKNET_SPEC_VERSION',
	'AVNU_API_KEY',
	'DATABASE_SSL',
	'SECURE_COOKIES',
	'LOG_LEVEL'
];

function validateEnvironment() {
	console.log('🔍 Validating environment variables using centralized configuration...');

	const environment = process.env.NODE_ENV || 'development';
	const errors = [];
	const warnings = [];

	// Check required public variables
	console.log('\n📋 Checking required public variables...');
	for (const envVar of REQUIRED_PUBLIC_VARS) {
		const value = process.env[envVar];
		if (!value) {
			errors.push(`Missing required environment variable: ${envVar}`);
			console.error(`❌ ${envVar}: missing (required)`);
		} else {
			// Use validation functions
			if (envVar === 'PUBLIC_BITCOIN_NETWORK' && !isValidBitcoinNetwork(value)) {
				errors.push(`Invalid Bitcoin network for ${envVar}: ${value}`);
				console.error(`❌ ${envVar}: invalid network (must be mainnet, testnet, or regtest)`);
			} else {
				console.log(`✅ ${envVar}: configured and valid`);
			}
		}
	}

	// Check production-required variables
	if (environment === 'production') {
		console.log('\n🏗️ Checking production-required variables...');
		for (const envVar of requiredEnvVars) {
			const value = process.env[envVar];
			if (!value) {
				errors.push(`Missing required production environment variable: ${envVar}`);
				console.error(`❌ ${envVar}: missing (required for production)`);
			} else {
				// Use validation functions
				if (envVar === 'DATABASE_URL' && !isValidDatabaseUrl(value)) {
					errors.push(`Invalid database URL format for ${envVar}`);
					console.error(`❌ ${envVar}: invalid database URL format`);
				} else if (envVar === 'STARKNET_RPC_URL' && !isValidUrl(value)) {
					errors.push(`Invalid URL format for ${envVar}: ${value}`);
					console.error(`❌ ${envVar}: invalid URL format`);
				} else {
					console.log(`✅ ${envVar}: configured and valid`);
				}
			}
		}
	}

	// Check optional variables
	console.log('\n📄 Checking optional variables...');
	const presentOptional = [];
	for (const envVar of OPTIONAL_VARS) {
		const value = process.env[envVar];
		if (value) {
			presentOptional.push(envVar);

			// Validate URL format for URL variables
			if (envVar.includes('URL') || envVar.includes('DSN')) {
				if (!isValidUrl(value)) {
					warnings.push(`Invalid URL format for optional variable ${envVar}: ${value}`);
					console.log(`⚠️  ${envVar}: configured but invalid URL format`);
				} else {
					console.log(`✅ ${envVar}: configured and valid`);
				}
			} else {
				console.log(`✅ ${envVar}: configured`);
			}
		} else {
			console.log(`⚠️  ${envVar}: not set (optional)`);
		}
	}

	// Show warnings
	if (warnings.length > 0) {
		console.log('\n⚠️ Warnings:');
		warnings.forEach((warning) => console.log(`  - ${warning}`));
	}

	// Show results
	if (errors.length > 0) {
		console.error('\n❌ Environment validation failed with errors:');
		errors.forEach((error) => console.error(`  - ${error}`));
		console.error('\n💡 Fix these issues before running the application.');
		return false;
	}

	console.log(`\n✅ Environment validation passed for ${environment} environment`);
	console.log(
		`📊 Required public: ${REQUIRED_PUBLIC_VARS.length}/${REQUIRED_PUBLIC_VARS.length} configured`
	);
	if (environment === 'production') {
		console.log(
			`📊 Required production: ${requiredEnvVars.length}/${requiredEnvVars.length} configured`
		);
	}
	console.log(`📊 Optional: ${presentOptional.length}/${OPTIONAL_VARS.length} configured`);

	if (warnings.length > 0) {
		console.log(`⚠️  Warnings: ${warnings.length} issues found (non-blocking)`);
	}

	return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const isValid = validateEnvironment();
	if (!isValid) {
		console.error('\n💡 This validation failure may cause a process restart.');
		console.error('🔄 If you see SIGTERM errors in logs, this is likely the cause.');
		console.error(
			'✅ The application will retry and should start successfully once issues are resolved.\n'
		);
	}
	process.exit(isValid ? 0 : 1);
}

export { validateEnvironment };
