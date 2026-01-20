export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function validateUsername(username: string): boolean {
	// Username should be 3-20 characters, alphanumeric and underscores only
	const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
	return usernameRegex.test(username);
}

export function sanitizeString(input: string): string {
	// Remove any HTML tags and trim whitespace
	return input.replace(/<[^>]*>/g, '').trim();
}
