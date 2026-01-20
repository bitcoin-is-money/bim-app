import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default [
	js.configs.recommended,
	{
		ignores: ['coverage/**', 'build/**', 'dist/**', 'node_modules/**']
	},
	{
		files: ['**/*.ts', '**/*.js'],
		ignores: ['**/*.d.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module',
				project: './tsconfig.json'
			},
			globals: {
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				process: 'readonly',
				global: 'readonly',
				crypto: 'readonly',
				btoa: 'readonly',
				atob: 'readonly',
				Buffer: 'readonly',
				fetch: 'readonly',
				require: 'readonly',
				setImmediate: 'readonly',
				PublicEnv: 'readonly',
				TimeoutConfig: 'readonly'
			}
		},
		plugins: { '@typescript-eslint': typescript },
		rules: {
			...typescript.configs.recommended.rules,
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': 'warn',
			'no-useless-catch': 'warn',
			'@typescript-eslint/ban-ts-comment': 'warn',
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['**/services/client/**'],
							importNames: ['*'],
							message:
								'Client services cannot be imported in server-side code. Use server services instead.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/test/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'no-restricted-imports': 'off'
		}
	},
	{
		files: ['src/routes/api/**/*.ts', 'src/lib/services/server/**/*.ts', 'src/hooks.server.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['**/services/client/**'],
							message:
								'Server-side code cannot import client services. Use server services from $lib/services/server instead.'
						},
						{
							group: ['$env/dynamic/public'],
							message: 'Server-side code should use $env/dynamic/private for environment variables.'
						}
					]
				}
			]
		}
	},
	{
		files: [
			'src/lib/components/**/*.svelte',
			'src/routes/**/*.svelte',
			'src/lib/services/client/**/*.ts'
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['**/services/server/**'],
							message:
								'Client-side code cannot import server services. Use client services from $lib/services/client instead.'
						},
						{
							group: ['$env/dynamic/private'],
							message: 'Client-side code should use $env/dynamic/public for environment variables.'
						}
					]
				}
			]
		}
	},
	// Svelte configuration
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs.prettier,
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: typescriptParser,
				extraFileExtensions: ['.svelte'],
				ecmaVersion: 2020,
				sourceType: 'module'
			},
			globals: {
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				crypto: 'readonly',
				btoa: 'readonly',
				atob: 'readonly',
				Buffer: 'readonly',
				fetch: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				Event: 'readonly',
				HTMLInputElement: 'readonly',
				KeyboardEvent: 'readonly',
				MouseEvent: 'readonly',
				HTMLElement: 'readonly',
				FileReader: 'readonly',
				Blob: 'readonly',
				File: 'readonly'
			}
		},
		plugins: { svelte, '@typescript-eslint': typescript },
		rules: {
			// Svelte-specific rules
			'svelte/no-at-debug-tags': 'warn',
			'svelte/no-unused-svelte-ignore': 'warn',
			'svelte/prefer-class-directive': 'warn',
			'svelte/prefer-style-directive': 'warn',
			'svelte/button-has-type': 'warn',
			'svelte/no-target-blank': 'warn',
			'svelte/no-reactive-functions': 'warn',
			'svelte/no-reactive-literals': 'warn',
			// TypeScript rules for script blocks
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': 'warn'
		}
	}
];
