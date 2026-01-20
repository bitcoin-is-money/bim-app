export interface PageVisibilityCallbacks {
	onVisibilityChange: (isVisible: boolean) => void;
}

export class PageVisibilityManager {
	private isPageVisible = true;
	private callbacks: PageVisibilityCallbacks[] = [];

	constructor() {
		this.setupVisibilityListener();
	}

	private setupVisibilityListener() {
		if (typeof document !== 'undefined' && 'visibilityState' in document) {
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
			this.isPageVisible = !document.hidden;
		}
	}

	private handleVisibilityChange = () => {
		const wasVisible = this.isPageVisible;
		this.isPageVisible = !document.hidden;

		console.log('📱 Page visibility changed:', {
			wasVisible,
			nowVisible: this.isPageVisible,
			documentHidden: document.hidden,
			timestamp: new Date().toISOString()
		});

		this.callbacks.forEach((callback) => {
			callback.onVisibilityChange(this.isPageVisible);
		});
	};

	public addCallback(callback: PageVisibilityCallbacks) {
		this.callbacks.push(callback);
	}

	public removeCallback(callback: PageVisibilityCallbacks) {
		const index = this.callbacks.indexOf(callback);
		if (index > -1) {
			this.callbacks.splice(index, 1);
		}
	}

	public getVisibility(): boolean {
		return this.isPageVisible;
	}

	public destroy() {
		if (typeof document !== 'undefined' && 'visibilityState' in document) {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		}
		this.callbacks = [];
	}
}
