/**
 * @fileoverview Swipe Gesture Detection Utility
 *
 * Provides touch and mouse-based swipe gesture detection with configurable
 * sensitivity and direction support. Optimized for mobile-first interaction
 * with desktop fallback support.
 *
 * @author bim
 * @version 1.0.0
 */

export interface SwipeOptions {
	minSwipeDistance?: number;
	maxSwipeTime?: number;
	touchSlop?: number;
	preventScroll?: boolean;
}

export interface SwipeCoordinates {
	x: number;
	y: number;
	timestamp: number;
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeResult {
	direction: SwipeDirection;
	distance: number;
	duration: number;
	velocity: number;
}

export interface SwipeCallbacks {
	onSwipeStart?: (coordinates: SwipeCoordinates) => void;
	onSwipeMove?: (coordinates: SwipeCoordinates, delta: { x: number; y: number }) => void;
	onSwipeEnd?: (result: SwipeResult | null) => void;
	onSwipe?: (result: SwipeResult) => void;
	onTap?: (coordinates: SwipeCoordinates) => void;
}

/**
 * Default swipe configuration optimized for mobile
 */
const DEFAULT_OPTIONS: Required<SwipeOptions> = {
	minSwipeDistance: 40, // Reduced for easier mobile swiping
	maxSwipeTime: 800, // Reduced for more responsive gestures
	touchSlop: 8, // Reduced for better sensitivity
	preventScroll: true // Prevent default scroll behavior during swipe
};

/**
 * SwipeGestureDetector class for handling touch and mouse swipe gestures
 */
export class SwipeGestureDetector {
	private element: HTMLElement;
	private options: Required<SwipeOptions>;
	private callbacks: SwipeCallbacks;

	private startCoordinates: SwipeCoordinates | null = null;
	private currentCoordinates: SwipeCoordinates | null = null;
	private isTracking = false;
	private isSwiping = false;
	private velocity = { x: 0, y: 0 };
	private lastMoveTime = 0;
	private rafId: number | null = null;

	// Event listener references for cleanup
	private boundTouchStart = this.handleTouchStart.bind(this);
	private boundTouchMove = this.handleTouchMove.bind(this);
	private boundTouchEnd = this.handleTouchEnd.bind(this);
	private boundMouseDown = this.handleMouseDown.bind(this);
	private boundMouseMove = this.handleMouseMove.bind(this);
	private boundMouseUp = this.handleMouseUp.bind(this);
	private boundMouseLeave = this.handleMouseLeave.bind(this);

	constructor(element: HTMLElement, callbacks: SwipeCallbacks, options: SwipeOptions = {}) {
		this.element = element;
		this.callbacks = callbacks;
		this.options = { ...DEFAULT_OPTIONS, ...options };

		this.attachListeners();
	}

	/**
	 * Attach event listeners to the element
	 */
	private attachListeners(): void {
		// Touch events
		this.element.addEventListener('touchstart', this.boundTouchStart, {
			passive: false
		});
		this.element.addEventListener('touchmove', this.boundTouchMove, {
			passive: false
		});
		this.element.addEventListener('touchend', this.boundTouchEnd, {
			passive: true
		});
		this.element.addEventListener('touchcancel', this.boundTouchEnd, {
			passive: true
		});

		// Mouse events for desktop support
		this.element.addEventListener('mousedown', this.boundMouseDown);
		this.element.addEventListener('mousemove', this.boundMouseMove);
		this.element.addEventListener('mouseup', this.boundMouseUp);
		this.element.addEventListener('mouseleave', this.boundMouseLeave);

		// Prevent context menu on long press for better gesture experience
		this.element.addEventListener('contextmenu', this.handleContextMenu);
	}

	/**
	 * Remove event listeners and cleanup
	 */
	private detachListeners(): void {
		this.element.removeEventListener('touchstart', this.boundTouchStart);
		this.element.removeEventListener('touchmove', this.boundTouchMove);
		this.element.removeEventListener('touchend', this.boundTouchEnd);
		this.element.removeEventListener('touchcancel', this.boundTouchEnd);

		this.element.removeEventListener('mousedown', this.boundMouseDown);
		this.element.removeEventListener('mousemove', this.boundMouseMove);
		this.element.removeEventListener('mouseup', this.boundMouseUp);
		this.element.removeEventListener('mouseleave', this.boundMouseLeave);

		this.element.removeEventListener('contextmenu', this.handleContextMenu);

		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	/**
	 * Handle touch start with enhanced input element handling
	 */
	private handleTouchStart(event: TouchEvent): void {
		if (event.touches.length !== 1) return;

		const target = event.target as Element;

		// Enhanced logic: allow swipe start but track if we're over an input
		const isOverInput = this.isInputElement(target);

		// Always allow swipe zones to initiate gestures
		if (target instanceof HTMLElement && target.classList.contains('swipe-zone')) {
			const touch = event.touches[0];
			this.startGesture(touch.clientX, touch.clientY);
			return;
		}

		// Don't start gestures directly on critical input elements
		if (isOverInput) {
			return;
		}

		const touch = event.touches[0];
		this.startGesture(touch.clientX, touch.clientY);

		// Only prevent scroll for non-input areas
		if (this.options.preventScroll && !isOverInput) {
			event.preventDefault();
		}
	}

	/**
	 * Handle touch move with enhanced gesture continuation
	 */
	private handleTouchMove(event: TouchEvent): void {
		if (!this.isTracking || event.touches.length !== 1) return;

		// Once a swipe has started, continue tracking even over input elements
		// This prevents swipes from being interrupted mid-gesture
		const touch = event.touches[0];
		this.updateGesture(touch.clientX, touch.clientY);

		// Prevent scroll during active swiping, regardless of current target
		if (this.options.preventScroll && this.isSwiping) {
			event.preventDefault();
		}
	}

	/**
	 * Handle touch end
	 */
	private handleTouchEnd(_event: TouchEvent): void {
		this.endGesture();
	}

	/**
	 * Handle mouse down
	 */
	private handleMouseDown(event: MouseEvent): void {
		// Only handle left mouse button
		if (event.button !== 0) return;

		// Don't interfere with input elements
		if (this.isInputElement(event.target as Element)) {
			return;
		}

		this.startGesture(event.clientX, event.clientY);
		event.preventDefault();
	}

	/**
	 * Handle mouse move
	 */
	private handleMouseMove(event: MouseEvent): void {
		if (!this.isTracking) return;

		// Don't interfere with input elements
		if (this.isInputElement(event.target as Element)) {
			return;
		}

		this.updateGesture(event.clientX, event.clientY);
	}

	/**
	 * Handle mouse up
	 */
	private handleMouseUp(_event: MouseEvent): void {
		this.endGesture();
	}

	/**
	 * Handle mouse leave
	 */
	private handleMouseLeave(_event: MouseEvent): void {
		this.endGesture();
	}

	/**
	 * Prevent context menu during gestures
	 */
	private handleContextMenu(event: Event): void {
		if (this.isTracking) {
			event.preventDefault();
		}
	}

	/**
	 * Check if the target element should prevent swipe gestures
	 * More permissive approach that allows swipes in more scenarios
	 */
	private isInputElement(target: Element | null): boolean {
		if (!target) return false;

		// Opt-out hook: any element (or ancestor) marked with [data-swipe-ignore]
		// should not initiate or capture swipe gestures. This lets small controls
		// (e.g., currency/unit toggles) work reliably on mobile without
		// accidental gesture interception.
		if (target instanceof HTMLElement && target.closest('[data-swipe-ignore]')) {
			return true;
		}

		// Always allow swipes on dedicated swipe zones
		if (target instanceof HTMLElement && target.classList.contains('swipe-zone')) {
			return false;
		}

		// Check for direct input elements only (not parent containers)
		const directInputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
		if (directInputTags.includes(target.tagName)) {
			return true;
		}

		// Check for contenteditable elements
		if (target instanceof HTMLElement && target.contentEditable === 'true') {
			return true;
		}

		// Only block buttons if they have focus or are being actively pressed
		if (target.tagName === 'BUTTON') {
			return target === document.activeElement || target.matches(':active');
		}

		// Check for elements with specific interactive roles that require precise interaction
		const restrictiveRoles = ['textbox', 'slider', 'spinbutton'];
		const role = target.getAttribute('role');
		if (role && restrictiveRoles.includes(role)) {
			return true;
		}

		// More permissive approach: only block if we're directly on an input
		// Don't walk up the parent tree as aggressively
		const immediateParent = target.parentElement;
		if (immediateParent && directInputTags.includes(immediateParent.tagName)) {
			return true;
		}

		return false;
	}

	/**
	 * Start gesture tracking
	 */
	private startGesture(x: number, y: number): void {
		this.startCoordinates = {
			x,
			y,
			timestamp: Date.now()
		};
		this.currentCoordinates = { ...this.startCoordinates };
		this.isTracking = true;
		this.isSwiping = false;

		this.callbacks.onSwipeStart?.(this.startCoordinates);
	}

	/**
	 * Update gesture tracking with velocity calculation and throttling
	 */
	private updateGesture(x: number, y: number): void {
		if (!this.startCoordinates || !this.isTracking) return;

		const now = Date.now();
		const prevCoords = this.currentCoordinates;

		this.currentCoordinates = {
			x,
			y,
			timestamp: now
		};

		// Calculate velocity for momentum
		if (prevCoords && now - this.lastMoveTime > 0) {
			const timeDelta = now - prevCoords.timestamp;
			this.velocity = {
				x: (x - prevCoords.x) / Math.max(timeDelta, 1),
				y: (y - prevCoords.y) / Math.max(timeDelta, 1)
			};
		}
		this.lastMoveTime = now;

		const deltaX = x - this.startCoordinates.x;
		const deltaY = y - this.startCoordinates.y;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// Check if movement exceeds touch slop threshold
		if (!this.isSwiping && distance > this.options.touchSlop) {
			this.isSwiping = true;
		}

		// Use requestAnimationFrame for smooth callback execution
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
		}

		this.rafId = requestAnimationFrame(() => {
			this.callbacks.onSwipeMove?.(this.currentCoordinates!, {
				x: deltaX,
				y: deltaY
			});
		});
	}

	/**
	 * End gesture tracking and determine result
	 */
	private endGesture(): void {
		if (!this.isTracking || !this.startCoordinates || !this.currentCoordinates) {
			this.resetGesture();
			return;
		}

		const deltaX = this.currentCoordinates.x - this.startCoordinates.x;
		const deltaY = this.currentCoordinates.y - this.startCoordinates.y;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		const duration = this.currentCoordinates.timestamp - this.startCoordinates.timestamp;

		let result: SwipeResult | null = null;

		// Enhanced swipe detection with velocity consideration
		const velocityMagnitude = Math.sqrt(
			this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y
		);
		const minDistance = Math.max(
			this.options.minSwipeDistance,
			velocityMagnitude > 0.5 ? 30 : this.options.minSwipeDistance
		);

		if (
			this.isSwiping &&
			(distance >= minDistance || velocityMagnitude > 0.8) &&
			duration <= this.options.maxSwipeTime
		) {
			// Determine primary direction
			const absX = Math.abs(deltaX);
			const absY = Math.abs(deltaY);

			let direction: SwipeDirection;
			if (absX > absY) {
				direction = deltaX > 0 ? 'right' : 'left';
			} else {
				direction = deltaY > 0 ? 'down' : 'up';
			}

			result = {
				direction,
				distance,
				duration,
				velocity: Math.max(distance / Math.max(duration, 1), velocityMagnitude)
			};

			this.callbacks.onSwipe?.(result);
		} else if (!this.isSwiping && distance <= this.options.touchSlop) {
			// Register as tap if minimal movement
			this.callbacks.onTap?.(this.startCoordinates);
		}

		this.callbacks.onSwipeEnd?.(result);
		this.resetGesture();
	}

	/**
	 * Reset gesture state
	 */
	private resetGesture(): void {
		this.startCoordinates = null;
		this.currentCoordinates = null;
		this.isTracking = false;
		this.isSwiping = false;
		this.velocity = { x: 0, y: 0 };
		this.lastMoveTime = 0;

		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	/**
	 * Update detector options
	 */
	public updateOptions(options: Partial<SwipeOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Clean up event listeners
	 */
	public destroy(): void {
		this.detachListeners();
		this.resetGesture();
	}
}

/**
 * Convenience function to create and attach swipe gesture detector
 */
export function createSwipeDetector(
	element: HTMLElement,
	callbacks: SwipeCallbacks,
	options?: SwipeOptions
): SwipeGestureDetector {
	return new SwipeGestureDetector(element, callbacks, options);
}

/**
 * Svelte action for swipe gesture detection
 */
export function swipe(
	element: HTMLElement,
	params: { callbacks: SwipeCallbacks; options?: SwipeOptions }
) {
	let detector: SwipeGestureDetector;

	function createDetector() {
		detector = new SwipeGestureDetector(element, params.callbacks, params.options);
	}

	function destroyDetector() {
		if (detector) {
			detector.destroy();
		}
	}

	createDetector();

	return {
		update(newParams: { callbacks: SwipeCallbacks; options?: SwipeOptions }) {
			destroyDetector();
			params = newParams;
			createDetector();
		},
		destroy() {
			destroyDetector();
		}
	};
}

/**
 * Helper function to determine if horizontal swipe
 */
export function isHorizontalSwipe(direction: SwipeDirection): boolean {
	return direction === 'left' || direction === 'right';
}

/**
 * Helper function to determine if vertical swipe
 */
export function isVerticalSwipe(direction: SwipeDirection): boolean {
	return direction === 'up' || direction === 'down';
}

/**
 * Helper function to get opposite direction
 */
export function getOppositeDirection(direction: SwipeDirection): SwipeDirection {
	const opposites: Record<SwipeDirection, SwipeDirection> = {
		left: 'right',
		right: 'left',
		up: 'down',
		down: 'up'
	};
	return opposites[direction];
}
