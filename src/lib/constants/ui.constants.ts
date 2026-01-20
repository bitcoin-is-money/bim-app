/**
 * UI Constants
 * Centralized configuration for theme, layout, display, and user interface settings
 */

// Theme Configuration
export const THEME = {
	COLORS: {
		PRIMARY: '#0066cc',
		SECONDARY: '#6c757d',
		SUCCESS: '#28a745',
		ERROR: '#dc3545',
		WARNING: '#ffc107',
		INFO: '#17a2b8'
	},
	BREAKPOINTS: {
		SM: 576,
		MD: 768,
		LG: 992,
		XL: 1200
	},
	SPACING: {
		XS: '0.25rem',
		SM: '0.5rem',
		MD: '1rem',
		LG: '1.5rem',
		XL: '2rem'
	}
} as const;

// Layout Configuration
export const LAYOUT = {
	HEADER_HEIGHT: 56,
	HEADER_HEIGHT_MOBILE: 48,
	FOOTER_HEIGHT: 56,
	FOOTER_HEIGHT_MOBILE: 48,
	SIDEBAR_WIDTH: 250,
	SIDEBAR_WIDTH_COLLAPSED: 60,
	MAX_CONTENT_WIDTH: 1200
} as const;

// Animation Configuration
export const ANIMATIONS = {
	DURATION: {
		FAST: '150ms',
		NORMAL: '250ms',
		SLOW: '350ms'
	},
	EASING: {
		EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
		EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
		EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)'
	}
} as const;

// Component Configuration
export const COMPONENTS = {
	BUTTON: {
		MIN_HEIGHT: 40,
		BORDER_RADIUS: 6,
		FONT_WEIGHT: 500
	},
	INPUT: {
		MIN_HEIGHT: 40,
		BORDER_RADIUS: 6,
		PADDING_HORIZONTAL: 12
	},
	CARD: {
		BORDER_RADIUS: 8,
		SHADOW: '0 2px 8px rgba(0,0,0,0.1)',
		PADDING: 16
	},
	MODAL: {
		MAX_WIDTH: 500,
		BACKDROP_OPACITY: 0.5,
		BORDER_RADIUS: 12
	}
} as const;

// Display Configuration
export const DISPLAY = {
	ITEMS_PER_PAGE: 20,
	MAX_ITEMS_MOBILE: 10,
	TRUNCATE_LENGTH: 50,
	TRUNCATE_LENGTH_MOBILE: 30,
	QR_CODE_SIZE: 256,
	QR_CODE_SIZE_MOBILE: 200
} as const;

// Loading States
export const LOADING = {
	SPINNER_SIZE: 24,
	SKELETON_ANIMATION_DURATION: '1.5s',
	DEBOUNCE_DELAY: 300,
	THROTTLE_DELAY: 100
} as const;

// Notification Configuration
export const NOTIFICATIONS = {
	DEFAULT_DURATION: 5000, // 5 seconds
	ERROR_DURATION: 8000, // 8 seconds
	SUCCESS_DURATION: 3000, // 3 seconds
	MAX_NOTIFICATIONS: 5,
	POSITION: 'top-right' as const
} as const;
