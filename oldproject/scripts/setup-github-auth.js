#!/usr/bin/env node

/**
 * Setup script for GitHub Package Registry authentication
 * This script creates a temporary .npmrc file with the GitHub token
 * for use during the build process.
 */

const fs = require('fs');
const path = require('path');

const githubToken = process.env.GITHUB_TOKEN;

if (!githubToken) {
	console.error('❌ GITHUB_TOKEN environment variable is not set');
	console.error('Please set GITHUB_TOKEN in your Railway environment variables');
	process.exit(1);
}

// Create a temporary .npmrc with the GitHub token
const npmrcContent = `registry=https://registry.npmjs.org

@adrienlacombe:registry=https://npm.pkg.github.com
@atomiqlabs:registry=https://registry.npmjs.org/
@noble:registry=https://registry.npmjs.org/
@scure:registry=https://registry.npmjs.org/
@abi-wan-kanabi:registry=https://registry.npmjs.org/

//npm.pkg.github.com/:_authToken=${githubToken}
`;

const npmrcPath = path.join(process.cwd(), '.npmrc');
fs.writeFileSync(npmrcPath, npmrcContent);

console.log('✅ GitHub Package Registry authentication configured');
console.log(`📁 Created .npmrc at ${npmrcPath}`);
