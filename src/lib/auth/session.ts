/**
 * @fileoverview Session Management System for WebAuthn Authentication
 *
 * This module handles secure session management for the WebAuthn Starknet account
 * deployment application. It provides comprehensive session lifecycle management
 * including creation, validation, expiration, and cleanup.
 *
 * Key Features:
 * - Secure session token generation using UUIDs
 * - Database-backed session storage with expiration
 * - HTTP-only secure cookies for session transport
 * - Automatic session cleanup on expiration
 * - Integration with SvelteKit request/response cycle
 * - Production-ready security configurations
 *
 * Security Considerations:
 * - Sessions use secure, HTTP-only cookies to prevent XSS attacks
 * - CSRF protection through SameSite cookie attribute
 * - Automatic expiration and cleanup of stale sessions
 * - Session validation on every request
 * - Secure cookie settings for production environments
 *
 * @requires uuid - Secure random session ID generation
 * @requires drizzle-orm - Database ORM for session storage
 * @requires $lib/db - Database connection and schema definitions
 * @requires @sveltejs/kit - SvelteKit request/response utilities
 *
 * @author bim
 * @version 1.0.0
 */

import { db, sessions, users, type User } from '$lib/db';
import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session cookie name used for storing session identifiers
 * This name is used consistently across all session operations
 */
const SESSION_COOKIE_NAME = 'session';

/**
 * Session duration in milliseconds (7 days)
 * After this period, sessions automatically expire and are cleaned up
 * This provides a balance between user convenience and security
 */
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Create a new session for an authenticated user
 *
 * Generates a secure session with:
 * - Unique UUID-based session identifier
 * - Database storage with expiration timestamp
 * - Automatic cleanup after SESSION_DURATION
 *
 * @param userId - The ID of the authenticated user
 * @returns Promise<string> - The generated session ID
 * @throws Error if database is not configured
 *
 * @example
 * ```typescript
 * const sessionId = await createSession(user.id);
 * setSessionCookie(event, sessionId);
 * ```
 */
export async function createSession(userId: string) {
	const database = db();
	if (!database) {
		throw new Error('Database not configured');
	}

	// Generate cryptographically secure session identifier
	const sessionId = uuidv4();

	// Calculate expiration time based on current time + duration
	const expiresAt = new Date(Date.now() + SESSION_DURATION);

	// Store session in database with expiration
	await database.insert(sessions).values({
		id: sessionId,
		userId,
		expiresAt
	});

	return sessionId;
}

/**
 * Validate a session and return the associated user
 *
 * Performs comprehensive session validation:
 * - Checks session existence in database
 * - Verifies session hasn't expired
 * - Automatically cleans up expired sessions
 * - Returns user data if session is valid
 *
 * @param sessionId - The session identifier to validate
 * @returns Promise<User | null> - User object if valid, null if invalid/expired
 *
 * @example
 * ```typescript
 * const user = await validateSession(sessionId);
 * if (user) {
 *   // Session is valid, proceed with authenticated request
 * } else {
 *   // Session is invalid or expired
 * }
 * ```
 */
export async function validateSession(sessionId: string): Promise<User | null> {
	const database = db();
	if (!database) {
		return null;
	}

	// Query session and associated user data in a single operation
	const result = await database
		.select({
			user: users,
			session: sessions
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId))
		.limit(1);

	// Session not found in database
	if (result.length === 0) {
		return null;
	}

	const { user, session } = result[0]!;

	// Check if session has expired
	if (session.expiresAt < new Date()) {
		// Clean up expired session from database
		await deleteSession(sessionId);
		// FIXME The cookie should be deleted from client too...
		return null;
	}

	// Session is valid, return user data
	return user;
}

/**
 * Delete a session from the database
 *
 * Permanently removes a session record, effectively logging out the user.
 * This function is used during logout operations and cleanup procedures.
 *
 * @param sessionId - The session identifier to delete
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await deleteSession(sessionId);
 * clearSessionCookie(event);
 * ```
 */
export async function deleteSession(sessionId: string) {
	const database = db();
	if (!database) {
		return;
	}

	// Remove session from database
	await database.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Set a secure session cookie in the client browser
 *
 * Configures a session cookie with security best practices:
 * - HTTP-only to prevent XSS attacks
 * - Secure flag for HTTPS in production
 * - SameSite strict for CSRF protection
 * - Proper expiration time
 *
 * @param event - SvelteKit request event object
 * @param sessionId - The session identifier to store
 *
 * @example
 * ```typescript
 * const sessionId = await createSession(user.id);
 * setSessionCookie(event, sessionId);
 * ```
 */
export function setSessionCookie(event: RequestEvent, sessionId: string) {
	event.cookies.set(SESSION_COOKIE_NAME, sessionId, {
		path: '/', // Available across entire site
		httpOnly: true, // Prevent JavaScript access (XSS protection)
		secure: (typeof process !== 'undefined' ? process.env.SECURE_COOKIES : null) !== 'false', // HTTPS by default, can be disabled
		sameSite: 'strict', // CSRF protection
		maxAge: SESSION_DURATION / 1000 // Convert to seconds
	});
}

/**
 * Clear the session cookie from the client browser
 *
 * Removes the session cookie, effectively logging out the user
 * on the client side. Should be used in conjunction with
 * deleteSession() for complete logout.
 *
 * @param event - SvelteKit request event object
 *
 * @example
 * ```typescript
 * await deleteSession(sessionId);
 * clearSessionCookie(event);
 * ```
 */
export function clearSessionCookie(event: RequestEvent) {
	event.cookies.delete(SESSION_COOKIE_NAME, {
		path: '/',
		httpOnly: true,
		secure: (typeof process !== 'undefined' ? process.env.SECURE_COOKIES : null) !== 'false',
		sameSite: 'strict'
	});
}

/**
 * Extract session ID from request cookies
 *
 * Retrieves the session identifier from the HTTP cookies
 * attached to the current request.
 *
 * @param event - SvelteKit request event object
 * @returns string | null - Session ID if present, null otherwise
 *
 * @example
 * ```typescript
 * const sessionId = getSessionId(event);
 * if (sessionId) {
 *   const user = await validateSession(sessionId);
 * }
 * ```
 */
export function getSessionId(event: RequestEvent): string | null {
	return event.cookies.get(SESSION_COOKIE_NAME) || null;
}

/**
 * Get the current authenticated user from the request
 *
 * High-level function that combines session extraction and validation
 * to return the current user if authenticated. This is the primary
 * function used throughout the application for authentication checks.
 *
 * Flow:
 * 1. Extract session ID from cookies
 * 2. Validate session against database
 * 3. Return user if valid, null if not authenticated
 *
 * @param event - SvelteKit request event object
 * @returns Promise<User | null> - Authenticated user or null
 *
 * @example
 * ```typescript
 * const user = await getCurrentUser(event);
 * if (user) {
 *   // User is authenticated
 *   console.log(`Welcome ${user.username}`);
 * } else {
 *   // User is not authenticated
 *   redirect('/login');
 * }
 * ```
 */
export async function getCurrentUser(event: RequestEvent): Promise<User | null> {
	const sessionId = getSessionId(event);
	if (!sessionId) {
		return null;
	}

	return await validateSession(sessionId);
}
