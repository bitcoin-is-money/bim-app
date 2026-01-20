import { test, expect } from '@playwright/test';

test.describe('WebAuthn Registration Flow', () => {
	test.beforeEach(async ({ page }) => {
		// Enable virtual WebAuthn authenticator
		await page.context().addVirtualAuthenticator({
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true
		});
	});

	test('should successfully register a new WebAuthn credential', async ({ page }) => {
		// Navigate to registration page
		await page.goto('/');

		// Look for registration form or button
		const registerButton = page
			.locator('text=Register')
			.or(page.locator('button:has-text("Create Account")'));
		await expect(registerButton).toBeVisible({ timeout: 10000 });

		// Fill in username if there's a form
		const usernameInput = page.locator(
			'input[type="email"], input[name="username"], input[placeholder*="email"]'
		);
		if (await usernameInput.isVisible()) {
			await usernameInput.fill('test@example.com');
		}

		// Click register button
		await registerButton.click();

		// Wait for WebAuthn credential creation
		// This should trigger navigator.credentials.create() which will be handled by the virtual authenticator
		await expect(
			page.locator('text=Success').or(page.locator('text=Created').or(page.locator('.success')))
		).toBeVisible({ timeout: 15000 });
	});

	test('should handle registration errors gracefully', async ({ page }) => {
		// Navigate to registration page
		await page.goto('/');

		// Disable the virtual authenticator to simulate failure
		await page.context().clearVirtualAuthenticators();

		const registerButton = page
			.locator('text=Register')
			.or(page.locator('button:has-text("Create Account")'));
		if (await registerButton.isVisible()) {
			await registerButton.click();

			// Should show error message
			await expect(page.locator('text=error').or(page.locator('.error'))).toBeVisible({
				timeout: 10000
			});
		}
	});

	test('should authenticate with existing credentials', async ({ page }) => {
		// First register a credential
		await page.context().addVirtualAuthenticator({
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true
		});

		await page.goto('/');

		// Register first
		const registerButton = page
			.locator('text=Register')
			.or(page.locator('button:has-text("Create Account")'));
		if (await registerButton.isVisible()) {
			const usernameInput = page.locator(
				'input[type="email"], input[name="username"], input[placeholder*="email"]'
			);
			if (await usernameInput.isVisible()) {
				await usernameInput.fill('test@example.com');
			}
			await registerButton.click();
			await page.waitForTimeout(2000);
		}

		// Then try to authenticate
		const authButton = page
			.locator('text=Sign In')
			.or(page.locator('text=Authenticate').or(page.locator('button:has-text("Sign In")')));
		if (await authButton.isVisible()) {
			await authButton.click();

			// Should successfully authenticate
			await expect(page.locator('text=Welcome').or(page.locator('text=Authenticated'))).toBeVisible(
				{ timeout: 15000 }
			);
		}
	});

	test('should deploy Starknet account after registration', async ({ page }) => {
		await page.goto('/');

		// Complete registration flow
		const registerButton = page
			.locator('text=Register')
			.or(page.locator('button:has-text("Create Account")'));
		if (await registerButton.isVisible()) {
			const usernameInput = page.locator(
				'input[type="email"], input[name="username"], input[placeholder*="email"]'
			);
			if (await usernameInput.isVisible()) {
				await usernameInput.fill('test@example.com');
			}
			await registerButton.click();
			await page.waitForTimeout(2000);
		}

		// Look for account deployment UI
		const deployButton = page
			.locator('text=Deploy')
			.or(page.locator('button:has-text("Deploy Account")'));
		if (await deployButton.isVisible()) {
			await deployButton.click();

			// Should show deployment progress or success
			await expect(
				page
					.locator('text=Deploying')
					.or(page.locator('text=Deployed').or(page.locator('text=Account Created')))
			).toBeVisible({ timeout: 30000 });
		}
	});
});

test.describe('WebAuthn Error Handling', () => {
	test('should handle unsupported browser gracefully', async ({ page }) => {
		// Override WebAuthn support check
		await page.addInitScript(() => {
			// @ts-ignore
			delete window.PublicKeyCredential;
			// @ts-ignore
			window.navigator.credentials = undefined;
		});

		await page.goto('/');

		// Should show unsupported browser message
		await expect(
			page.locator('text=not supported').or(page.locator('text=browser').or(page.locator('.error')))
		).toBeVisible({ timeout: 10000 });
	});

	test('should handle network errors during registration', async ({ page }) => {
		// Enable virtual authenticator
		await page.context().addVirtualAuthenticator({
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true
		});

		// Block network requests to simulate server errors
		await page.route('**/api/**', (route) => route.abort());

		await page.goto('/');

		const registerButton = page
			.locator('text=Register')
			.or(page.locator('button:has-text("Create Account")'));
		if (await registerButton.isVisible()) {
			const usernameInput = page.locator(
				'input[type="email"], input[name="username"], input[placeholder*="email"]'
			);
			if (await usernameInput.isVisible()) {
				await usernameInput.fill('test@example.com');
			}
			await registerButton.click();

			// Should show network error
			await expect(
				page.locator('text=network').or(page.locator('text=server').or(page.locator('.error')))
			).toBeVisible({ timeout: 15000 });
		}
	});
});
