import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
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

export type PwaPlatform = 'ios' | 'android' | 'desktop' | 'other';

export type PwaPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Tracks PWA install state and exposes an imperative install prompt.
 *
 * - `isStandalone` — app currently runs from an installed icon
 *   (display-mode: standalone, or iOS `navigator.standalone`).
 * - `installedRemotely` — Chromium-only `navigator.getInstalledRelatedApps()`
 *   reports our PWA as installed somewhere on the device, even when the
 *   current tab is a regular browser tab.
 * - `isInstalled` — union: standalone OR known installed remotely.
 * - `canInstall` — a `beforeinstallprompt` event was captured; calling
 *   `promptInstall()` will show the native install dialog.
 * - `platform` — coarse OS classification only (`ios | android | desktop
 *   | other`). No assumptions about which browser supports what: if
 *   `canInstall` is false, UI falls back to generic per-OS instructions.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly standalone = signal(false);
  private readonly installedRemotely = signal(false);
  private readonly canInstallSignal = signal(false);
  private readonly platformSignal = signal<PwaPlatform>(this.detectPlatform());
  private deferredPrompt: BeforeInstallPromptEvent | undefined = undefined;

  readonly isStandalone = this.standalone.asReadonly();
  readonly canInstall = this.canInstallSignal.asReadonly();
  readonly platform = this.platformSignal.asReadonly();
  readonly isInstalled = computed(() => this.standalone() || this.installedRemotely());

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    const standaloneMediaQuery = globalThis.matchMedia('(display-mode: standalone)');
    const syncStandalone = (): void => {
      this.standalone.set(standaloneMediaQuery.matches || this.iosStandalone());
    };
    syncStandalone();
    standaloneMediaQuery.addEventListener('change', syncStandalone);

    globalThis.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstallSignal.set(true);
    });

    globalThis.addEventListener('appinstalled', () => {
      this.deferredPrompt = undefined;
      this.canInstallSignal.set(false);
      this.standalone.set(true);
    });
  }

  async init(): Promise<void> {
    if (!this.isBrowser) return;
    await this.checkRelatedApps();
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
      this.canInstallSignal.set(false);
      return result.outcome;
    } catch (error) {
      console.error('PWA install prompt failed', error);
      return 'unavailable';
    }
  }

  private async checkRelatedApps(): Promise<void> {
    const nav = globalThis.navigator as NavigatorWithRelatedApps;
    if (nav.getInstalledRelatedApps === undefined) {
      return;
    }
    try {
      const apps = await nav.getInstalledRelatedApps();
      this.installedRemotely.set(apps.length > 0);
    } catch (error) {
      console.error('getInstalledRelatedApps failed', error);
    }
  }

  private iosStandalone(): boolean {
    const nav = globalThis.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  }

  private detectPlatform(): PwaPlatform {
    if (!this.isBrowser) {
      return 'other';
    }
    const ua = globalThis.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      return 'ios';
    }
    if (ua.includes('android')) {
      return 'android';
    }
    if (/windows|macintosh|linux|cros/.test(ua)) {
      return 'desktop';
    }
    return 'other';
  }
}
