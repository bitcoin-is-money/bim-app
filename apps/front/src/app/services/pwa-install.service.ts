import {computed, inject, Injectable, NgZone, signal} from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

interface RelatedApplication {
  readonly id?: string;
  readonly platform: string;
  readonly url?: string;
  readonly version?: string;
}

interface NavigatorWithRelatedApps extends Navigator {
  getInstalledRelatedApps?(): Promise<RelatedApplication[]>;
}

export type PwaPlatform = 'ios' | 'android' | 'chromium-desktop' | 'firefox' | 'other';

export type PwaPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Tracks PWA install state and exposes an imperative install prompt.
 *
 * - `isStandalone` is true when the app currently runs from an installed
 *   icon (display-mode: standalone, or iOS `navigator.standalone`).
 * - `installedRemotely` is true when the Chromium-only
 *   `navigator.getInstalledRelatedApps()` API reports our PWA as
 *   installed somewhere on the device, even if the current tab is a
 *   regular browser tab. Used to detect installation from outside the
 *   standalone window.
 * - `isInstalled` is the union: either running standalone, or known to
 *   be installed somewhere on the device.
 * - `canInstall` is true only on Chromium-based browsers that fired a
 *   `beforeinstallprompt` event we captured for later use.
 * - `platform` is a coarse UA classification used to pick the right copy
 *   (Android/Chromium can prompt natively, iOS needs an instructions hint,
 *   Firefox desktop has no install story at all).
 */
@Injectable({providedIn: 'root'})
export class PwaInstallService {

  private readonly zone = inject(NgZone);

  private readonly standalone = signal(this.detectStandalone());
  private readonly installedRemotely = signal(false);
  private deferredPrompt: BeforeInstallPromptEvent | undefined = undefined;

  readonly isStandalone = this.standalone.asReadonly();
  readonly canInstall = signal(false);
  readonly platform = signal<PwaPlatform>(this.detectPlatform());
  readonly isInstalled = computed(() => this.standalone() || this.installedRemotely());

  constructor() {
    if (globalThis.window === undefined) {
      return;
    }

    const mq = globalThis.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', (event) => {
      this.zone.run(() => this.standalone.set(event.matches || this.iosStandalone()));
    });

    globalThis.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.zone.run(() => {
        this.deferredPrompt = event as BeforeInstallPromptEvent;
        this.canInstall.set(true);
      });
    });

    globalThis.addEventListener('appinstalled', () => {
      this.zone.run(() => {
        this.deferredPrompt = undefined;
        this.canInstall.set(false);
        this.standalone.set(true);
      });
    });
  }

  /**
   * Async initialization. Wired via `provideAppInitializer` in app.config.ts —
   * kept out of the constructor so it can be awaited at boot time and to
   * satisfy "no async work in constructor" lint rule.
   */
  async init(): Promise<void> {
    if (globalThis.window === undefined) return;
    await this.checkRelatedApps();
  }

  /**
   * Uses the Chromium `getInstalledRelatedApps` API to detect whether
   * our own PWA is already installed on this device, even when the
   * current page runs in a regular browser tab (not standalone).
   *
   * Silently no-ops on browsers without the API (Firefox, Safari).
   */
  private async checkRelatedApps(): Promise<void> {
    const nav = globalThis.navigator as NavigatorWithRelatedApps | undefined;
    if (nav?.getInstalledRelatedApps === undefined) {
      return;
    }
    try {
      const apps = await nav.getInstalledRelatedApps();
      this.zone.run(() => this.installedRemotely.set(apps.length > 0));
    } catch (error) {
      console.error('getInstalledRelatedApps failed', error);
    }
  }

  async promptInstall(): Promise<PwaPromptOutcome> {
    const event = this.deferredPrompt;
    if (!event) {
      return 'unavailable';
    }
    try {
      await event.prompt();
      const result = await event.userChoice;
      this.deferredPrompt = undefined;
      this.canInstall.set(false);
      return result.outcome;
    } catch (error) {
      console.error('PWA install prompt failed', error);
      return 'unavailable';
    }
  }

  private detectStandalone(): boolean {
    if (globalThis.window === undefined) {
      return false;
    }
    return globalThis.matchMedia('(display-mode: standalone)').matches || this.iosStandalone();
  }

  private iosStandalone(): boolean {
    if (globalThis.navigator === undefined) {
      return false;
    }
    const nav = globalThis.navigator as Navigator & {standalone?: boolean};
    return nav.standalone === true;
  }

  private detectPlatform(): PwaPlatform {
    if (globalThis.navigator === undefined) {
      return 'other';
    }
    const ua = globalThis.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      return 'ios';
    }
    if (/android/.test(ua)) {
      return 'android';
    }
    if (/firefox/.test(ua)) {
      return 'firefox';
    }
    if (/chrome|chromium|edg/.test(ua)) {
      return 'chromium-desktop';
    }
    return 'other';
  }
}
